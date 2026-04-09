use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::tokio::io::AsyncReadExt;
use serde::{Deserialize, Serialize};
use url::Url;

use rocket::response::status::Custom;
use rocket::serde::json;
use rocket::serde::json::serde_json;
use rocket::serde::json::serde_json::json;
use rocket::{get, post, Data, State};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration, Instant};

use crate::model::Token;
use crate::mork_api::{
    ClearRequest, ExploreRequest, ExportFormat, ExportRequest, ImportRequest, Mm2Cell,
    MorkApiClient, Namespace, ReadRequest, Request, StatusRequest, StatusResponse,
    TransformDetails, TransformRequest, UploadRequest,
};
use crate::routes::sse::SseState;
use crate::sse_utils::{JobRunner, ServerEvent};

trait SourceTargetPermissions {
    type Ns: ToString + Clone;

    fn source(&self) -> Vec<Self::Ns>;
    fn target(&self) -> Vec<Self::Ns>;

    fn source_target_permissions(&self, token: Token) -> bool {
        let token_namespace = token.namespace.strip_prefix("/").unwrap();

        // check `permission read`
        let has_read_permission = self
            .source()
            .iter()
            .all(|pattern| pattern.to_string().starts_with(token_namespace))
            && token.permission_read;

        let has_write_permission = self
            .target()
            .iter()
            .all(|template| template.to_string().starts_with(token_namespace))
            && token.permission_write;

        has_read_permission && has_write_permission
    }
}

/// The input for a transformation operation.
/// see mm2 operations for more    // TODO: Add links
#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Mm2InputMulti {
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

#[derive(Default, Serialize, Deserialize, Clone, Debug)]
pub struct Mm2InputMultiWithNamespace {
    pub patterns: Vec<Mm2Cell>,
    pub templates: Vec<Mm2Cell>,
}

impl SourceTargetPermissions for Mm2InputMultiWithNamespace {
    type Ns = Namespace;

    fn source(&self) -> Vec<Self::Ns> {
        self.patterns
            .iter()
            .map(|p| p.namespace().clone())
            .collect()
    }

    fn target(&self) -> Vec<Self::Ns> {
        self.templates
            .iter()
            .map(|t| t.namespace().clone())
            .collect()
    }
}

#[derive(Serialize, Deserialize)]
pub struct Mm2Input {
    pub pattern: String,
    pub template: String,
    pub max_write: Option<usize>,
    pub format: Option<ExportFormat>,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct ExploreInput {
    pub pattern: String,
    pub token: String,
}

#[derive(Serialize)]
struct ExploreFallbackItem {
    token: Vec<u64>,
    expr: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct SetOperationInput {
    pub source: Vec<String>,
    pub target: Vec<String>,
}

impl SourceTargetPermissions for SetOperationInput {
    type Ns = String;

    fn source(&self) -> Vec<Self::Ns> {
        self.source.clone()
    }

    fn target(&self) -> Vec<Self::Ns> {
        self.target.clone()
    }
}

/// Fetches the `<path..>` space content. Use cautously as it will load everything.
/// It is recommended to use the `/spaces/<path..>?op=explore` instead for large queries
#[get("/spaces/<path..>", rank = 1, data = "<mm2>")]
pub async fn read(
    token: Token,
    path: PathBuf,
    mm2: Option<Json<Mm2InputMulti>>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    // shadowing for backwards compatibility
    // TODO: remove `Option` once all clients are updated
    let mm2 = mm2.unwrap_or(Json(Mm2InputMulti::default()));

    let mork_api_client = MorkApiClient::new();
    let transform_input = TransformDetails::new()
        .patterns(vec![Mm2Cell::new_pattern(
            mm2.patterns.first().cloned().unwrap_or("$x".to_string()),
            Namespace::from(path.to_path_buf()),
        )])
        .templates(vec![Mm2Cell::new_template(
            mm2.templates.first().cloned().unwrap_or("$x".to_string()),
            Namespace::from(path.to_path_buf()),
        )]);
    let request = ReadRequest::new().transform_input(transform_input);

    let response = mork_api_client.dispatch(request).await.map(Json);
    response
}

/// Upload to the `<path..>` space. Exectes mm2 on the imported data.
#[post("/spaces/upload/<path..>", data = "<data>")]
pub async fn upload(
    token: Token,
    path: PathBuf,
    data: Data<'_>,
    state: &State<SseState>,
) -> Result<Json<bool>, Custom<String>> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Custom(Status::Unauthorized, "Unauthorized".to_string()));
    }

    let mut body = String::new();
    if let Err(e) = data
        .open(rocket::data::ByteUnit::Mebibyte(20))
        .read_to_string(&mut body)
        .await
    {
        return Err(Custom(
            Status::BadRequest,
            format!("Failed to read body: {e}"),
        ));
    }

    let pattern = "$x";
    let template = "$x";

    let mork_api_client = MorkApiClient::new();
    let request = UploadRequest::new()
        .namespace(path.clone())
        .pattern(pattern.to_string())
        .template(template.to_string())
        .data(body);

    let broadcaster = state.broadcaster.clone();
    let write_lock = state.write_lock.clone();
    spawn_job(
        "UPLOAD",
        broadcaster,
        write_lock,
        mork_api_client,
        request,
        path,
    );

    Ok(Json(true))
}

