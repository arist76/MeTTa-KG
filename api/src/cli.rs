use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(name = "metta-kg", version, about = "MeTTa-KG Server/Frontend")]
pub struct Cli {
    #[arg(long)]
    pub mettakg_api_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub mettakg_api_url: String,
}
