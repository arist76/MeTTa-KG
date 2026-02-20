use clap::Parser;
use dotenv::dotenv;
use metta_kg::{cli::Cli, db, launch_setup_server, rocket, AppConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let cli = Cli::parse();

    let final_config = if cfg!(feature = "postgres") {
        match (
            std::env::var("DATABASE_URL"),
            std::env::var("MORK_SERVER_URL"),
        ) {
            (Ok(db_url), Ok(mork_url)) => {
                println!("configuration from environment variables");
                AppConfig {
                    database_url: db_url,
                    mork_server_url: mork_url,
                    mettakg_api_url: cli
                        .mettakg_api_url
                        .unwrap_or_else(|| "http://127.0.0.1:8000".to_string()),
                }
            }
            _ => {
                panic!("MORK_SERVER_URL or DATABASE_URL not found within env");
            }
        }
    } else {
        println!("Starting setup server for sqlite...");
        launch_setup_server(cli.mettakg_api_url.clone()).await
    };

    db::init_database_url(final_config.database_url.clone());
    let rocket_instance = rocket(&final_config).await;
    rocket_instance.launch().await?;
    Ok(())
}
