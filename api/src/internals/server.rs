use crate::db;
use crate::internals::config::{AppConfig, ConfiguredApiUrl};
use crate::internals::mork::spawn_mork_server;
use crate::internals::routes::{build_info, dist, index, submit_setup};
#[cfg(feature = "sqlite")]
use crate::MIGRATIONS;
#[cfg(all(feature = "postgres", not(feature = "sqlite")))]
use crate::MIGRATIONS;
#[cfg(all(feature = "postgres", not(feature = "sqlite")))]
use diesel::pg::PgConnection as DbConnection;
#[cfg(feature = "sqlite")]
use diesel::sqlite::SqliteConnection as DbConnection;
use diesel_migrations::MigrationHarness;
use rocket::http::Method;
use rocket::{routes, Build, Rocket};
use rocket_cors::AllowedOrigins;
use url::Url;

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
    let allowed_origins = AllowedOrigins::some_exact(&[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]);
    let cors = rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get, Method::Post, Method::Options]
            .into_iter()
            .map(From::from)
            .collect(),
        ..Default::default()
    }
    .to_cors()
    .unwrap();
    let figment = rocket::Config::figment()
        .merge(("port", port))
        .merge(("address", address))
        .merge(("log_level", rocket::config::LogLevel::Normal));
    #[cfg(feature = "frontend")]
    let server = rocket::custom(figment)
        .mount("/", routes![index, dist, submit_setup, build_info])
        .attach(cors.clone())
        .manage(cors)
        .manage(tx)
        .manage(ConfiguredApiUrl(full_url))
        .ignite()
        .await
        .expect("Failed to ignite setup server");
    #[cfg(not(feature = "frontend"))]
    let server = rocket::custom(figment)
        .mount("/", routes![submit_setup, build_info])
        .attach(cors.clone())
        .manage(cors)
        .manage(tx)
        .manage(ConfiguredApiUrl(full_url))
        .ignite()
        .await
        .expect("Failed to ignite setup server");
    let _ = server.launch().await;
    rx.recv().await.expect("Failed to receive configuration")
}

pub fn build_rocket(cfg: &AppConfig) -> Rocket<Build> {
    dotenv::dotenv().ok();
    let mut connection: DbConnection = db::establish_connection();
    connection
        .run_pending_migrations(MIGRATIONS)
        .expect("Failed to run migrations");
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
    #[cfg(feature = "frontend")]
    let rocket = rocket::custom(figment)
        .mount(
            "/api",
            routes![
                crate::routes::translations::create_from_csv,
                crate::routes::translations::create_from_nt,
                crate::routes::translations::create_from_jsonld,
                crate::routes::translations::create_from_n3,
                crate::routes::tokens::get_all,
                crate::routes::tokens::get,
                crate::routes::tokens::create,
                crate::routes::tokens::update,
                crate::routes::tokens::delete,
                crate::routes::tokens::delete_batch,
                crate::routes::spaces::read,
                crate::routes::spaces::import,
                crate::routes::spaces::transform,
                crate::routes::spaces::upload,
                crate::routes::spaces::explore,
                crate::routes::spaces::export,
                crate::routes::spaces::clear,
                crate::routes::spaces::composition,
                crate::routes::spaces::intersection,
                crate::routes::spaces::union,
                build_info,
            ],
        )
        .attach(cors.clone())
        .manage(cors)
        .mount("/", routes![index, dist]);
    #[cfg(not(feature = "frontend"))]
    let rocket = rocket::custom(figment)
        .mount(
            "/api",
            routes![
                crate::routes::translations::create_from_csv,
                crate::routes::translations::create_from_nt,
                crate::routes::translations::create_from_jsonld,
                crate::routes::translations::create_from_n3,
                crate::routes::tokens::get_all,
                crate::routes::tokens::get,
                crate::routes::tokens::create,
                crate::routes::tokens::update,
                crate::routes::tokens::delete,
                crate::routes::tokens::delete_batch,
                crate::routes::spaces::read,
                crate::routes::spaces::import,
                crate::routes::spaces::transform,
                crate::routes::spaces::upload,
                crate::routes::spaces::explore,
                crate::routes::spaces::export,
                crate::routes::spaces::clear,
                crate::routes::spaces::composition,
                crate::routes::spaces::intersection,
                crate::routes::spaces::union,
                build_info,
            ],
        )
        .attach(cors.clone())
        .manage(cors);
    rocket
}

pub async fn rocket(cfg: &AppConfig) -> Rocket<Build> {
    spawn_mork_server(&cfg.mork_server_url).await;
    build_rocket(cfg)
}
