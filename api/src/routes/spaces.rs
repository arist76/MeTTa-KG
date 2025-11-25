use rocket::futures::future::join_all;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::tokio::io::AsyncReadExt;
use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;
use url::Url;

use rocket::response::status::Custom;
use rocket::{get, post, Data};
use std::path::PathBuf;
use uuid::Uuid;

use crate::model::Token;
use crate::mork_api::{
    ClearRequest, ExecRequest, ExploreRequest, ExportFormat, ExportRequest, ImportRequest, Mm2Cell,
    MorkApiClient, Namespace, ReadRequest, Request, TransformDetails, TransformRequest,
    UploadRequest,
};

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

#[derive(Default, Serialize, Deserialize, Clone)]
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
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct ExploreInput {
    pub pattern: String,
    pub token: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct SetOperationInput {
    pub source: Vec<String>,
    pub target: Vec<String>,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct ExecOperationInput {
    #[serde(flatten)]
    pub base: SetOperationInput,
    pub steps: i32,
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
) -> Result<Json<String>, Custom<String>> {
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
        eprintln!("Failed to read body: {e}");
        return Err(Custom(
            Status::BadRequest,
            format!("Failed to read body: {e}"),
        ));
    }

    let pattern = "$x";
    let template = "$x";

    let mork_api_client = MorkApiClient::new();
    let request = UploadRequest::new()
        .namespace(path)
        .pattern(pattern.to_string())
        .template(template.to_string())
        .data(body);

    match mork_api_client.dispatch(request).await {
        Ok(text) => Ok(Json(text)),
        Err(e) => Err(Custom(
            Status::InternalServerError,
            format!("Failed to contact backend: {e}"),
        )),
    }
}

/// Imports data from `<uri>` into the `<path..>` space. Exectes mm2 on the imported data.
#[post("/spaces/import/<path..>?<uri>")]
pub async fn import(token: Token, path: PathBuf, uri: String) -> Result<Json<bool>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    // validate uri
    if Url::parse(&uri).is_err() {
        return Err(Status::BadRequest);
    }

    let mork_api_client = MorkApiClient::new();
    let template = Mm2Cell::new_template("$x".to_string(), Namespace::from(path));
    let request = ImportRequest::new().to(template).uri(uri);

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
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
    let request = ExploreRequest::new()
        .namespace(path)
        .pattern(explore_input.pattern.clone())
        .token(explore_input.token.clone());

    println!("explore path: {:?}", request.path());

    let response = mork_api_client.dispatch(request).await.map(Json);
    println!("explore response: {response:?}");
    response
}

/// Performs an export operation on the `<path..>` space. Get the result that
/// matches the `<pattern>` by incrementally traversing the resulting space.
#[post("/spaces/export/<path..>", data = "<export_input>")]
pub async fn export(
    token: Token,
    path: PathBuf,
    export_input: Json<Mm2Input>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ExportRequest::new()
        .namespace(path)
        .pattern(export_input.pattern.clone())
        .template(export_input.template.clone())
        .format(ExportFormat::Metta);

    println!("Dispatching export request to Mork: {}", request.path());

    match mork_api_client.dispatch(request).await {
        Ok(data) => {
            println!("Received export response from Mork: {data:?}");
            Ok(Json(data))
        }
        Err(e) => Err(e),
    }
}

#[post("/spaces/clear/<path..>?<expr>")]
pub async fn clear(token: Token, path: PathBuf, expr: String) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ClearRequest::new().namespace(path).expr(expr);

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