/// Imports data from `<uri>` into the `<path..>` space. Exectes mm2 on the imported data.
#[post("/spaces/import/<path..>?<uri>")]
pub async fn import(
    token: Token,
    path: PathBuf,
    uri: String,
    state: &State<SseState>,
) -> Result<Json<bool>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    // validate uri
    if Url::parse(&uri).is_err() {
        return Err(Status::BadRequest);
    }

    let mork_api_client = MorkApiClient::new();
    let template = Mm2Cell::new_template("$x".to_string(), Namespace::from(path.clone()));
    let request = ImportRequest::new().to(template).uri(uri);

    let broadcaster = state.broadcaster.clone();
    let write_lock = state.write_lock.clone();
    spawn_job(
        "IMPORT",
        broadcaster,
        write_lock,
        mork_api_client,
        request,
        path.clone(),
    );

    Ok(Json(true))
}

/// Performs an explore operation on the `<path..>` space. Get the result that
/// matches the `<pattern>` by incrementally traversing the resulting space.
#[post("/spaces/explore/<path..>", data = "<explore_input>")]
pub async fn explore(
    token: Token,
    path: PathBuf,
    explore_input: Json<ExploreInput>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let namespace_path = path.clone();
    let request = ExploreRequest::new()
        .namespace(path)
        .pattern(explore_input.pattern.clone())
        .token(explore_input.token.clone());

    let response_text = mork_api_client.dispatch(request).await?;

    // Performs fallback to read if explore returns empty result and no token was provided
    if explore_input.token.is_empty() && is_empty_explore_response(&response_text) {
        if let Some(fallback) = fallback_explore_via_read(
            &mork_api_client,
            explore_input.pattern.clone(),
            namespace_path,
        )
        .await
        {
            return Ok(fallback);
        }
    }

    Ok(Json(response_text))
}

