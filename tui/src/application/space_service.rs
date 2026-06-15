use anyhow::Result;
use std::sync::Arc;

use crate::domain::models::*;
use crate::infrastructure::api_client::ApiClient;

pub struct SpaceService {
    api: Arc<ApiClient>,
}

impl SpaceService {
    pub fn new(api: Arc<ApiClient>) -> Self {
        Self { api }
    }

    pub async fn explore(&self, path: &str, pattern: &str, token: &str) -> Result<String> {
        self.api.explore_space(path, pattern, token).await
    }

    pub async fn read(&self, path: &str) -> Result<String> {
        self.api.read_space(path).await
    }

    pub async fn upload(&self, path: &str, data: String) -> Result<String> {
        self.api.upload_space(path, data).await
    }

    pub async fn import(&self, path: &str, uri: &str) -> Result<bool> {
        self.api.import_space(path, uri).await
    }

    pub async fn export(&self, path: &str, input: &Mm2Input) -> Result<String> {
        self.api.export_space(path, input).await
    }

    pub async fn clear(&self, path: &str, expression: &str) -> Result<bool> {
        self.api.clear_space(path, expression).await
    }

    pub async fn transform(&self, input: &Mm2InputMultiWithNamespace) -> Result<bool> {
        self.api.transform(input).await
    }

    pub async fn composition(&self, input: &SetOperationInput) -> Result<bool> {
        self.api.composition(input).await
    }

    pub async fn intersection(&self, input: &SetOperationInput) -> Result<bool> {
        self.api.intersection(input).await
    }

    pub async fn union(&self, input: &SetOperationInput) -> Result<bool> {
        self.api.union(input).await
    }

    pub async fn is_path_clear(&self, path: &str) -> Result<bool> {
        self.api.is_path_clear(path).await
    }
}
