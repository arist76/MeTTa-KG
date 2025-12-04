use api::rocket;
use api::routes::spaces::{ExecOperationInput, SetOperationInput};
use httpmock::prelude::*;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use rocket::serde::json::serde_json;
use serial_test::serial;

#[path = "common.rs"]
mod common;

#[tokio::test]
#[serial]
async fn test_restriction_success() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    // Setup mock server
    let server = MockServer::start();
    common::setup(&server.base_url());

    // Create test token
    let token = common::create_test_token("/test/", true, true);
    let _ = common::create_test_token("/test/1/", true, false);
    let _ = common::create_test_token("/test/2/", true, false);
    let _ = common::create_test_token("/test/3/", true, false);

    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/clear/.*").unwrap());
        then.status(200).body("Transform successful");
    });

    server.mock(|when, then| {
        when.method(POST).path("/transform");
        then.status(200).body("Transform successful");
    });

    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let body = serde_json::to_string(&ExecOperationInput {
        base: SetOperationInput {
            source: vec!["test/1/".to_string(), "test/2/".to_string()],
            target: vec!["test/3/".to_string()],
        },
        steps: 12,
    })
    .unwrap();

    let response = client
        .post("/spaces/restriction")
        .body(body)
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await;
    println!("{:?}", body);
    assert_eq!(body.expect("response body"), "true");
    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_non_existent_namespace() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let mm2_input = serde_json::to_string(&ExecOperationInput {
        base: SetOperationInput {
            source: vec!["test/1/".to_string(), "test/2/".to_string()],
            target: vec!["test/3/".to_string()],
        },
        steps: 12,
    })
    .unwrap();

    // Path does not start with /test/
    let response = client
        .post("/spaces/restriction")
        .header(Header::new("authorization", token.code.clone()))
        .json(&mm2_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_existing_empty_namespace() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let mm2_input = serde_json::to_string(&ExecOperationInput {
        base: SetOperationInput {
            source: vec!["test/1/".to_string(), "test/2/".to_string()],
            target: vec!["test/3/".to_string()],
        },
        steps: 12,
    })
    .unwrap();

    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/clear/.*").unwrap());
        then.status(200).body("Transform successful");
    });

    server.mock(|when, then| {
        when.method(POST).path("/transform");
        then.status(200).body("Transform successful");
    });

    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let response = client
        .post("/spaces/restriction")
        .header(Header::new("authorization", token.code.clone()))
        .json(&mm2_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "true");

    common::teardown_database();
}
