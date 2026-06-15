use api::rocket;
use rocket::{launch, Build, Rocket};

#[launch]
fn rocket_main() -> Rocket<Build> {
    // Initialize logging: defaults to pretty for dev, JSON when METTA_KG_LOG_FORMAT=json
    let env_filter = tracing_subscriber::EnvFilter::builder()
        .with_default_directive(tracing::Level::INFO.into())
        .from_env_lossy();

    if std::env::var("METTA_KG_LOG_FORMAT").as_deref() == Ok("json") {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(env_filter)
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .init();
    }

    // Bridge Rocket's log crate output to tracing
    let _ = tracing_log::LogTracer::init();

    tracing::info!("Starting API server");
    rocket()
}
