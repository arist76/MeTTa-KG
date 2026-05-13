use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::presentation::widgets::tree::TreeWidget;
use crate::domain::models::{SpaceNode, OperationStatus};
use crate::application::space_service::SpaceService;
use std::sync::{Arc, Mutex};

pub struct ExploreScreen {
    pub namespace: String,
    pattern: String,
    tree: TreeWidget,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
    pub focus_tree: bool,
    pending_explore: Arc<Mutex<Option<Result<String, String>>>>,
    pending_read: Arc<Mutex<Option<Result<String, String>>>>,
}

impl ExploreScreen {
    pub fn new() -> Self {
        Self {
            namespace: "/".to_string(),
            pattern: "$x".to_string(),
            tree: TreeWidget::new(),
            status: OperationStatus::Idle,
            space_service: None,
            focus_tree: false,
            pending_explore: Arc::new(Mutex::new(None)),
            pending_read: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }
}

impl Screen for ExploreScreen {
    fn get_id(&self) -> &'static str { "explore" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn namespace(&self) -> &str { &self.namespace }
    fn set_namespace(&mut self, ns: &str) { self.namespace = ns.to_string(); }

    fn update(&mut self) {
        let result = self.pending_explore.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(output) => {
                    let nodes: Vec<SpaceNode> = serde_json::from_str(&output).unwrap_or_else(|_| {
                        output.lines().enumerate().map(|(_i, line)| SpaceNode {
                            expression: line.to_string(),
                            token: String::new(),
                            children: Vec::new(),
                            expanded: false,
                            loaded: false,
                        }).collect()
                    });
                    self.tree.set_nodes(nodes);
                    self.focus_tree = true;
                    self.status = OperationStatus::Completed("Explore complete".to_string());
                }
                Err(e) => {
                    self.status = OperationStatus::Failed(e);
                }
            }
            return;
        }

        let result = self.pending_read.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(output) => {
                    let nodes: Vec<SpaceNode> = output.lines().map(|line| SpaceNode {
                        expression: line.to_string(),
                        token: String::new(),
                        children: Vec::new(),
                        expanded: false,
                        loaded: false,
                    }).collect();
                    self.tree.set_nodes(nodes);
                    self.focus_tree = true;
                    self.status = OperationStatus::Completed("Space read complete".to_string());
                }
                Err(e) => {
                    self.status = OperationStatus::Failed(e);
                }
            }
        }
    }

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();

        let chunks = Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Percentage(50),
        ]);
        let [header_area, pattern_area, result_area] = chunks.areas(area);

        let header = Paragraph::new(format!("Explore: {}", self.namespace))
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.primary)));
        f.render_widget(header, header_area);

        let pattern_border = if self.focus_tree {
            Style::default().fg(theme.border)
        } else {
            Style::default().fg(theme.primary)
        };

        let pattern_block = Block::default()
            .title(format!(" Pattern (Enter:explore, R:read, Tab:tree) "))
            .borders(Borders::ALL)
            .border_style(pattern_border);

        let pattern_inner = pattern_block.inner(pattern_area);
        f.render_widget(pattern_block, pattern_area);

        let pattern_text = Paragraph::new(self.pattern.as_str())
            .style(Style::default().fg(theme.text));
        f.render_widget(pattern_text, pattern_inner);

        self.tree.render(f, result_area, &theme);
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        if !self.focus_tree {
            self.pattern.push_str(text);
        }
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        if self.focus_tree {
            match key.code {
                KeyCode::Up => { self.tree.prev(); None }
                KeyCode::Down => { self.tree.next(); None }
                KeyCode::Tab => { self.focus_tree = false; None }
                KeyCode::Enter => { self.tree.toggle_current(); None }
                _ => None,
            }
        } else {
            match key.code {
                KeyCode::Tab => { self.focus_tree = true; None }
                KeyCode::Enter => {
                    let (service, path, pattern, pending) = (
                        self.space_service.clone(),
                        self.namespace.clone(),
                        self.pattern.clone(),
                        self.pending_explore.clone(),
                    );
                    if let Some(service) = service {
                        tokio::spawn(async move {
                            let result = service.explore(&path, &pattern, "").await.map_err(|e| e.to_string());
                            *pending.lock().unwrap() = Some(result);
                        });
                    }
                    self.status = OperationStatus::Running;
                    None
                }
                KeyCode::Char('r') | KeyCode::Char('R') => {
                    let (service, path, pending) = (
                        self.space_service.clone(),
                        self.namespace.clone(),
                        self.pending_read.clone(),
                    );
                    if let Some(service) = service {
                        tokio::spawn(async move {
                            let result = service.read(&path).await.map_err(|e| e.to_string());
                            *pending.lock().unwrap() = Some(result);
                        });
                    }
                    self.status = OperationStatus::Running;
                    None
                }
                KeyCode::Char(c) => { self.pattern.push(c); None }
                KeyCode::Backspace => { self.pattern.pop(); None }
                _ => None,
            }
        }
    }
}
