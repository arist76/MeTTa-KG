use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use rocket::serde::json::Json;
use rocket::{get, post, http::Status, State};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System, ProcessesToUpdate}; // Added ProcessesToUpdate

use tempfile::Builder;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::sync::RwLock;

#[derive(Serialize, Clone)]
pub struct MorkInstanceInfo {
    pub id: String,
    pub port: u16,
    pub cpu: f32,
    pub memory: u64,
    pub memory_limit: Option<u64>,
    pub status: String,
}

#[derive(Deserialize, Clone)]
pub struct SpawnRequest {
    pub port: u16,
    #[serde(default)]
    pub host: Option<String>,
    pub memory_limit_mb: Option<u64>,
    pub cpu_limit_percent: Option<f32>,
}

pub struct ManagedInstance {
    pub port: u16,
    pub pid: u32,
    pub memory_limit: Option<u64>,
}

pub struct MorkManager {
    instances: Arc<RwLock<HashMap<u16, ManagedInstance>>>,
    binary_path: PathBuf,
    _temp_file: Option<Arc<tempfile::TempPath>>,
}

impl MorkManager {
    pub fn new(binary_bytes: &[u8]) -> Self {
        println!("DEBUG: Initializing MorkManager...");
        let temp_file = Builder::new()
            .prefix("mork_server_")
            .suffix(if cfg!(windows) { ".exe" } else { "" })
            .tempfile()
            .expect("Failed to create temporary file for Mork binary");

        println!("DEBUG: Created temp file at {:?}", temp_file.path());

        temp_file
            .as_file()
            .write_all(binary_bytes)
            .expect("Failed to write Mork binary to temp file");
        
        temp_file
            .as_file()
            .sync_all()
            .expect("Failed to sync Mork binary");

        let temp_path = temp_file.into_temp_path();
        let binary_path = temp_path.to_path_buf();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(&binary_path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o755);
                let _ = std::fs::set_permissions(&binary_path, perms);
            }
        }

        Self {
            instances: Arc::new(RwLock::new(HashMap::new())),
            binary_path,
            _temp_file: Some(Arc::new(temp_path)),
        }
    }

    fn spawn_log_reader(
        prefix: &'static str,
        pid: u32,
        reader: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    ) {
        tokio::spawn(async move {
            let mut r = BufReader::new(reader);
            let mut line = String::new();
            loop {
                line.clear();
                match r.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => print!("{prefix} [{pid}]: {line}"),
                    Err(e) => {
                        eprintln!("{prefix} [{pid}]: <read error> {e}");
                        break;
                    }
                }
            }
            eprintln!("{prefix} [{pid}]: <stream closed>");
        });
    }

    async fn wait_for_port_ready(host: &str, port: u16, child: &mut tokio::process::Child) -> Result<(), String> {
        let addr = format!("{host}:{port}");
        println!("DEBUG: Waiting for Mork to listen on {addr} ...");

        for attempt in 1..=50 {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("Mork exited while starting (status={status})"));
            }

            match TcpStream::connect(&addr).await {
                Ok(_) => {
                    println!("DEBUG: Port {addr} is accepting connections (attempt {attempt}).");
                    return Ok(());
                }
                Err(e) => {
                    if attempt % 10 == 0 {
                        println!("DEBUG: Not ready yet (attempt {attempt}/50): {e}");
                    }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }

        Err(format!("Mork did not start listening on {addr} within timeout"))
    }

    pub async fn spawn_instance(&self, req: SpawnRequest) -> Result<u32, String> {
        let host = req.host.clone().unwrap_or_else(|| "127.0.0.1".to_string());
        println!("DEBUG: Attempting to spawn instance host={host} port={}", req.port);

        {
            let instances = self.instances.read().await;
            if instances.contains_key(&req.port) {
                return Err(format!("Port {} is already managed.", req.port));
            }
        }

        let is_local = host == "127.0.0.1" || host == "localhost";
        if !is_local {
            return Err(format!("Refusing to spawn on remote host '{host}'."));
        }

        if std::net::TcpListener::bind(format!("{host}:{}", req.port)).is_err() {
            return Err(format!("Port {} is already in use on {}", req.port, host));
        }

        let mut cmd = Command::new(&self.binary_path);
        cmd.env("MORK_SERVER_PORT", req.port.to_string());
        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped())
           .kill_on_drop(true);

        println!("DEBUG: Spawning process now...");
        let mut child = cmd.spawn().map_err(|e| format!("Spawn error: {e}"))?;
        let pid = child.id().ok_or("Failed to get PID")?;
        println!("DEBUG: Spawned PID={pid}");

        if let Some(stdout) = child.stdout.take() {
            Self::spawn_log_reader("MORK OUT", pid, stdout);
        }
        if let Some(stderr) = child.stderr.take() {
            Self::spawn_log_reader("MORK ERR", pid, stderr);
        }

        if let Err(e) = Self::wait_for_port_ready(&host, req.port, &mut child).await {
            eprintln!("DEBUG: Readiness probe failed: {e}");
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(e);
        }

        {
            let mut instances = self.instances.write().await;
            instances.insert(req.port, ManagedInstance {
                port: req.port,
                pid,
                memory_limit: req.memory_limit_mb,
            });
        }

        // --- ROBUST MONITORING LOOP ---
        let instances = Arc::clone(&self.instances);
        let port = req.port;
        let memory_limit = req.memory_limit_mb;

        tokio::spawn(async move {
            let mut sys = System::new();
            let sys_pid = Pid::from_u32(pid);
            // Check resources every 2 seconds
            let mut interval = tokio::time::interval(Duration::from_secs(2));

            loop {
                tokio::select! {
                    // 1. Wait for process exit
                    exit_status = child.wait() => {
                        match exit_status {
                            Ok(status) => eprintln!("MORK [{pid}] exited (port={port}) with status: {status}"),
                            Err(e) => eprintln!("MORK [{pid}] wait() failed (port={port}): {e}"),
                        }
                        break;
                    }
                    // 2. Monitor resources
                    _ = interval.tick() => {
                        if let Some(limit_mb) = memory_limit {
                            // Refresh only this process to be efficient
                            sys.refresh_processes(ProcessesToUpdate::Some(&[sys_pid]), true);
                            
                            if let Some(proc) = sys.process(sys_pid) {
                                // proc.memory() returns bytes
                                let mem_usage_mb = proc.memory() / 1024 / 1024;
                                
                                if mem_usage_mb > limit_mb {
                                    eprintln!("MORK [{pid}] exceeded memory limit ({mem_usage_mb}MB > {limit_mb}MB). Killing...");
                                    let _ = child.start_kill();
                                    // The loop will break on the next iteration via child.wait()
                                }
                            }
                        }
                    }
                }
            }

            let mut map = instances.write().await;
            map.remove(&port);
        });

        println!("DEBUG: Spawn complete and registered pid={pid} port={}", req.port);
        Ok(pid)
    }

    pub async fn get_metrics(&self) -> Vec<MorkInstanceInfo> {
        let instances = self.instances.read().await;
        let mut sys = System::new_all();
        sys.refresh_all();

        instances
            .iter()
            .map(|(port, inst)| {
                let pid = Pid::from_u32(inst.pid);
                let (cpu, mem) = if let Some(proc_) = sys.process(pid) {
                    (proc_.cpu_usage(), proc_.memory() / 1024 / 1024)
                } else {
                    (0.0, 0)
                };

                MorkInstanceInfo {
                    id: inst.pid.to_string(),
                    port: *port,
                    cpu,
                    memory: mem,
                    memory_limit: inst.memory_limit,
                    status: "running".to_string(),
                }
            })
            .collect()
    }
}

