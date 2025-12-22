use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use rocket::serde::json::Json;
use rocket::{delete, get, http::Status, patch, post, State};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessesToUpdate, System};

use tempfile::Builder;
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::sync::RwLock;

#[derive(Serialize, Clone)]
pub struct MorkInstanceInfo {
    pub id: String,
    pub port: u16,
    pub cpu: f32,
    pub cpu_limit: Option<f32>, // Added
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

#[derive(Deserialize, Clone)]
pub struct UpdateLimitsRequest {
    pub memory_limit_mb: Option<u64>,
    pub cpu_limit_percent: Option<f32>, // Added
}

pub struct ManagedInstance {
    pub port: u16,
    pub pid: u32,
    pub memory_limit: Option<u64>,
    pub cpu_limit: Option<f32>, // Added
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

    async fn wait_for_port_ready(
        host: &str,
        port: u16,
        child: &mut tokio::process::Child,
    ) -> Result<(), String> {
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

        Err(format!(
            "Mork did not start listening on {addr} within timeout"
        ))
    }

    // Helper for consistent units (MB)
    fn proc_mem_mb(proc_: &sysinfo::Process) -> u64 {
        proc_.memory() / 1024 / 1024
    }

    // NEW: Check memory usage and return error if exceeded (no killing)
    pub async fn check_resource_usage(&self, port: u16) -> Result<(), String> {
        let (pid_u32, limit_mb) = {
            let instances = self.instances.read().await;
            let Some(inst) = instances.get(&port) else {
                return Ok(());
            };
            let Some(limit) = inst.memory_limit else {
                return Ok(());
            };
            (inst.pid, limit)
        };

        let pid = Pid::from_u32(pid_u32);
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);

        if let Some(proc_) = sys.process(pid) {
            let mem_mb = Self::proc_mem_mb(proc_);
            if mem_mb > limit_mb {
                return Err(format!(
                    "Memory limit exceeded: {}MB > {}MB",
                    mem_mb, limit_mb
                ));
            }
        }
        Ok(())
    }

    // NEW: Kill a specific instance by port
    pub async fn kill_instance(&self, port: u16) -> Result<(), String> {
        let pid_u32 = {
            let instances = self.instances.read().await;
            instances
                .get(&port)
                .map(|i| i.pid)
                .ok_or("Instance not found")?
        };

        let pid = Pid::from_u32(pid_u32);
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);

        if let Some(proc) = sys.process(pid) {
            if proc.kill() {
                Ok(())
            } else {
                Err("Failed to send kill signal".to_string())
            }
        } else {
            Err("Process not running".to_string())
        }
    }

    // NEW: Update limits for an existing instance
    pub async fn update_limits(
        &self,
        port: u16,
        memory_limit_mb: Option<u64>,
        cpu_limit_percent: Option<f32>,
    ) -> Result<(), String> {
        let mut instances = self.instances.write().await;
        if let Some(inst) = instances.get_mut(&port) {
            inst.memory_limit = memory_limit_mb;
            inst.cpu_limit = cpu_limit_percent;
            Ok(())
        } else {
            Err("Instance not found".to_string())
        }
    }

    pub async fn spawn_instance(&self, req: SpawnRequest) -> Result<u32, String> {
        let host = req.host.clone().unwrap_or_else(|| "127.0.0.1".to_string());
        println!(
            "DEBUG: Attempting to spawn instance host={host} port={}",
            req.port
        );

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

        if let Err(e) = Self::wait_for_port_ready(&host, req.port, &mut child).await {
            eprintln!("DEBUG: Readiness probe failed: {e}");
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(e);
        }

        {
            let mut instances = self.instances.write().await;
            instances.insert(
                req.port,
                ManagedInstance {
                    port: req.port,
                    pid,
                    memory_limit: req.memory_limit_mb,
                    cpu_limit: req.cpu_limit_percent, // Added
                },
            );
        }

        // CHANGED: Removed the killing loop. Just wait for exit.
        let instances = Arc::clone(&self.instances);
        let port = req.port;

        tokio::spawn(async move {
            match child.wait().await {
                Ok(status) => eprintln!("MORK [{pid}] exited (port={port}) with status: {status}"),
                Err(e) => eprintln!("MORK [{pid}] wait() failed (port={port}): {e}"),
            }

            let mut map = instances.write().await;
            map.remove(&port);
        });

        println!(
            "DEBUG: Spawn complete and registered pid={pid} port={}",
            req.port
        );
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
                    (proc_.cpu_usage(), Self::proc_mem_mb(proc_))
                } else {
                    (0.0, 0)
                };

                MorkInstanceInfo {
                    id: inst.pid.to_string(),
                    port: *port,
                    cpu,
                    cpu_limit: inst.cpu_limit, // Added
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
        }
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

// NEW: Route to kill an instance
#[delete("/mork/kill/<port>")]
pub async fn kill_mork(
    manager: &State<MorkManager>,
    port: u16,
) -> Result<Status, (Status, String)> {
    match manager.kill_instance(port).await {
        Ok(_) => Ok(Status::Ok),
        Err(e) => Err((Status::NotFound, e)),
    }
}

// NEW: Route to update instance limits
#[patch("/mork/update/<port>", data = "<req>")]
pub async fn update_mork_limits(
    manager: &State<MorkManager>,
    port: u16,
    req: Json<UpdateLimitsRequest>,
) -> Result<Status, (Status, String)> {
    match manager
        .update_limits(port, req.memory_limit_mb, req.cpu_limit_percent)
        .await
    {
        Ok(_) => Ok(Status::Ok),
        Err(e) => Err((Status::NotFound, e)),
    }
}
