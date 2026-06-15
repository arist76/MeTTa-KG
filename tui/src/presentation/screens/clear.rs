use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::OperationStatus;
use crate::application::space_service::SpaceService;
use std::sync::{Arc, Mutex};

pub struct ClearScreen {
    pub namespace: String,
    expression: String,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
    pending_result: Arc<Mutex<Option<Result<bool, String>>>>,
    confirming: bool,
}

impl ClearScreen {
    pub fn new() -> Self {
        Self {
            namespace: "/".to_string(),
            expression: String::new(),
            status: OperationStatus::Idle,
            space_service: None,
            pending_result: Arc::new(Mutex::new(None)),
            confirming: false,
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }

    fn execute_clear(&mut self) {
        let (service, path, expr, pending) = (
            self.space_service.clone(),
            self.namespace.clone(),
            self.expression.clone(),
            self.pending_result.clone(),
        );
        if let Some(service) = service {
            tokio::spawn(async move {
                let result = service.clear(&path, &expr).await.map_err(|e| e.to_string());
                *pending.lock().unwrap() = Some(result);
            });
        }
        self.status = OperationStatus::Running;
    }
}

impl Screen for ClearScreen {
    fn get_id(&self) -> &'static str { "clear" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn reset_status(&mut self) { self.status = OperationStatus::Idle; }
    fn namespace(&self) -> &str { &self.namespace }
    fn set_namespace(&mut self, ns: &str) { self.namespace = ns.to_string(); }

    fn update(&mut self) {
        let result = self.pending_result.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(true) => self.status = OperationStatus::Completed("Space cleared".to_string()),
                Ok(false) => self.status = OperationStatus::Failed("Clear returned false".to_string()),
                Err(e) => self.status = OperationStatus::Failed(e),
            }
        }
    }
    fn render(&mut self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        let chunks = Layout::vertical([
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(3),
        ]);
        let [header_area, editor_area, button_area] = chunks.areas(area);

        let header = Paragraph::new(format!("Clear Space: {}", self.namespace))
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.error)));
        f.render_widget(header, header_area);

        let expr_block = Block::default()
            .title(" Expression ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary));
        let expr_inner = expr_block.inner(editor_area);
        f.render_widget(expr_block, editor_area);
        let expr_text = Paragraph::new(format!("{}█", self.expression))
            .style(Style::default().fg(theme.text));
        f.render_widget(expr_text, expr_inner);

        let btn_block = Block::default()
            .title(" [Enter] Clear Data ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.error));
        f.render_widget(btn_block, button_area);

        if self.confirming {
            let overlay = Rect {
                x: area.width / 4,
                y: area.height / 3,
                width: area.width / 2,
                height: 5,
            };
            let confirm_block = Block::default()
                .title(" Confirm ")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme.warning))
                .bg(theme.background);
            let confirm_inner = confirm_block.inner(overlay);
            f.render_widget(confirm_block, overlay);
            let msg = Paragraph::new("Are you sure? This will clear data in the space.\n\nEnter to confirm  Esc to cancel")
                .style(Style::default().fg(theme.text))
                .alignment(Alignment::Center);
            f.render_widget(msg, confirm_inner);
        }
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        self.expression.push_str(text);
        None
    }
    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        if self.confirming {
            match key.code {
                KeyCode::Enter => {
                    self.confirming = false;
                    self.execute_clear();
                }
                KeyCode::Esc => {
                    self.confirming = false;
                }
                _ => {}
            }
            return None;
        }
        match key.code {
            KeyCode::Enter => { self.confirming = true; None }
            KeyCode::Char(c) => { self.expression.push(c); None }
            KeyCode::Backspace => { self.expression.pop(); None }
            _ => None,
        }
    }

}
