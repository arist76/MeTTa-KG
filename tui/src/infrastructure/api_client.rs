use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::Value;
use std::time::Duration;

use crate::domain::models::*;

pub struct ApiClient {
    client: Client,
    base_url: String,
    token: std::sync::Arc<parking_lot::Mutex<Option<String>>>,
}

impl ApiClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
            base_url,
            token: std::sync::Arc::new(parking_lot::Mutex::new(None)),
        }
    }

    pub fn set_token(&self, token: String) {
        *self.token.lock() = Some(token);
    }

    /// Check whether a token is set without cloning the value.
    pub fn has_auth_token(&self) -> bool {
        self.token.lock().is_some()
    }

    pub fn get_auth_token(&self) -> Option<String> {
        self.token.lock().clone()
    }

    pub fn clear_token(&self) {
        *self.token.lock() = None;
    }

    fn auth_headers(&self) -> Result<reqwest::header::HeaderMap> {
        let token = self.token.lock().clone().ok_or_else(|| anyhow!("No root token set"))?;
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&token)?,
        );
        Ok(headers)
    }

    /// Remove path traversal components and ensure a single leading `/`.
    fn sanitize_path(path: &str) -> String {
        let parts: Vec<&str> = path
            .split('/')
            .filter(|s| !s.is_empty() && *s != "." && *s != "..")
            .collect();
        if parts.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", parts.join("/"))
        }
    }

    /// Build a space endpoint URL with path sanitization.
    fn space_url(&self, endpoint: &str, path: &str) -> String {
        format!("{}/spaces/{}{}", self.base_url, endpoint, Self::sanitize_path(path))
    }

    /// Perform a GET, retrying once on server errors or timeouts.
    async fn get_retry(&self, url: &str, with_auth: bool) -> Result<reqwest::Response> {
        for i in 0..2 {
            let mut req = self.client.get(url);
            if with_auth {
                req = req.headers(self.auth_headers()?);
            }
            let resp = req.send().await?;
            if resp.status().is_server_error() && i == 0 {
                tokio::time::sleep(Duration::from_millis(100)).await;
                continue;
            }
            return Ok(resp);
        }
        Err(anyhow!("Request failed after retry"))
    }

    // ── Health ────────────────────────────────────────────────────────

    pub async fn health(&self) -> Result<HealthResponse> {
        let url = format!("{}/health", self.base_url);
        let resp = self.get_retry(&url, false).await?;
        Ok(resp.json().await?)
    }

    // ── Tokens ────────────────────────────────────────────────────────

    pub async fn get_tokens(&self) -> Result<Vec<Token>> {
        let url = format!("{}/tokens", self.base_url);
        let resp = self.get_retry(&url, true).await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Failed to get tokens: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn get_token(&self) -> Result<Token> {
        let url = format!("{}/token", self.base_url);
        let resp = self.get_retry(&url, true).await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Failed to get token: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn create_token(&self, data: Value) -> Result<Token> {
        let url = format!("{}/tokens", self.base_url);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(&data)
            .send()
            .await?;
        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to create token: {}", text));
        }
        Ok(resp.json().await?)
    }

    pub async fn delete_token(&self, id: i32) -> Result<()> {
        let url = format!("{}/tokens/{}", self.base_url, id);
        let resp = self.client.delete(&url).headers(self.auth_headers()?).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Failed to delete token"));
        }
        Ok(())
    }

    pub async fn delete_tokens(&self, ids: Vec<i32>) -> Result<i32> {
        let url = format!("{}/tokens", self.base_url);
        let resp = self
            .client
            .delete(&url)
            .headers(self.auth_headers()?)
            .json(&ids)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Failed to delete tokens"));
        }
        Ok(resp.json().await?)
    }

    pub async fn refresh_token(&self, id: i32) -> Result<Token> {
        let url = format!("{}/tokens/{}", self.base_url, id);
        let resp = self.client.post(&url).headers(self.auth_headers()?).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Failed to refresh token"));
        }
        Ok(resp.json().await?)
    }

    // ── Spaces ────────────────────────────────────────────────────────

    pub async fn explore_space(
        &self,
        path: &str,
        pattern: &str,
        token: &str,
    ) -> Result<String> {
        let url = self.space_url("explore", path);
        let body = serde_json::json!({
            "pattern": pattern,
            "token": token,
        });
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Explore failed: {}", resp.status()));
        }
        Ok(resp.text().await?)
    }

    pub async fn read_space(&self, path: &str) -> Result<String> {
        let clean = Self::sanitize_path(path);
        let url = format!("{}/spaces{}", self.base_url, clean);
        let resp = self.get_retry(&url, true).await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Read space failed: {}", resp.status()));
        }
        Ok(resp.text().await?)
    }

    pub async fn upload_space(&self, path: &str, data: String) -> Result<String> {
        let url = self.space_url("upload", path);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .header("Content-Type", "text/plain")
            .body(data)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Upload failed: {}", resp.status()));
        }
        Ok(resp.text().await?)
    }

    /// Import data into a space. The URI is sent in the request body
    /// to avoid leaking it in server access logs.
    pub async fn import_space(&self, path: &str, uri: &str) -> Result<bool> {
        let clean = Self::sanitize_path(path);
        let url = format!("{}/spaces/import/{}", self.base_url, clean.trim_start_matches('/'));
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(&serde_json::json!({ "uri": uri }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Import failed: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn export_space(&self, path: &str, input: &Mm2Input) -> Result<String> {
        let url = self.space_url("export", path);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(input)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Export failed: {}", resp.status()));
        }
        Ok(resp.text().await?)
    }

    /// Clear atoms matching an expression. The expression is sent in the
    /// request body to avoid leaking it in server access logs.
    pub async fn clear_space(&self, path: &str, expression: &str) -> Result<bool> {
        let url = self.space_url("clear", path);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(&serde_json::json!({ "expr": expression }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Clear failed: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn transform(&self, input: &Mm2InputMultiWithNamespace) -> Result<bool> {
        let url = format!("{}/spaces/transform", self.base_url);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(input)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Transform failed: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn composition(&self, input: &SetOperationInput) -> Result<bool> {
        let url = format!("{}/spaces/composition", self.base_url);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(input)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Composition failed: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn intersection(&self, input: &SetOperationInput) -> Result<bool> {
        let url = format!("{}/spaces/intersection", self.base_url);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(input)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Intersection failed: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn union(&self, input: &SetOperationInput) -> Result<bool> {
        let url = format!("{}/spaces/union", self.base_url);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(input)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Union failed: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn is_path_clear(&self, path: &str) -> Result<bool> {
        let url = self.space_url("explore", path);
        let body = serde_json::json!({
            "pattern": "$x",
            "token": "",
        });
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(&body)
            .send()
            .await?;
        Ok(resp.status().is_success())
    }
}
