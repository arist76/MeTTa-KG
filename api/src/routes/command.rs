use rocket::fairing::AdHoc;
use rocket::futures::stream::{self as futures_stream};
use rocket::response::stream::{Event, EventStream};
use rocket::serde::{json::Json, Deserialize};
use rocket::State;
use rocket::{get, post, routes};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc};

#[derive(Clone)]
pub struct CommandState {
    pub sender: mpsc::Sender<String>,
    pub broadcaster: broadcast::Sender<String>,
}

#[derive(Deserialize)]
pub struct CommandRequest {
    pub command: String,
}

pub async fn run_command_processor(
    mut receiver: mpsc::Receiver<String>,
    broadcaster: broadcast::Sender<String>,
) {
    while let Some(cmd_str) = receiver.recv().await {
        let _ = broadcaster.send(format!("$ {}\n", cmd_str));

        let mut child = match Command::new("sh")
            .arg("-c")
            .arg(&cmd_str)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = broadcaster.send(format!("Error spawning command: {}\n", e));
                continue;
            }
        };

        let stdout = child.stdout.take().expect("stdout captured");
        let stderr = child.stderr.take().expect("stderr captured");

        let tx_out = broadcaster.clone();
        let tx_err = broadcaster.clone();

        let stdout_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = tx_out.send(format!("{}\n", line));
            }
        });

        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = tx_err.send(format!("{}\n", line));
            }
        });

        let _ = tokio::join!(stdout_task, stderr_task);
        let _ = child.wait().await;
    }
}

#[post("/command", data = "<payload>")]
pub async fn trigger(
    state: &State<CommandState>,
    payload: Json<CommandRequest>,
) -> Result<(), String> {
    state
        .sender
        .send(payload.command.clone())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
        let (tx_cmd, rx_cmd) = mpsc::channel::<String>(100);
        let (tx_bc, _) = broadcast::channel::<String>(100);

        let tx_bc_clone = tx_bc.clone();
        tokio::spawn(async move {
            run_command_processor(rx_cmd, tx_bc_clone).await;
        });

        rocket
            .manage(CommandState {
                sender: tx_cmd,
                broadcaster: tx_bc,
            })
            .mount("/", routes![trigger, stream])
    })
}
