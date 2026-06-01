use diesel::r2d2::{ConnectionManager, Pool};
use diesel::pg::PgConnection;
use diesel::Connection;
use std::env;


pub type DbPool = Pool<ConnectionManager<PgConnection>>;

pub fn create_pool() -> DbPool {
    let user = env::var("POSTGRES_USER").expect("POSTGRES_USER must be set");
    let password = env::var("POSTGRES_PASSWORD").expect("POSTGRES_PASSWORD must be set");
    let db_name = env::var("POSTGRES_DB").expect("POSTGRES_DB must be set");
    let host = env::var("POSTGRES_HOST").unwrap_or_else(|_| "db".to_string());
    let port = env::var("POSTGRES_PORT").unwrap_or_else(|_| "5432".to_string());
    let ssl_mode = env::var("POSTGRES_SSLMODE").unwrap_or_else(|_| "prefer".to_string());
    let database_url = format!(
        "postgresql://{}:{}@{}:{}/{}?sslmode={}",
        user, password, host, port, db_name, ssl_mode
    );
    let manager = ConnectionManager::<PgConnection>::new(&database_url);
    Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create database pool")
}

pub fn establish_connection() -> PgConnection {
    let user = env::var("POSTGRES_USER").expect("POSTGRES_USER must be set");
    let password = env::var("POSTGRES_PASSWORD").expect("POSTGRES_PASSWORD must be set");
    let db_name = env::var("POSTGRES_DB").expect("POSTGRES_DB must be set");
    let host = env::var("POSTGRES_HOST").unwrap_or_else(|_| "db".to_string());
    let port = env::var("POSTGRES_PORT").unwrap_or_else(|_| "5432".to_string());

    // Add SSL mode for managed database connections (e.g., DigitalOcean)
    let ssl_mode = env::var("POSTGRES_SSLMODE").unwrap_or_else(|_| "prefer".to_string());
    let database_url = format!(
        "postgresql://{}:{}@{}:{}/{}?sslmode={}",
        user, password, host, port, db_name, ssl_mode
    );

    PgConnection::establish(&database_url)
        .unwrap_or_else(|e| panic!("Error connecting to {database_url} {e}"))
}
