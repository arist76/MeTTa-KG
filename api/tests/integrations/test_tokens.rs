use api::db::establish_connection;
use api::model::{Token, TokenInsert};
use api::rocket;
use api::schema::tokens;
use diesel::prelude::*;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use rocket::serde::json::serde_json;
use serial_test::serial;

use crate::integrations::common;

fn create_child_token(parent_token: &Token, namespace: &str) -> Token {
    let conn = &mut establish_connection();
    let code = format!(
        "child_token_{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    );

    let token_insert = TokenInsert {
        code: code.clone(),
        description: "Child test token".to_string(),
        namespace: namespace.to_string(),
        creation_timestamp: chrono::Utc::now().naive_utc(),
        permission_read: true,
        permission_write: true,
        permission_share_share: false,
        permission_share_read: true,
        permission_share_write: true,
        parent: Some(parent_token.id),
    };

    diesel::insert_into(tokens::table)
        .values(&token_insert)
        .get_result(conn)
        .expect("Failed to insert child test token")
}

fn create_grandchild_token(parent_token: &Token, namespace: &str) -> Token {
    let conn = &mut establish_connection();
    let code = format!(
        "grandchild_token_{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    );

    let token_insert = TokenInsert {
        code: code.clone(),
        description: "Grandchild test token".to_string(),
        namespace: namespace.to_string(),
        creation_timestamp: chrono::Utc::now().naive_utc(),
        permission_read: true,
        permission_write: true,
        permission_share_share: false,
        permission_share_read: false,
        permission_share_write: false,
        parent: Some(parent_token.id),
    };

    diesel::insert_into(tokens::table)
        .values(&token_insert)
        .get_result(conn)
        .expect("Failed to insert grandchild test token")
}

fn count_tokens_in_db() -> i64 {
    let conn = &mut establish_connection();
    tokens::table.count().get_result(conn).unwrap_or(0)
}

fn get_token_by_id(token_id: i32) -> Option<Token> {
    let conn = &mut establish_connection();
    tokens::table
        .filter(tokens::id.eq(token_id))
        .first(conn)
        .ok()
}

#[tokio::test]
#[serial]
async fn test_delete_batch_non_cascading() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }

    let server = httpmock::MockServer::start();
    common::setup(&server.base_url());

    // Create token hierarchy: root -> child -> grandchild
    let root_token = common::create_test_token("/test/", true, true);
    let child_token = create_child_token(&root_token, "/test/child/");
    let grandchild_token = create_grandchild_token(&child_token, "/test/child/grandchild/");

    let initial_count = count_tokens_in_db();

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Test non-cascading delete (default behavior) - should fail due to foreign key constraint
    let response = client
        .delete("/tokens")
        .header(Header::new("authorization", root_token.code.clone()))
        .header(Header::new("content-type", "application/json"))
        .body(format!("[{}]", child_token.id))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Conflict);

    // Verify no tokens were deleted due to foreign key constraint
    assert!(get_token_by_id(child_token.id).is_some());
    assert!(get_token_by_id(grandchild_token.id).is_some());
    assert!(get_token_by_id(root_token.id).is_some());

    let final_count = count_tokens_in_db();
    assert_eq!(final_count, initial_count);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_delete_batch_cascading() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }

    let server = httpmock::MockServer::start();
    common::setup(&server.base_url());

    // Create token hierarchy: root -> child -> grandchild
    let root_token = common::create_test_token("/test/", true, true);
    let child_token = create_child_token(&root_token, "/test/child/");
    let grandchild_token = create_grandchild_token(&child_token, "/test/child/grandchild/");

    let initial_count = count_tokens_in_db();

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Test cascading delete
    let response = client
        .delete("/tokens?cascading=true")
        .header(Header::new("authorization", root_token.code.clone()))
        .header(Header::new("content-type", "application/json"))
        .body(format!("[{}]", child_token.id))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);

    let body = response.into_string().await.expect("response body");
    let rows_affected: i32 = serde_json::from_str(&body).expect("valid JSON");
    assert_eq!(rows_affected, 2); // child + grandchild

    // Verify both child and grandchild were deleted
    assert!(get_token_by_id(child_token.id).is_none());
    assert!(get_token_by_id(grandchild_token.id).is_none());
    assert!(get_token_by_id(root_token.id).is_some());

    let final_count = count_tokens_in_db();
    assert_eq!(final_count, initial_count - 2);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_delete_batch_cascading_false() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }

    let server = httpmock::MockServer::start();
    common::setup(&server.base_url());

    // Create token hierarchy: root -> child -> grandchild
    let root_token = common::create_test_token("/test/", true, true);
    let child_token = create_child_token(&root_token, "/test/child/");
    let grandchild_token = create_grandchild_token(&child_token, "/test/child/grandchild/");

    let initial_count = count_tokens_in_db();

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Test explicit cascading=false - should fail due to foreign key constraint
    let response = client
        .delete("/tokens?cascading=false")
        .header(Header::new("authorization", root_token.code.clone()))
        .header(Header::new("content-type", "application/json"))
        .body(format!("[{}]", child_token.id))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Conflict);

    // Verify no tokens were deleted due to foreign key constraint
    assert!(get_token_by_id(child_token.id).is_some());
    assert!(get_token_by_id(grandchild_token.id).is_some());
    assert!(get_token_by_id(root_token.id).is_some());

    let final_count = count_tokens_in_db();
    assert_eq!(final_count, initial_count);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_delete_batch_multiple_tokens() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }

    let server = httpmock::MockServer::start();
    common::setup(&server.base_url());

    // Create multiple child tokens
    let root_token = common::create_test_token("/test/", true, true);
    let child1 = create_child_token(&root_token, "/test/child1/");
    let child2 = create_child_token(&root_token, "/test/child2/");
    let grandchild1 = create_grandchild_token(&child1, "/test/child1/grandchild/");

    let initial_count = count_tokens_in_db();

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Test cascading delete with multiple tokens
    let response = client
        .delete("/tokens?cascading=true")
        .header(Header::new("authorization", root_token.code.clone()))
        .header(Header::new("content-type", "application/json"))
        .body(format!("[{},{}]", child1.id, child2.id))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);

    let body = response.into_string().await.expect("response body");
    let rows_affected: i32 = serde_json::from_str(&body).expect("valid JSON");
    assert_eq!(rows_affected, 3); // child1 + child2 + grandchild1

    // Verify all specified tokens and their descendants were deleted
    assert!(get_token_by_id(child1.id).is_none());
    assert!(get_token_by_id(child2.id).is_none());
    assert!(get_token_by_id(grandchild1.id).is_none());
    assert!(get_token_by_id(root_token.id).is_some());

    let final_count = count_tokens_in_db();
    assert_eq!(final_count, initial_count - 3);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_delete_batch_empty_list() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }

    let server = httpmock::MockServer::start();
    common::setup(&server.base_url());

    let root_token = common::create_test_token("/test/", true, true);
    let initial_count = count_tokens_in_db();

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Test with empty token list
    let response = client
        .delete("/tokens")
        .header(Header::new("authorization", root_token.code.clone()))
        .header(Header::new("content-type", "application/json"))
        .body("[]")
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);

    let body = response.into_string().await.expect("response body");
    let rows_affected: i32 = serde_json::from_str(&body).expect("valid JSON");
    assert_eq!(rows_affected, 0);

    // Verify no tokens were deleted
    assert!(get_token_by_id(root_token.id).is_some());
    let final_count = count_tokens_in_db();
    assert_eq!(final_count, initial_count);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_delete_batch_non_cascading_leaf_token() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }

    let server = httpmock::MockServer::start();
    common::setup(&server.base_url());

    // Create token hierarchy: root -> child (leaf token)
    let root_token = common::create_test_token("/test/", true, true);
    let child_token = create_child_token(&root_token, "/test/child/");

    let initial_count = count_tokens_in_db();

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Test non-cascading delete of leaf token (should succeed)
    let response = client
        .delete("/tokens")
        .header(Header::new("authorization", root_token.code.clone()))
        .header(Header::new("content-type", "application/json"))
        .body(format!("[{}]", child_token.id))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);

    let body = response.into_string().await.expect("response body");
    let rows_affected: i32 = serde_json::from_str(&body).expect("valid JSON");
    assert_eq!(rows_affected, 1);

    // Verify leaf token was deleted
    assert!(get_token_by_id(child_token.id).is_none());
    assert!(get_token_by_id(root_token.id).is_some());

    let final_count = count_tokens_in_db();
    assert_eq!(final_count, initial_count - 1);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_delete_batch_unauthorized() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }

    let server = httpmock::MockServer::start();
    common::setup(&server.base_url());

    // Create tokens with different parent
    let root_token1 = common::create_test_token("/test1/", true, true);
    let root_token2 = common::create_test_token("/test2/", true, true);
    let child_of_token2 = create_child_token(&root_token2, "/test2/child/");

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Try to delete token that belongs to another parent
    let response = client
        .delete("/tokens")
        .header(Header::new("authorization", root_token1.code.clone()))
        .header(Header::new("content-type", "application/json"))
        .body(format!("[{}]", child_of_token2.id))
        .dispatch()
        .await;

    // Should return 0 rows affected since token doesn't belong to this parent
    assert_eq!(response.status(), Status::Ok);

    let body = response.into_string().await.expect("response body");
    let rows_affected: i32 = serde_json::from_str(&body).expect("valid JSON");
    assert_eq!(rows_affected, 0);

    // Verify token was not deleted
    assert!(get_token_by_id(child_of_token2.id).is_some());

    common::teardown_database();
}