/// Performs an export operation on the `<path..>` space. Get the result that
/// matches the `<pattern>` by incrementally traversing the resulting space.
use crate::routes::translations;
#[post("/spaces/export/<path..>", data = "<export_input>")]
pub async fn export(
    token: Token,
    path: PathBuf,
    export_input: Json<Mm2Input>,
    state: &State<SseState>,
) -> Result<Json<String>, Custom<Json<serde_json::Value>>> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Custom(
            Status::Unauthorized,
            Json(json!({ "message": "Unauthorized" })),
        ));
    }

    let requested_format = export_input.format.clone().unwrap_or(ExportFormat::Metta);

    let mork_api_client = MorkApiClient::new();
    let request = ExportRequest::new()
        .namespace(path)
        .pattern(export_input.pattern.clone())
        .template(export_input.template.clone())
        .format(ExportFormat::Metta)
        .max_write(export_input.max_write);

    let broadcaster = state.broadcaster.clone();

    let _ = broadcaster.send(ServerEvent::Started {
        command: "EXPORT".to_string(),
    });

    let _ = broadcaster.send(ServerEvent::Log {
        message: "Starting export operation...".to_string(),
    });

    let dispatch_future = mork_api_client.dispatch(request);
    tokio::pin!(dispatch_future);

    let mut interval = tokio::time::interval(Duration::from_secs(1));

    let result = loop {
        tokio::select! {
            res = &mut dispatch_future => break res,
            _ = interval.tick() => {
                let _ = broadcaster.send(ServerEvent::Log {
                    message: "Exporting...".to_string()
                });
            }
        }
    };

    let mork_response = match result {
        Ok(data) => {
            let _ = broadcaster.send(ServerEvent::Log {
                message: "Export completed successfully.".to_string(),
            });
            let _ = broadcaster.send(ServerEvent::Success {
                message: "EXPORT".to_string(),
            });
            data
        }
        Err(e) => {
            let _ = broadcaster.send(ServerEvent::Error {
                message: "EXPORT".to_string(),
            });

            return Err(Custom(e, Json(json!({ "message": "Mork API Error" }))));
        }
    };

    match requested_format {
        ExportFormat::Json => translations::convert_metta_to_json(mork_response)
            .map(Json)
            .map_err(|e| {
                Custom(
                    Status::UnprocessableEntity,
                    Json(json!({ "message": format!("Incompatible metta file: {}", e) })),
                )
            }),
        ExportFormat::Csv => translations::convert_metta_to_csv(mork_response)
            .map(Json)
            .map_err(|e| {
                Custom(
                    Status::UnprocessableEntity,
                    Json(json!({ "message": format!("Incompatible metta file: {}", e) })),
                )
            }),
        _ => Ok(Json(mork_response)),
    }
}

#[post("/spaces/clear/<path..>?<expr>")]
pub async fn clear(
    token: Token,
    path: PathBuf,
    expr: String,
    state: &State<SseState>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ClearRequest::new().namespace(path.clone()).expr(expr);

    let broadcaster = state.broadcaster.clone();
    let write_lock = state.write_lock.clone();
    spawn_job(
        "CLEAR",
        broadcaster,
        write_lock,
        mork_api_client,
        request,
        path.clone(),
    );

    Ok(Json(true))
}

