use anyhow::Result;
use std::sync::Arc;

use crate::domain::models::Token;
use crate::infrastructure::api_client::ApiClient;

pub struct TokenService {
    api: Arc<ApiClient>,
}

impl TokenService {
    pub fn new(api: Arc<ApiClient>) -> Self {
        Self { api }
    }

    pub async fn list_tokens(&self) -> Result<Vec<Token>> {
        self.api.get_tokens().await
    }

    pub async fn get_current_token(&self) -> Result<Token> {
        self.api.get_token().await
    }

    pub async fn create_token(
        &self,
        description: String,
        namespace: String,
        read: bool,
        write: bool,
        share_read: bool,
        share_write: bool,
        share_share: bool,
    ) -> Result<Token> {
        let data = serde_json::json!({
            "id": 0,
            "code": "",
            "description": description,
            "namespace": namespace,
            "creation_timestamp": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
            "permission_read": read,
            "permission_write": write,
            "permission_share_read": share_read,
            "permission_share_write": share_write,
            "permission_share_share": share_share,
            "parent": 0,
        });
        self.api.create_token(data).await
    }

    pub async fn delete_token(&self, id: i32) -> Result<()> {
        self.api.delete_token(id).await
    }

    pub async fn delete_tokens(&self, ids: Vec<i32>) -> Result<i32> {
        self.api.delete_tokens(ids).await
    }

    pub async fn refresh_token(&self, id: i32) -> Result<Token> {
        self.api.refresh_token(id).await
    }

    pub fn set_token(&self, token: String) {
        self.api.set_token(token);
    }

    pub fn clear_token(&self) {
        self.api.clear_token();
    }

    pub fn has_token(&self) -> bool {
        self.api.has_auth_token()
    }
}
