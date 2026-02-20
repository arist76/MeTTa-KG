#[cfg(all(feature = "sqlite", feature = "postgres"))]
compile_error!("Cannot enable both sqlite and postgres features simultaneously");

#[cfg(not(any(feature = "sqlite", feature = "postgres")))]
compile_error!("Must enable at least one database feature sqlite or postgres");

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub mork_server_url: String,
    pub mettakg_api_url: String,
}

pub struct ConfiguredApiUrl(pub String);

#[cfg(feature = "postgres")]
pub fn from_env_vars() -> Option<AppConfig> {
    let db_url = std::env::var("DATABASE_URL").ok()?;
    let mork_url = std::env::var("MORK_SERVER_URL").ok()?;
    let api_url =
        std::env::var("METTAKG_API_URL").unwrap_or_else(|_| "http://127.0.0.1:8000".to_string());

    Some(AppConfig {
        database_url: db_url,
        mork_server_url: mork_url,
        mettakg_api_url: api_url,
    })
}
