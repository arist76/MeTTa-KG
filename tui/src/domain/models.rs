use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Token {
    pub id: i32,
    pub code: String,
    pub description: String,
    pub namespace: String,
    pub creation_timestamp: String,
    pub permission_read: bool,
    pub permission_write: bool,
    pub permission_share_read: bool,
    pub permission_share_write: bool,
    pub permission_share_share: bool,
    pub parent: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExploreInput {
    pub pattern: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mm2Input {
    pub pattern: String,
    pub template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mm2InputMulti {
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mm2CellValue {
    pub value: String,
    pub namespace: Namespace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Namespace {
    pub path: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Mm2Cell {
    Pattern(Mm2CellValue),
    Template(Mm2CellValue),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mm2InputMultiWithNamespace {
    pub patterns: Vec<Mm2Cell>,
    pub templates: Vec<Mm2Cell>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetOperationInput {
    pub source: Vec<String>,
    pub target: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum AppScreen {
    Login,
    Explore,
    Clear,
    Transform,
    Composition,
    Union,
    Intersection,
    Difference,
    Restrict,
    Decapitate,
    Head,
    Cartesian,
    Import,
    Export,
    Tokens,
}

#[derive(Debug, Clone)]
pub struct ExploreDetail {
    pub expression: String,
    pub token: String,
    pub has_more: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SpaceNode {
    pub expression: String,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub children: Vec<SpaceNode>,
    #[serde(default)]
    pub expanded: bool,
    #[serde(default)]
    pub loaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
}

#[derive(Debug, Clone)]
pub enum OperationStatus {
    Idle,
    Running,
    Completed(String),
    Failed(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum ImportTab {
    Url,
    File,
    Text,
}

#[derive(Debug, Clone)]
pub struct ImportState {
    pub active_tab: ImportTab,
    pub url: String,
    pub path: String,
    pub format: String,
    pub text_input: String,
    pub file_path: String,
    pub status: OperationStatus,
}

impl Default for ImportState {
    fn default() -> Self {
        Self {
            active_tab: ImportTab::Url,
            url: String::new(),
            path: String::new(),
            format: "metta".to_string(),
            text_input: String::new(),
            file_path: String::new(),
            status: OperationStatus::Idle,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExportState {
    pub path: String,
    pub pattern: String,
    pub template: String,
    pub format: String,
    pub output: String,
    pub status: OperationStatus,
}

impl Default for ExportState {
    fn default() -> Self {
        Self {
            path: String::new(),
            pattern: "$x".to_string(),
            template: "$x".to_string(),
            format: "metta".to_string(),
            output: String::new(),
            status: OperationStatus::Idle,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ClearState {
    pub path: String,
    pub expression: String,
    pub status: OperationStatus,
}

impl Default for ClearState {
    fn default() -> Self {
        Self {
            path: String::new(),
            expression: String::new(),
            status: OperationStatus::Idle,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TransformCell {
    pub value: String,
    pub namespace: String,
    pub is_pattern: bool,
}

#[derive(Debug, Clone)]
pub struct TransformState {
    pub cells: Vec<TransformCell>,
    pub status: OperationStatus,
}

impl Default for TransformState {
    fn default() -> Self {
        Self {
            cells: vec![
                TransformCell {
                    value: String::new(),
                    namespace: String::new(),
                    is_pattern: true,
                },
                TransformCell {
                    value: String::new(),
                    namespace: String::new(),
                    is_pattern: false,
                },
            ],
            status: OperationStatus::Idle,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CompositionState {
    pub sources: Vec<String>,
    pub target: String,
    pub status: OperationStatus,
}

impl Default for CompositionState {
    fn default() -> Self {
        Self {
            sources: vec![String::new(), String::new()],
            target: String::new(),
            status: OperationStatus::Idle,
        }
    }
}

#[derive(Debug, Clone)]
pub struct UnionState {
    pub sources: Vec<String>,
    pub target: String,
    pub status: OperationStatus,
}

impl Default for UnionState {
    fn default() -> Self {
        Self {
            sources: vec![String::new(), String::new()],
            target: String::new(),
            status: OperationStatus::Idle,
        }
    }
}

#[derive(Debug, Clone)]
pub struct IntersectionState {
    pub sources: Vec<String>,
    pub target: String,
    pub status: OperationStatus,
}

impl Default for IntersectionState {
    fn default() -> Self {
        Self {
            sources: vec![String::new(), String::new()],
            target: String::new(),
            status: OperationStatus::Idle,
        }
    }
}
