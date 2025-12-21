pub mod cli;
pub mod db;
pub mod model;
pub mod mork_api;
pub mod routes;
pub mod schema;

use crate::cli::AppConfig;
use crate::routes::mork_manager::{MorkManager, SpawnRequest, list_instances, spawn_mork, select_instance}; // Add select_instance
use diesel::Connection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use mime_guess::from_path;
use rocket::form::Form;
use rocket::response::status;
use rocket::Shutdown;
use rocket::State;
use rocket::{get, http::ContentType, post};
use rocket::{http::Method, routes, Build, Rocket};
use rocket_cors::AllowedOrigins;
use rust_embed::RustEmbed;
use std::path::PathBuf;
use tokio::sync::mpsc::Sender;
use url::Url;

#[cfg(feature = "sqlite")]
use diesel::sqlite::SqliteConnection as DbConnection;

#[cfg(all(feature = "postgres", not(feature = "sqlite")))]
use diesel::pg::PgConnection as DbConnection;

#[cfg(feature = "sqlite")]
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/sqlite");

#[cfg(all(feature = "postgres", not(feature = "sqlite")))]
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/postgres");

pub const MORK_BYTES: &[u8] = include_bytes!(env!("MORK_BINARY_PATH"));

#[derive(RustEmbed)]
#[folder = "ui-dist/"]
pub struct UiAssets;

struct ConfiguredApiUrl(String);

#[derive(rocket::FromForm)]
pub struct SetupForm {
    pub database_url: String,
    pub mork_server_url: String,
}

#[get("/")]
fn index() -> Option<(ContentType, Vec<u8>)> {
    UiAssets::get("index.html").map(|data| (ContentType::HTML, data.data.into_owned()))
}

