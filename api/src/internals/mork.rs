use std::{env, fs, io::Write};
use tempfile::Builder;
use tokio::time::Duration;

use crate::internals::assets::MORK_BYTES;

#[cfg(feature = "mork")]
pub async fn spawn_mork_server(mork_url: &str) {
    let url = url::Url::parse(mork_url).expect("Invalid Mork server URL");
    let port = url.port().expect("URL must include a port").to_string();
    let host = url.host_str().expect("URL must include a host").to_string();

    let is_port_available = if host == "127.0.0.1" || host == "localhost" {
        std::net::TcpListener::bind(format!("{}:{}", host, port)).is_ok()
    } else {
        false
    };

    if !is_port_available {
        println!("Port {} is in use or host is remote. Skipping Mork spawn and connecting to existing instance at {}.", port, mork_url);
        env::set_var("METTA_KG_MORK_URL", mork_url);
        return;
    }

    let temp_file = Builder::new()
        .prefix("mork_server_")
        .suffix(if cfg!(windows) { ".exe" } else { "" })
        .tempfile()
        .expect("Failed to create temporary file");

    temp_file
        .as_file()
        .write_all(MORK_BYTES)
        .expect("Failed to write mork binary to temp file");

    temp_file
        .as_file()
        .sync_all()
        .expect("Failed to sync mork binary");

    let temp_path = temp_file.into_temp_path();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&temp_path)
            .expect("Failed to get file metadata")
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&temp_path, perms).expect("Failed to set executable permissions");
    }

    tokio::spawn(async move {
        let mut cmd = tokio::process::Command::new(&temp_path);

        cmd.env("MORK_SERVER_PORT", &port);
        cmd.env("MORK_SERVER_ADDR", &host);

        cmd.kill_on_drop(true);
        match cmd.spawn() {
            Ok(mut child) => {
                println!("Mork server started with PID: {:?}", child.id());
                match child.wait().await {
                    Ok(status) => {
                        if !status.success() {
                            eprintln!("Mork server exited unexpectedly with status: {}", status);
                        } else {
                            println!("Mork server exited successfully");
                        }
                    }
                    Err(e) => eprintln!("Failed to wait on Mork server: {e}"),
                }
            }
            Err(e) => eprintln!("Failed to start Mork server: {e}"),
        }
    });

    println!("Waiting for Mork server to start...");
    tokio::time::sleep(Duration::from_secs(2)).await;

    env::set_var("METTA_KG_MORK_URL", mork_url);
}

#[cfg(not(feature = "mork"))]
pub async fn spawn_mork_server(mork_url: &str) {
    use reqwest::Client;

    println!("Mork embedding disabled. Validating external MORK server at {mork_url}");

    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("Failed to create HTTP client");

    match client.get(mork_url).send().await {
        Ok(response) => {
            println!(
                "External Mork server is reachable status: {:?}",
                response.status()
            )
        }
        Err(e) => {
            panic!("Could not reach MORK server at {mork_url} : {e}");
        }
    }

    env::set_var("METTA_KG_MORK_URL", mork_url);
}
