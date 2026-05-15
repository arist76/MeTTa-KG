use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::Value;

use crate::domain::models::*;

pub struct ApiClient {
    client: Client,
    base_url: String,
    token: std::sync::Arc<parking_lot::Mutex<Option<String>>>,
}

impl ApiClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
            token: std::sync::Arc::new(parking_lot::Mutex::new(None)),
        }
    }

    pub fn set_token(&self, token: String) {
        *self.token.lock() = Some(token);
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

    pub async fn health(&self) -> Result<HealthResponse> {
        let url = format!("{}/health", self.base_url);
        let resp = self.client.get(&url).send().await?;
        Ok(resp.json().await?)
    }

    pub async fn get_tokens(&self) -> Result<Vec<Token>> {
        let url = format!("{}/tokens", self.base_url);
        let resp = self.client.get(&url).headers(self.auth_headers()?).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Failed to get tokens: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn get_token(&self) -> Result<Token> {
        let url = format!("{}/token", self.base_url);
        let resp = self.client.get(&url).headers(self.auth_headers()?).send().await?;
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

    pub async fn explore_space(
        &self,
        path: &str,
        pattern: &str,
        token: &str,
    ) -> Result<String> {
        let url = format!("{}/spaces/explore{}", self.base_url, path);
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
        let url = format!("{}/spaces{}", self.base_url, path);
        let resp = self.client.get(&url).headers(self.auth_headers()?).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Read space failed: {}", resp.status()));
        }
        Ok(resp.text().await?)
    }

    pub async fn upload_space(&self, path: &str, data: &str) -> Result<String> {
        let url = format!("{}/spaces/upload{}", self.base_url, path);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .header("Content-Type", "text/plain")
            .body(data.to_string())
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Upload failed: {}", resp.status()));
        }
        Ok(resp.text().await?)
    }

    pub async fn import_space(&self, path: &str, uri: &str) -> Result<bool> {
        let encoded: String = url::form_urlencoded::byte_serialize(uri.as_bytes()).collect();
        let url = format!("{}/spaces/import/{}?uri={}", self.base_url, path.trim_start_matches('/'), encoded);
        let resp = self
            .client
            .post(&url)
            .headers(self.auth_headers()?)
            .json(&serde_json::json!({}))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Import failed: {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn export_space(&self, path: &str, input: &Mm2Input) -> Result<String> {
        let url = format!("{}/spaces/export{}", self.base_url, path);
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

    pub async fn clear_space(&self, path: &str, expression: &str) -> Result<bool> {
        let encoded: String = url::form_urlencoded::byte_serialize(expression.as_bytes()).collect();
        let url = format!("{}/spaces/clear{}?expr={}", self.base_url, path, encoded);
        let resp = self.client.post(&url).headers(self.auth_headers()?).send().await?;
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
        let url = format!("{}/spaces/explore{}", self.base_url, path.trim_end_matches('/'));
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
