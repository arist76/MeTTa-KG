pub mod cli;
pub mod db;
pub mod internals;
pub mod model;
pub mod mork_api;
pub mod routes;
pub mod schema;

use diesel_migrations::{embed_migrations, EmbeddedMigrations};
pub use internals::*;

#[cfg(feature = "sqlite")]
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/sqlite");

#[cfg(all(feature = "postgres", not(feature = "sqlite")))]
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/postgres");
