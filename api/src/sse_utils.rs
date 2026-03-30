use rocket::response::stream::Event;
use tokio::sync::broadcast::Sender;

// Typed events for SSE;
#[derive(Clone, Debug)]
pub enum ServerEvent {
    Started { command: String },
    Log { message: String },
    Success { message: String },
    Error { message: String },
}

impl From<ServerEvent> for Event {
    fn from(event: ServerEvent) -> Event {
        match event {
            ServerEvent::Started { command } => Event::data(format!("PROCESS_STARTED:{}", command)),
            ServerEvent::Log { message } => Event::data(message),
            ServerEvent::Success { .. } => Event::data("PROCESS_EXIT_SUCCESS"),
            ServerEvent::Error { .. } => Event::data("PROCESS_EXIT_ERROR"),
        }
    }
}

pub struct JobRunner;

impl JobRunner {
    // Spawns a background job with standard lifecycle events.
    pub fn spawn<F, Fut>(command_name: &str, broadcaster: Sender<ServerEvent>, task: F)
    where
        F: FnOnce(Sender<ServerEvent>) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<String, String>> + Send,
    {
        let command = command_name.to_string();
        tokio::spawn(async move {
            let _ = broadcaster.send(ServerEvent::Started { command });

            match task(broadcaster.clone()).await {
                Ok(msg) => {
                    let _ = broadcaster.send(ServerEvent::Log { message: msg });
                    let _ = broadcaster.send(ServerEvent::Success {
                        message: "Done".into(),
                    });
                }
                Err(err) => {
                    let _ = broadcaster.send(ServerEvent::Log {
                        message: format!("Error: {}", err),
                    });
                    let _ = broadcaster.send(ServerEvent::Error { message: err });
                }
            }
        });
    }
}
