use rocket::fairing::AdHoc;
use rocket::futures::stream::{self as futures_stream};
use rocket::response::stream::{Event, EventStream};
use rocket::State;
use rocket::{get, routes};
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct CommandState {
    pub broadcaster: broadcast::Sender<String>,
}

#[get("/events")]
pub fn stream(
    state: &State<CommandState>,
) -> EventStream<impl rocket::futures::Stream<Item = Event>> {
    let rx = state.broadcaster.subscribe();

    let stream = futures_stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(msg) => Some((Event::data(msg), rx)),
            Err(_) => None,
        }
    });

    EventStream::from(stream)
}

pub fn stage() -> AdHoc {
    AdHoc::on_ignite("Command Processor", |rocket| async {
        let (tx_bc, _) = broadcast::channel::<String>(100);

        rocket
            .manage(CommandState {
                // sender: tx_cmd,
                broadcaster: tx_bc,
            })
            .mount("/", routes![stream])
    })
}
