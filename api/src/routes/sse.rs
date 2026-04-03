use crate::sse_utils::ServerEvent;
use rocket::fairing::AdHoc;
use rocket::futures::stream::{self as futures_stream};
use rocket::response::stream::{Event, EventStream};
use rocket::State;
use rocket::{get, routes};
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct SseState {
    pub broadcaster: broadcast::Sender<ServerEvent>,
    pub write_lock: Arc<Mutex<()>>,
}

#[get("/events")]
pub fn stream(state: &State<SseState>) -> EventStream<impl rocket::futures::Stream<Item = Event>> {
    let rx = state.broadcaster.subscribe();

    let stream = futures_stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(msg) => Some((Event::from(msg), rx)),
            Err(_) => None,
        }
    });

    EventStream::from(stream)
}

pub fn stage() -> AdHoc {
    AdHoc::on_ignite("SSE Processor", |rocket| async {
        let (tx_bc, _) = broadcast::channel::<ServerEvent>(100);
        let write_lock = Arc::new(Mutex::new(()));

        rocket
            .manage(SseState {
                broadcaster: tx_bc,
                write_lock,
            })
            .mount("/", routes![stream])
    })
}