#[get("/<file..>", rank = 2)]
fn dist(file: PathBuf) -> Option<(ContentType, Vec<u8>)> {
    let filename = file.to_str()?;

    if let Some(data) = UiAssets::get(filename) {
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

fn test_connection(url: &str) -> Result<(), String> {
    #[cfg(feature = "sqlite")]
    {
        diesel::sqlite::SqliteConnection::establish(url)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    #[cfg(all(feature = "postgres", not(feature = "sqlite")))]
    {
        diesel::pg::PgConnection::establish(url)
            .map(|_| ())
            .map_err(|e| {
                let err_msg = e.to_string();
                if err_msg.contains("could not translate host name") {
                    format!("{} (Hint: If running locally, try 'localhost' instead of docker service names like 'db')", err_msg)
                } else {
                    err_msg
                }
            })
    }

    #[cfg(not(any(feature = "sqlite", feature = "postgres")))]
    {
        println!("No database feature enabled");
        Err("No database feature enabled".to_string())
    }
}

#[post("/submit", data = "<form>")]
async fn submit_setup(
    form: Form<SetupForm>,
    tx: &State<Sender<AppConfig>>,
    api_url: &State<ConfiguredApiUrl>,
    shutdown: Shutdown,
) -> Result<(), status::BadRequest<String>> {
    if let Err(e) = test_connection(&form.database_url) {
        println!("Connection test failed: {}", e);
        return Err(status::BadRequest(format!(
            "Database connection failed: {}",
            e
        )));
    }

    let config = AppConfig {
        database_url: form.database_url.clone(),
        mork_server_url: form.mork_server_url.clone(),
        mettakg_api_url: api_url.0.clone(),
    };

    if (tx.send(config).await).is_err() {
        return Err(status::BadRequest(
            "Failed to process configuration internally.".to_string(),
        ));
    }

    shutdown.notify();
    Ok(())
}

#[derive(serde::Serialize)]
struct BuildInfo {
    db_type: &'static str,
    port_8001_process: Option<String>,
    is_mork: bool,
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
fn build_info() -> rocket::serde::json::Json<BuildInfo> {
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

pub async fn launch_setup_server(preferred_url: Option<String>) -> AppConfig {
    let (address, port, full_url) = if let Some(url_str) = preferred_url {
        let url_str = if !url_str.contains("://") {
            format!("http://{}", url_str)
        } else {
            url_str
        };

        match Url::parse(&url_str) {
            Ok(url) => (
                url.host_str().unwrap_or("127.0.0.1").to_string(),
                url.port().unwrap_or(8000),
                url_str,
            ),
            Err(_) => (
                "127.0.0.1".to_string(),
                8000,
                "http://127.0.0.1:8000".to_string(),
            ),
        }
    } else {
        (
            "127.0.0.1".to_string(),
            8000,
            "http://127.0.0.1:8000".to_string(),
        )
    };

    let (tx, mut rx) = tokio::sync::mpsc::channel::<AppConfig>(1);

    let figment = rocket::Config::figment()
        .merge(("port", port))
        .merge(("address", address))
        .merge(("log_level", rocket::config::LogLevel::Normal));

    let server = rocket::custom(figment)
        .mount("/", routes![index, dist, submit_setup, build_info])
        .manage(tx)
        .manage(ConfiguredApiUrl(full_url))
        .ignite()
        .await
        .expect("Failed to ignite setup server");

    let _ = server.launch().await;

    rx.recv().await.expect("Failed to receive configuration")
}

async fn build_rocket(cfg: &AppConfig) -> Rocket<Build> {
    dotenv::dotenv().ok();

    let mut connection: DbConnection = db::establish_connection();
    connection
        .run_pending_migrations(MIGRATIONS)
        .expect("Failed to run migrations");

    let mork_manager = MorkManager::new(MORK_BYTES);

    if let Ok(url) = url::Url::parse(&cfg.mork_server_url) {
        if let (Some(port), Some(host)) = (url.port(), url.host_str()) {
            // Normalize localhost to 127.0.0.1 to avoid IPv4/IPv6 binding mismatches
            let host = if host == "localhost" { "127.0.0.1" } else { host };

            println!("Booting initial Mork instance on {}:{} ...", host, port);

            match mork_manager
                .spawn_instance(SpawnRequest {
                    port,
                    host: Some(host.to_string()),
                    memory_limit_mb: None, // IMPORTANT: don't constrain boot
                    cpu_limit_percent: None,
                })
                .await
            {
                Ok(pid) => {
                    println!("Successfully spawned Mork on {}:{} (pid={})", host, port, pid);
                    
                    // CRITICAL FIX: 
                    // The MorkApiClient (used in routes) relies on this environment variable 
                    // to know where to connect. The old code set this, and we must restore it.
                    let effective_url = format!("http://{}:{}", host, port);
                    std::env::set_var("METTA_KG_MORK_URL", effective_url);
                },
                Err(e) => eprintln!("Failed to spawn initial Mork instance: {}", e),
            }
        }
    }
    let api_url = Url::parse(&cfg.mettakg_api_url).expect("Invalid mettakg_api_url");

    let dynamic_origin = format!(
        "{}://{}:{}",
        api_url.scheme(),
        api_url.host_str().unwrap_or("127.0.0.1"),
        api_url.port().unwrap_or(8000)
    );

    let mut origins = vec![
        "http://localhost:3000".to_string(),
        "http://localhost:8000".to_string(),
        "https://metta-kg.vercel.app".to_string(),
        "http://127.0.0.1:3000".to_string(),
        "http://127.0.0.1:8000".to_string(),
        "http://127.0.0.1:8080".to_string(),
    ];
    if !origins.contains(&dynamic_origin) {
        origins.push(dynamic_origin);
    }

    let allowed_origins =
        AllowedOrigins::some_exact(&origins.iter().map(|s| s.as_str()).collect::<Vec<_>>());

    let cors = rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get, Method::Post, Method::Delete, Method::Options]
            .into_iter()
            .map(From::from)
            .collect(),
        ..Default::default()
    }
    .to_cors()
    .unwrap();

    let host_str = api_url.host_str().unwrap_or("127.0.0.1");
    let host: std::net::IpAddr = if host_str == "localhost" {
        "127.0.0.1".parse().unwrap()
    } else {
        host_str.parse().expect("Invalid host IP address")
    };

    let port = api_url.port().unwrap_or(8000);

    let figment = rocket::Config::figment()
        .merge(("address", host))
        .merge(("port", port));

    rocket::custom(figment)
        .mount(
            "/api",
            routes![
                routes::translations::create_from_csv,
                routes::translations::create_from_nt,
                routes::translations::create_from_jsonld,
                routes::translations::create_from_n3,
                routes::tokens::get_all,
                routes::tokens::get,
                routes::tokens::create,
                routes::tokens::update,
                routes::tokens::delete,
                routes::tokens::delete_batch,
                routes::spaces::read,
                routes::spaces::import,
                routes::spaces::transform,
                routes::spaces::upload,
                routes::spaces::explore,
                routes::spaces::export,
                routes::spaces::clear,
                list_instances,
                spawn_mork,
                select_instance, // Add this line
            ],
        )
        .attach(cors.clone())
        .manage(cors)
        .manage(mork_manager)
        .mount("/", routes![index, dist])
}

pub async fn rocket(cfg: &AppConfig) -> Rocket<Build> {
    // spawn_mork_server(&cfg.mork_server_url).await;
    build_rocket(cfg).await
}
