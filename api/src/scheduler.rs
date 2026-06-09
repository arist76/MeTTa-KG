use crate::sse_utils::ServerEvent;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::Mutex;

pub async fn acquire_write_lock<'a>(
    write_lock: &'a Arc<Mutex<()>>,
    broadcaster: &broadcast::Sender<ServerEvent>,
) -> tokio::sync::MutexGuard<'a, ()> {
    if let Ok(guard) = write_lock.try_lock() {
        guard
    } else {
        let _ = broadcaster.send(ServerEvent::Log {
            message: "Write queue busy, waiting for turn...".to_string(),
        });
        write_lock.lock().await
    }
}
