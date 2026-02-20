pub mod assets;
pub mod config;
pub mod mork;
pub mod routes;
pub mod server;

pub use config::{AppConfig, ConfiguredApiUrl};
pub use server::{launch_setup_server, rocket};
