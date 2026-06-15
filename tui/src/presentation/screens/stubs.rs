use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::OperationStatus;

pub struct StubScreen {
    name: &'static str,
}

impl StubScreen {
    pub fn new(name: &'static str) -> Self {
        Self { name }
    }
}

impl Screen for StubScreen {
    fn get_id(&self) -> &'static str {
        self.name
    }

    fn get_status(&self) -> &OperationStatus {
        &OperationStatus::Idle
    }

    fn reset_status(&mut self) {}

    fn render(&mut self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        let vertical = Layout::vertical([Constraint::Percentage(40), Constraint::Min(3), Constraint::Percentage(40)]);
        let center = vertical.split(area)[1];

        let horizontal = Layout::horizontal([Constraint::Percentage(25), Constraint::Min(30), Constraint::Percentage(25)]);
        let inner = horizontal.split(center)[1];

        let block = Block::default()
            .title(format!(" {} ", self.name))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.warning));

        let inner_area = block.inner(inner);
        f.render_widget(block, inner);

        let text = Paragraph::new(format!("{} Is Coming Soon", self.name))
            .style(Style::default().fg(theme.text_dim))
            .alignment(Alignment::Center);
        f.render_widget(text, inner_area);
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Esc => Some(ScreenAction::Back),
            _ => None,
        }
    }
}
