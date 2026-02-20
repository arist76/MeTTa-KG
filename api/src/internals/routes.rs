use diesel::Connection;
use rocket::{form::Form, get, http::ContentType, post, response::status, Shutdown, State};
use std::path::PathBuf;
use tokio::sync::mpsc::Sender;

use crate::internals::assets::UiAssets;
use crate::internals::config::{AppConfig, ConfiguredApiUrl};

#[cfg(feature = "frontend")]
#[get("/")]
pub fn index() -> Option<(ContentType, Vec<u8>)> {
    UiAssets::get("index.html").map(|data| (ContentType::HTML, data.data.into_owned()))
}

#[cfg(not(feature = "frontend"))]
#[get("/")]
pub fn index() -> Option<(ContentType, Vec<u8>)> {
    None
}

#[cfg(feature = "frontend")]
#[get("/<file..>", rank = 2)]
pub fn dist(file: PathBuf) -> Option<(ContentType, Vec<u8>)> {
    let filename = file.to_str()?;

    if let Some(data) = UiAssets::get(filename) {
        use mime_guess::from_path;

        let mime = from_path(filename).first_or_octet_stream();
        let mime_str = mime.to_string();

        let content_type = ContentType::parse_flexible(&mime_str).unwrap_or(ContentType::Binary);
        return Some((content_type, data.data.into_owned()));
    }

    if !filename.starts_with("api") && !filename.starts_with("assets") {
        UiAssets::get("index.html").map(|data| (ContentType::HTML, data.data.into_owned()))
    } else {
        None
    }
}

#[cfg(not(feature = "frontend"))]
#[get("/<file..>", rank = 2)]
pub fn dist(file: PathBuf) -> Option<(ContentType, Vec<u8>)> {
    None
}

#[derive(rocket::FromForm)]
pub struct SetupForm {
    pub database_url: String,
    pub mork_server_url: String,
}

#[cfg(feature = "sqlite")]
fn test_connection(url: &str) -> Result<(), String> {
    diesel::sqlite::SqliteConnection::establish(url)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(all(feature = "postgres", not(feature = "sqlite")))]
fn test_connection(url: &str) -> Result<(), String> {
    diesel::pg::PgConnection::establish(url)
        .map(|_| ())
        .map_err(|e| {
            let err_msg = e.to_string();
            if err_msg.contains("could not translate host name") {
                format!(
                    "{}. If running locally, try local host instead of db",
                    err_msg
                )
            } else {
                err_msg
            }
        })
}

#[post("/submit", data = "<form>")]
pub async fn submit_setup(
    form: Form<SetupForm>,
    tx: &State<Sender<AppConfig>>,
    api_url: &State<ConfiguredApiUrl>,
    shutdown: Shutdown,
) -> Result<(), status::BadRequest<String>> {
    if let Err(e) = test_connection(&form.database_url) {
        println!("Connection test failed: {e}");
        return Err(status::BadRequest(format!("Databse connect failed: {e}")));
    }

    let config = AppConfig {
        database_url: form.database_url.clone(),
        mork_server_url: form.mork_server_url.clone(),
        mettakg_api_url: api_url.0.clone(),
    };

    if (tx.send(config).await).is_err() {
        return Err(status::BadRequest(
            "Failed to process configuration internally".to_string(),
        ));
    }

    shutdown.notify();
    Ok(())
}

#[derive(serde::Serialize)]
pub struct BuildInfo {
    pub db_type: &'static str,
    pub port_8001_process: Option<String>,
    pub is_mork: bool,
}
fn get_process_on_port_8001() -> Option<String> {
    #[cfg(unix)]
    {
        use std::process::Command;
        let output = Command::new("lsof")
            .args(["-i", ":8001", "-sTCP:LISTEN", "-F", "c"])
            .output()
            .ok()?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(stripped) = line.strip_prefix('c') {
                    let name = stripped.to_string();
                    if name.to_lowercase().contains("mork") {
                        return Some(name);
                    }
                    return Some(format!("{} (External)", name));
                }
            }
        }
    }
    if std::net::TcpListener::bind("127.0.0.1:8001").is_err() {
        return Some("Unknown (Port in use)".to_string());
    }
    None
}
#[get("/build-info")]
pub fn build_info() -> rocket::serde::json::Json<BuildInfo> {
    let db_type = if cfg!(feature = "sqlite") {
        "sqlite"
    } else {
        "postgres"
    };
    let port_8001_process = get_process_on_port_8001();
    let is_mork = port_8001_process
        .as_ref()
        .map(|s| s.to_lowercase().contains("mork"))
        .unwrap_or(false);
    rocket::serde::json::Json(BuildInfo {
        db_type,
        port_8001_process,
        is_mork,
    })
}
