use clap::Parser;
use dotenv::dotenv;
use metta_kg::{cli::Cli, db, launch_setup_server, rocket, AppConfig};

// #[tokio::main]
// async fn main() -> Result<(), Box<dyn std::error::Error>> {
//     let cli = Cli::parse();
//     let setup_config = launch_setup_server(cli.mettakg_api_url.clone()).await;
//
//     let raw_api_url = cli.mettakg_api_url.unwrap_or(setup_config.mettakg_api_url);
//
//     let mettakg_api_url = if !raw_api_url.contains("://") {
//         format!("http://{}", raw_api_url)
//     } else {
//         raw_api_url
//     };
//
//     let final_config = AppConfig {
//         database_url: setup_config.database_url,
//         mork_server_url: setup_config.mork_server_url,
//         mettakg_api_url,
//     };
//
//     db::init_database_url(final_config.database_url.clone());
//     let rocket_instance = rocket(&final_config).await;
//     rocket_instance.launch().await?;
//     Ok(())
// }

// #[tokio::main]
// async fn main() -> Result<(), Box<dyn std::error::Error>> {
//     // Load .env file (optional - for any env vars)
//     dotenv().ok();
//     // Parse CLI args (only mettakg_api_url is used)
//     let cli = Cli::parse();
//     // ALWAYS run setup server - configuration MUST go through landing page
//     println!("Starting setup server...");
//     let setup_config = launch_setup_server(cli.mettakg_api_url.clone()).await;
//     // Process the API URL
//     let mettakg_api_url = if !setup_config.mettakg_api_url.contains("://") {
//         format!("http://{}", setup_config.mettakg_api_url)
//     } else {
//         setup_config.mettakg_api_url
//     };
//     let final_config = AppConfig {
//         database_url: setup_config.database_url,
//         mork_server_url: setup_config.mork_server_url,
//         mettakg_api_url,
//     };
//     // Initialize database and start main API server
//     db::init_database_url(final_config.database_url.clone());
//     println!("Starting API server with configuration:");
//     println!("  Database: {}", final_config.database_url);
//     println!("  MORK Server: {}", final_config.mork_server_url);
//     println!("  API URL: {}", final_config.mettakg_api_url);
//     let rocket_instance = rocket(&final_config).await;
//     rocket_instance.launch().await?;
//     Ok(())
// }
//

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