/// Performs a transformation operation on the `<path..>` space
#[post("/spaces/transform", data = "<mm2>")]
pub async fn transform(
    token: Token,
    mm2: Json<Mm2InputMultiWithNamespace>,
) -> Result<Json<bool>, Status> {
    let mm2 = mm2.into_inner();
    if !mm2.clone().source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = TransformRequest::new().transform_input(
        TransformDetails::new()
            .patterns(mm2.clone().patterns)
            .templates(mm2.templates),
    );

    // TODO: use server sent events instead
    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
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
) -> Result<Json<bool>, Status> {
    if !operation_input.source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    let transform_input = composition_transform(operation_input.into_inner())?;

    let request = TransformRequest::new().transform_input(transform_input.clone());
    let mork_api_client = MorkApiClient::new();

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

#[post("/spaces/union", data = "<operation_input>")]
pub async fn union(
    token: Token,
    operation_input: Json<SetOperationInput>,
) -> Result<Json<bool>, Status> {
    if !operation_input.source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    // create a vector of queries
    let transform_inputs = union_transform(operation_input.into_inner())?;

    let futures = transform_inputs
        .iter()
        .map(async |transform_input| {
            let request = TransformRequest::new().transform_input(transform_input.clone());
            let mork_api_client = MorkApiClient::new();

            mork_api_client.dispatch(request).await
        })
        .collect::<Vec<_>>();

    let results = join_all(futures).await;

    // Check if any requests failed
    for result in results {
        if let Err(e) = result {
            Err(e)?
        }
    }

    Ok(Json(true))
}

#[post("/spaces/restriction", data = "<operation_input>")]
pub async fn restriction(
    token: Token,
    operation_input: Json<ExecOperationInput>,
) -> Result<Json<bool>, Status> {
    if !operation_input.base.source_target_permissions(token) {
        return Err(Status::Unauthorized);
    }

    if operation_input.base.source.len() < 2 {
        return Err(Status::BadRequest);
    }

    if operation_input.base.target.is_empty() {
        return Err(Status::BadRequest);
    }

    if operation_input.steps == 0 {
        return Err(Status::BadRequest);
    }

    let l_pattern = Mm2Cell::new_pattern(
        "$data".to_string(),
        Namespace::from_path_string(&operation_input.base.source[0]),
    )
    .build();

    let r_pattern = Mm2Cell::new_pattern(
        "$pattern".to_string(),
        Namespace::from_path_string(&operation_input.base.source[1]),
    )
    .build();

    let template = Mm2Cell::new_pattern(
        "$full_data".to_string(),
        Namespace::from_path_string(&operation_input.base.target[0]),
    )
    .build();

    let data_tag = "a727d4f9-836a-4e4c-9480";
    let location = "restrict".to_string();
    let prefix_ns = Uuid::new_v4();
    let steps_ns = Uuid::new_v4().to_string();

    let exec_template = format!(
"
(exec ({location} (IC 0 1 {}))
    (, (exec ({location} (IC $x $y (S $c))) $sp $st) ({steps_ns} ({steps_ns}{data_tag} ((step $x) $p $t))) )
    (, 
        (exec ({location} (IC 1 0 $c)) $sp $st)
        (exec ({location} (R $x)) $p $t)
    )
)
",
        peano(operation_input.steps),
);
    let step_template = format!(
        "
((step 0)  
    (, {l_pattern} {r_pattern})  
    (, ({prefix_ns} ({prefix_ns}{data_tag} ($data $pattern $data))) )
)  
((step 1)  
    (, ({prefix_ns} ({prefix_ns}{data_tag} (($x $y) ($x $z) $full_data))))
    (, ({prefix_ns} ({prefix_ns}{data_tag} ($y $z $full_data))))
)  
((step 1)  
    (, ({prefix_ns} ({prefix_ns}{data_tag} (($x $z) ($x) $full_data))) )
    (, {template} )
)
((step 1)  
    (, ({prefix_ns} ({prefix_ns}{data_tag} (($x) ($x) $full_data))))
    (, {template} )
)"
    );

    let mork_api_client = MorkApiClient::new();
    let su_request = UploadRequest::new()
        .namespace(PathBuf::from(format!("/{}", steps_ns)))
        .pattern("$x".to_string())
        .template("$x".to_string())
        .data(step_template);

    match mork_api_client.dispatch(su_request).await {
        Ok(_) => {}
        Err(_) => return Err(Status::InternalServerError),
    };

    let eu_request = UploadRequest::new()
        .namespace(PathBuf::new())
        .pattern("$x".to_string())
        .template("$x".to_string())
        .data_tag(false)
        .data(exec_template);

    match mork_api_client.dispatch(eu_request).await {
        Ok(_) => {}
        Err(_) => return Err(Status::InternalServerError),
    };

    let e_request = ExecRequest::new().set_location(location);

    match mork_api_client.dispatch(e_request).await {
        Ok(_) => {}
        Err(_) => return Err(Status::InternalServerError),
    };

    thread::sleep(Duration::from_secs(1));
    let step_del_request = ClearRequest::new()
        .namespace(PathBuf::from(format!("/{}", steps_ns)))
        .expr("$x".to_string());

    match mork_api_client.dispatch(step_del_request).await {
        Ok(_) => {}
        Err(_) => return Err(Status::InternalServerError),
    };

    let exec_del_request = ClearRequest::new()
        .namespace(PathBuf::from(format!("/{}", prefix_ns)))
        .expr("$x".to_string());

    match mork_api_client.dispatch(exec_del_request).await {
        Ok(_) => {}
        Err(_) => return Err(Status::InternalServerError),
    };

    Ok(Json(true))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////// HELPER FUNCTIONS ////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

/// Converts an integer to a lower case letter
fn int_to_lower(n: u8) -> Option<char> {
    const BASE: u8 = b'a';
    const ALPHABET: usize = 26;

    if n as usize >= ALPHABET {
        return None;
    };

    Some((BASE + n) as char)
}

fn peano(depth: i32) -> String {
    "(S ".repeat(depth as usize) + "Z" + &")".repeat(depth as usize)
}

fn composition_transform(input: SetOperationInput) -> Result<TransformDetails, Status> {
    // Exceed the maximum number of source namespaces for composition, 26
    // and
    // Only one target namespace is allowed
    if input.source.len() > 26 && input.target.len() != 1 {
        return Err(Status::BadRequest);
    }

    let mut template = String::new();

    let patterns = input
        .source
        .iter()
        .enumerate()
        .map(|(index, source_ns)| {
            let c = int_to_lower(index as u8).unwrap();
            template.push('$');
            template.push(c);
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
            "(ns1 (ns1a727d4f9-836a-4e4c-9480 $a))".to_string()
        );
        assert_eq!(
            transform_input.patterns[1].build(),
            "(ns2 (ns2a727d4f9-836a-4e4c-9480 $b))".to_string()
        );
        assert_eq!(
            transform_input.templates[0].build(),
            "(ns3 (ns3a727d4f9-836a-4e4c-9480 $a $b ))".to_string()
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
            "(ns1 (ns1a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
        assert_eq!(
            transform_inputs[1].patterns[0].build(),
            "(ns2 (ns2a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
        assert_eq!(
            transform_inputs[0].templates[0].build(),
            "(ns3 (ns3a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
        assert_eq!(
            transform_inputs[1].templates[0].build(),
            "(ns3 (ns3a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
    }
}
