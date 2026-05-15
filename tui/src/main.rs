use clap::Parser;
use anyhow::Result;

mod app;
mod domain;
mod infrastructure;
mod application;
mod presentation;

#[derive(Parser, Debug)]
#[command(name = "metta-kg-tui")]
#[command(about = "MeTTa-KG Terminal User Interface", long_about = None)]
struct Cli {
    #[arg(short, long, default_value = "http://localhost:8000")]
    backend: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::WARN)
        .init();

    crossterm::terminal::enable_raw_mode()?;
    let mut stdout = std::io::stdout();
    crossterm::execute!(stdout, crossterm::terminal::EnterAlternateScreen)?;

    crossterm::execute!(
        stdout,
        crossterm::event::EnableMouseCapture,
        crossterm::event::EnableBracketedPaste,
    )?;

    let mut app = app::App::new(cli.backend);

    if let Err(e) = app.run() {
        eprintln!("Error: {}", e);
    }

    crossterm::execute!(
        std::io::stdout(),
        crossterm::event::DisableMouseCapture,
        crossterm::terminal::LeaveAlternateScreen,
    )?;
    crossterm::terminal::disable_raw_mode()?;

    Ok(())
}
