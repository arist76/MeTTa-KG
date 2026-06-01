use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use rocket::http::Method;
use rocket::routes;
use rocket::{Build, Rocket};
use rocket_cors::AllowedOrigins;
use std::env;

pub mod db;
pub use db::DbPool;
pub mod model;
pub mod mork_api;
pub mod routes;
pub mod schema;
pub mod sse_utils;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

pub fn rocket() -> Rocket<Build> {
    dotenv::dotenv().ok();

    let pool = db::create_pool();

    let mut connection = db::establish_connection().expect("Failed to connect to database for migrations");
    connection
        .run_pending_migrations(MIGRATIONS)
        .unwrap_or_else(|e| panic!("Failed to run database migrations: {e}"));

    // Configure CORS origins from environment variable
    let frontend_url = env::var("METTA_KG_FRONTEND_URL")
        .unwrap_or_else(|_| "https://metta-kg.vercel.app".to_string());

    let origins = ["http://localhost:3000".to_string(), frontend_url];

    let allowed_origins =
        AllowedOrigins::some_exact(&origins.iter().map(|s| s.as_str()).collect::<Vec<_>>());

    let cors = rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get, Method::Post, Method::Delete]
            .into_iter()
            .map(From::from)
            .collect(),
        ..Default::default()
    }
    .to_cors()
    .expect("Failed to configure CORS");

    rocket::build()
        .mount(
            "/",
            routes![
                routes::health::health,
                routes::translations::create_from_csv,
                routes::translations::create_from_nt,
                routes::translations::create_from_jsonld,
                routes::translations::create_from_n3,
                routes::translations::create_from_json,
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
                routes::spaces::composition,
                routes::spaces::intersection,
                routes::spaces::union,
            ],
        )
        .attach(routes::sse::stage())
        .attach(cors.clone())
        .manage(cors)
        .manage(pool)
}
