use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::OperationStatus;
use crate::application::space_service::SpaceService;
use std::sync::Arc;

pub struct ClearScreen {
    pub namespace: String,
    expression: String,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
}

impl ClearScreen {
    pub fn new() -> Self {
        Self {
            namespace: "/".to_string(),
            expression: String::new(),
            status: OperationStatus::Idle,
            space_service: None,
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }
}

impl Screen for ClearScreen {
    fn get_id(&self) -> &'static str { "clear" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn namespace(&self) -> &str { &self.namespace }
    fn set_namespace(&mut self, ns: &str) { self.namespace = ns.to_string(); }

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();

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
            .title(" Expression (Enter to clear) ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary));

        let expr_inner = expr_block.inner(editor_area);
        f.render_widget(expr_block, editor_area);

        let expr_text = Paragraph::new(self.expression.as_str())
            .style(Style::default().fg(theme.text));
        f.render_widget(expr_text, expr_inner);

        let btn_block = Block::default()
            .title(" [Enter] Clear Data ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.error));
        f.render_widget(btn_block, button_area);
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        self.expression.push_str(text);
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Enter => {
                let service = self.space_service.clone();
                if let Some(service) = service {
                    tokio::spawn(async move {
                        let _ = service.clear("/", "").await;
                    });
                }
                self.status = OperationStatus::Running;
                None
            }
            KeyCode::Char(c) => { self.expression.push(c); None }
            KeyCode::Backspace => { self.expression.pop(); None }
            _ => None,
        }
    }
}