/// Performs a transformation operation on the `<path..>` space
#[post("/spaces/transform", data = "<mm2>")]
pub async fn transform(
    token: Token,
    mm2: Json<Mm2InputMultiWithNamespace>,
    state: &State<SseState>,
) -> Result<Json<bool>, Status> {
    let mm2 = mm2.into_inner();
    if !mm2.clone().source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = TransformRequest::new().transform_input(
        TransformDetails::new()
            .patterns(mm2.clone().patterns)
            .templates(mm2.templates.clone()),
    );

    let broadcaster = state.broadcaster.clone();
    let write_lock = state.write_lock.clone();
    // We need a target path to poll. In transform, templates define the target.
    // Assuming the first template's namespace is the target for polling.
    let request_path = match mm2.templates.first() {
        Some(t) => t.namespace().clone(),
        None => return Err(Status::BadRequest),
    };

    // poll status endpoint
    // Convert Namespace to PathBuf for polling
    let path_buf = PathBuf::from(request_path.to_string());

    spawn_job(
        "TRANSFORM",
        broadcaster,
        write_lock,
        mork_api_client,
        request,
        path_buf,
    );

    Ok(Json(true))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////// SET OPERATIONS //////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

/// Performs a composition operation on provided namespaces. `token` must have `permission_write`
/// on the target namespace and `permission_read` on all source namespaces.
/// # Composition Transformation
/// ```lisp
/// (transform
///     (, (namespace1 $a) (namespace2 $b))  ; (namespace $c) (namespace $d) etc ...
///     (, (output-namespace $a $b))  ; $c $d etc ...
/// )
/// ```
///
/// Currently it only handles a single target namespace
#[post("/spaces/composition", data = "<operation_input>")]
pub async fn composition(
    token: Token,
    operation_input: Json<SetOperationInput>,
    state: &State<SseState>,
) -> Result<Json<bool>, Status> {
    if !operation_input.source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    let input = operation_input.into_inner();
    let transform_input = composition_transform(input.clone())?;

    let request = TransformRequest::new().transform_input(transform_input.clone());
    let mork_api_client = MorkApiClient::new();
    let broadcaster = state.broadcaster.clone();
    let write_lock = state.write_lock.clone();

    // Target path for polling is the first target in the input
    let request_path = match input.target.first() {
        Some(t) => PathBuf::from(t),
        None => return Err(Status::BadRequest),
    };

    spawn_job(
        "COMPOSITION",
        broadcaster,
        write_lock,
        mork_api_client,
        request,
        request_path,
    );

    Ok(Json(true))
}

/// Performs an intersection operation on provided namespaces. `token` must have `permission_write`
/// on the target namespace and `permission_read` on all source namespaces.
/// Intersection is implemented as a positive join on a shared variable across all sources.
/// # Intersection Transformation (conceptual)
/// ```lisp
/// (transform
///     (, (namespace1 $x) (namespace2 $x) ...)  ; all sources share the same variable $x
///     (, (target $x))
/// )
/// ```
#[post("/spaces/intersection", data = "<operation_input>")]
pub async fn intersection(
    token: Token,
    operation_input: Json<SetOperationInput>,
    state: &State<SseState>,
) -> Result<Json<bool>, Status> {
    // check `permission read` for all sources
    if !operation_input.source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    let input = operation_input.into_inner();
    let transform_input = intersection_transform(input.clone())?;

    let request = TransformRequest::new().transform_input(transform_input);
    let mork_api_client = MorkApiClient::new();
    let broadcaster = state.broadcaster.clone();
    let write_lock = state.write_lock.clone();

    // Target path for polling is the first target in the input
    let request_path = match input.target.first() {
        Some(t) => PathBuf::from(t),
        None => return Err(Status::BadRequest),
    };

    spawn_job(
        "INTERSECTION",
        broadcaster,
        write_lock,
        mork_api_client,
        request,
        request_path,
    );

    Ok(Json(true))
}

#[post("/spaces/union", data = "<operation_input>")]
pub async fn union(
    token: Token,
    operation_input: Json<SetOperationInput>,
    state: &State<SseState>,
) -> Result<Json<bool>, Status> {
    if !operation_input.source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    // path to be used for polling
    let request_path = match operation_input.clone().into_inner().target.first() {
        Some(value) => PathBuf::from(value),
        None => return Err(Status::BadRequest),
    };

    // create a vector of queries
    let transform_inputs = union_transform(operation_input.into_inner())?;
    let mork_api_client = MorkApiClient::new();
    let broadcaster = state.broadcaster.clone();
    let write_lock = state.write_lock.clone();

    JobRunner::spawn(
        "UNION",
        broadcaster.clone(),
        move |tx: broadcast::Sender<ServerEvent>| {
            let client = mork_api_client;
            let path = request_path;
            let write_lock = write_lock;
            async move {
                let lock_guard = if let Ok(guard) = write_lock.try_lock() {
                    guard
                } else {
                    let _ = tx.send(ServerEvent::Log {
                        message: "Write queue busy, waiting for turn...".to_string(),
                    });
                    write_lock.lock().await
                };

                let _ = tx.send(ServerEvent::Log {
                    message: "Starting union operation...".to_string(),
                });

                for transform_input in transform_inputs {
                    let request = TransformRequest::new().transform_input(transform_input);

                    client
                        .dispatch(request)
                        .await
                        .map_err(|e| format!("Transformation dispatch failed: {:?}", e))?;

                    let _ = tx.send(ServerEvent::Log {
                        message: "Data received, waiting for processing...".to_string(),
                    });

                    poll_and_broadcast(path.clone(), &client, &tx)
                        .await
                        .map_err(|e| format!("Processing timeout: {:?}", e))?;
                }

                drop(lock_guard);
                Ok("Union complete".to_string())
            }
        },
    );

    Ok(Json(true))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////// HELPER FUNCTIONS ////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

async fn poll_and_broadcast(
    path: PathBuf,
    mork_api_client: &MorkApiClient,
    broadcaster: &broadcast::Sender<ServerEvent>,
) -> Result<bool, Status> {
    let start_time = Instant::now();
    let timeout_duration = Duration::from_secs(300);

    // Check if space is clear by using status endpoint
    let check_request = StatusRequest::new()
        .namespace(path.clone())
        .pattern("$x".to_string());

    let mut counter = 0;
    loop {
        // exit condition stop polling after some second
        if start_time.elapsed() > timeout_duration {
            return Err(Status::RequestTimeout);
        }

        // wait 1 second between each status request
        sleep(Duration::from_millis(1000)).await;

        if counter % 5 == 0 {
            let _ = broadcaster.send(ServerEvent::Log {
                message: "Checking status...".to_string(),
            });
        }
        counter += 1;

        // destructure status endpoint json response
        let status_response: StatusResponse =
            match mork_api_client.dispatch(check_request.clone()).await {
                Ok(result) => match json::from_str::<StatusResponse>(&result) {
                    Ok(c) => c,
                    Err(_) => return Err(Status::RequestTimeout),
                },
                Err(_) => return Err(Status::RequestTimeout),
            };

        if status_response.status == "pathClear" {
            break;
        }
    }
    Ok(true)
}

fn spawn_job<R>(
    command: &str,
    broadcaster: broadcast::Sender<ServerEvent>,
    write_lock: Arc<Mutex<()>>,
    mork_api_client: MorkApiClient,
    request: R,
    request_path: PathBuf,
) where
    R: Request + Send + Sync + 'static,
{
    let command_label = command.to_string();
    // Capitalize first letter for success message
    let success_msg = if let Some(first_char) = command.chars().next() {
        format!(
            "{}{}",
            first_char.to_uppercase(),
            &command.to_lowercase()[1..]
        )
    } else {
        command.to_string()
    } + " completed successfully.";

    JobRunner::spawn(
        command,
        broadcaster,
        move |tx: broadcast::Sender<ServerEvent>| async move {
            let lock_guard = if let Ok(guard) = write_lock.try_lock() {
                guard
            } else {
                let _ = tx.send(ServerEvent::Log {
                    message: "Write queue busy, waiting for turn...".to_string(),
                });
                write_lock.lock().await
            };

            mork_api_client
                .dispatch(request)
                .await
                .map_err(|e| format!("{} dispatch failed: {:?}", command_label, e))?;

            let _ = tx.send(ServerEvent::Log {
                message: "Data received, waiting for processing...".to_string(),
            });

            poll_and_broadcast(request_path, &mork_api_client, &tx)
                .await
                .map_err(|e| format!("Processing timeout: {:?}", e))?;

            drop(lock_guard);

            Ok(success_msg)
        },
    );
}

fn composition_transform(input: SetOperationInput) -> Result<TransformDetails, Status> {
    let mut template = String::new();

    let patterns = input
        .source
        .iter()
        .enumerate()
        .map(|(index, source_ns)| {
            let c = index.to_string();
            template.push('$');
            template.push_str(&c);
            template.push(' ');

            Mm2Cell::new_pattern(format!("${}", c), Namespace::from(PathBuf::from(source_ns)))
        })
        .collect::<Vec<Mm2Cell>>();

    let transform_input =
        TransformDetails::new()
            .patterns(patterns)
            .templates(vec![Mm2Cell::new_template(
                template,
                Namespace::from(PathBuf::from(input.target.first().cloned().unwrap())),
            )]);

    Ok(transform_input)
}

fn intersection_transform(input: SetOperationInput) -> Result<TransformDetails, Status> {
    // Require at least 2 sources and exactly 1 target
    if input.source.len() < 2 || input.target.len() != 1 {
        return Err(Status::BadRequest);
    }

    let patterns = input
        .source
        .iter()
        .map(|source_ns| {
            Mm2Cell::new_pattern("$x".to_string(), Namespace::from(PathBuf::from(source_ns)))
        })
        .collect::<Vec<Mm2Cell>>();

    let transform_input =
        TransformDetails::new()
            .patterns(patterns)
            .templates(vec![Mm2Cell::new_template(
                "$x".to_string(),
                Namespace::from(PathBuf::from(input.target.first().cloned().unwrap())),
            )]);

    Ok(transform_input)
}

fn union_transform(input: SetOperationInput) -> Result<Vec<TransformDetails>, Status> {
    // Exceed the maximum number of source namespaces for composition, 26
    // and
    // Only one target namespace is allowed
    if input.source.len() > 26 && input.target.len() != 1 {
        return Err(Status::BadRequest);
    }

    let mut union_query: Vec<TransformDetails> = Vec::new();

    for source_ns in input.source.iter() {
        union_query.push(
            TransformDetails::new()
                .patterns(vec![Mm2Cell::new_pattern(
                    "$x".to_string(),
                    Namespace::from_path_string(source_ns),
                )])
                .templates(vec![Mm2Cell::new_template(
                    "$x".to_string(),
                    Namespace::from_path_string(input.target.first().unwrap()),
                )]),
        );
    }

    Ok(union_query)
}

async fn fallback_explore_via_read(
    client: &MorkApiClient,
    pattern: String,
    namespace_path: PathBuf,
) -> Option<Json<String>> {
    let transform_input = TransformDetails::new()
        .patterns(vec![Mm2Cell::new_pattern(
            pattern.clone(),
            Namespace::from(namespace_path.clone()),
        )])
        .templates(vec![Mm2Cell::new_template(
            "$x".to_string(),
            Namespace::from(namespace_path),
        )]);

    let read_request = ReadRequest::new().transform_input(transform_input);

    let raw_text = client.dispatch(read_request).await.ok()?;

    let exprs: Vec<String> = raw_text
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(String::from)
        .collect();

    if exprs.is_empty() {
        return None;
    }

    let fallback: Vec<ExploreFallbackItem> = exprs
        .into_iter()
        .enumerate()
        .map(|(index, expr)| ExploreFallbackItem {
            token: vec![(index + 1) as u64],
            expr,
        })
        .collect();

    let json = json::serde_json::to_string(&fallback).ok()?;
    Some(Json(json))
}

fn is_empty_explore_response(response_text: &str) -> bool {
    let trimmed = response_text.trim();
    trimmed.is_empty() || trimmed == "[]" || trimmed == "null"
}

// unit tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_composition_transform() {
        let input = SetOperationInput {
            source: vec!["ns1".to_string(), "ns2".to_string()],
            target: vec!["ns3".to_string()],
        };

        let transform_input = composition_transform(input).unwrap();

        assert_eq!(
            transform_input.patterns[0].build(),
            "(__root__ (ns1 (__ns1data__ $0)))".to_string()
        );
        assert_eq!(
            transform_input.patterns[1].build(),
            "(__root__ (ns2 (__ns2data__ $1)))".to_string()
        );
        assert_eq!(
            transform_input.templates[0].build(),
            "(__root__ (ns3 (__ns3data__ $0 $1 )))".to_string()
        );
    }

    #[test]
    fn test_union_transform() {
        let input = SetOperationInput {
            source: vec!["ns1".to_string(), "ns2".to_string()],
            target: vec!["ns3".to_string()],
        };

        let transform_inputs = union_transform(input).unwrap();

        assert_eq!(transform_inputs.len(), 2);

        assert_eq!(
            transform_inputs[0].patterns[0].build(),
            "(__root__ (ns1 (__ns1data__ $x)))".to_string()
        );
        assert_eq!(
            transform_inputs[1].patterns[0].build(),
            "(__root__ (ns2 (__ns2data__ $x)))".to_string()
        );
        assert_eq!(
            transform_inputs[0].templates[0].build(),
            "(__root__ (ns3 (__ns3data__ $x)))".to_string()
        );
        assert_eq!(
            transform_inputs[1].templates[0].build(),
            "(__root__ (ns3 (__ns3data__ $x)))".to_string()
        );
    }

    #[test]
    fn test_intersection_transform() {
        let input = SetOperationInput {
            source: vec!["ns1".to_string(), "ns2".to_string()],
            target: vec!["ns3".to_string()],
        };

        let transform_input = intersection_transform(input).unwrap();

        assert_eq!(transform_input.patterns.len(), 2);
        assert_eq!(transform_input.templates.len(), 1);

        assert_eq!(
            transform_input.patterns[0].build(),
            "(__root__ (ns1 (__ns1data__ $x)))".to_string()
        );
        assert_eq!(
            transform_input.patterns[1].build(),
            "(__root__ (ns2 (__ns2data__ $x)))".to_string()
        );
        assert_eq!(
            transform_input.templates[0].build(),
            "(__root__ (ns3 (__ns3data__ $x)))".to_string()
        );
    }
}