#[get("/mork/instances")]
pub async fn list_instances(manager: &State<MorkManager>) -> Json<Vec<MorkInstanceInfo>> {
    Json(manager.get_metrics().await)
}

#[post("/mork/spawn", data = "<req>")]
pub async fn spawn_mork(
    manager: &State<MorkManager>,
    req: Json<SpawnRequest>,
) -> Result<Status, (Status, String)> {
    let request = req.into_inner();
    let port = request.port;

    match manager.spawn_instance(request).await {
        Ok(_) => {
            let url = format!("http://127.0.0.1:{}", port);
            std::env::set_var("METTA_KG_MORK_URL", &url);
            std::env::set_var("MORK_SERVER_PORT", port.to_string());
            
            println!("DEBUG: Auto-selected new Mork instance at {}", url);
            Ok(Status::Created)
        },
        Err(e) => Err((Status::Conflict, e)),
    }
}

#[post("/mork/select/<port>")]
pub async fn select_instance(port: u16) -> Status {
    let url = format!("http://127.0.0.1:{}", port);
    std::env::set_var("METTA_KG_MORK_URL", &url);
    std::env::set_var("MORK_SERVER_PORT", port.to_string());
    
    println!("DEBUG: Selected Mork instance switched to {}", url);
    Status::Ok
}