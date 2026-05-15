use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::OperationStatus;
use crate::application::token_service::TokenService;
use std::sync::Arc;

pub struct LoginScreen {
    token_input: String,
    cursor_pos: usize,
    error_message: String,
    status: OperationStatus,
    token_service: Option<Arc<TokenService>>,
}

impl LoginScreen {
    pub fn new() -> Self {
        Self {
            token_input: String::new(),
            cursor_pos: 0,
            error_message: String::new(),
            status: OperationStatus::Idle,
            token_service: None,
        }
    }

    pub fn set_token_service(&mut self, service: Arc<TokenService>) {
        self.token_service = Some(service);
    }

    pub fn get_token(&self) -> String {
        self.token_input.clone()
    }

    fn insert_char(&mut self, c: char) {
        self.token_input.insert(self.cursor_pos, c);
        self.cursor_pos += 1;
    }

    fn delete_char(&mut self) {
        if self.cursor_pos > 0 {
            self.token_input.remove(self.cursor_pos - 1);
            self.cursor_pos -= 1;
        }
    }

    fn move_left(&mut self) {
        if self.cursor_pos > 0 {
            self.cursor_pos -= 1;
        }
    }

    fn move_right(&mut self) {
        if self.cursor_pos < self.token_input.len() {
            self.cursor_pos += 1;
        }
    }
}

impl Screen for LoginScreen {
    fn get_id(&self) -> &'static str {
        "login"
    }

    fn get_status(&self) -> &OperationStatus {
        &self.status
    }

    fn reset_status(&mut self) {
        self.status = OperationStatus::Idle;
    }

    fn update(&mut self) {}

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();

        let vertical = Layout::vertical([Constraint::Percentage(40), Constraint::Min(5), Constraint::Percentage(40)]);
        let top = vertical.split(area)[1];

        let horizontal = Layout::horizontal([Constraint::Percentage(30), Constraint::Min(40), Constraint::Percentage(30)]);
        let center = horizontal.split(top)[1];

        let block = Block::default()
            .title(" MeTTa-KG Terminal Client ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary));

        let inner = block.inner(center);
        f.render_widget(block, center);

        let mut y = inner.y;

        let title = Paragraph::new("Enter your Root Token")
            .style(title_style(&theme))
            .alignment(Alignment::Center);
        f.render_widget(title, Rect::new(inner.x, y, inner.width, 1));
        y += 2;

        let masked: String = self.token_input.chars().map(|_| '*').collect();
        let input_style = if self.error_message.is_empty() {
            Style::default().fg(theme.text)
        } else {
            Style::default().fg(theme.error)
        };

        let input = Paragraph::new(masked.as_str())
            .style(input_style)
            .block(
                Block::default()
                    .title(" Root Token (hidden)")
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(theme.accent)),
            );
        f.render_widget(input, Rect::new(inner.x, y, inner.width, 3));
        y += 4;

        if !self.error_message.is_empty() {
            let error = Paragraph::new(self.error_message.as_str())
                .style(error_style(&theme))
                .alignment(Alignment::Center);
            f.render_widget(error, Rect::new(inner.x, y, inner.width, 1));
            y += 1;
        }

        let hint = Paragraph::new("Press Enter to connect | Tab to see all servers | Ctrl+C to quit")
            .style(text_dim_style(&theme))
            .alignment(Alignment::Center);
        f.render_widget(hint, Rect::new(inner.x, y, inner.width, 1));
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        for c in text.chars() {
            self.token_input.insert(self.cursor_pos, c);
            self.cursor_pos += 1;
        }
        self.error_message.clear();
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Char(c) => {
                self.insert_char(c);
                self.error_message.clear();
                None
            }
            KeyCode::Backspace => {
                self.delete_char();
                None
            }
            KeyCode::Left => {
                self.move_left();
                None
            }
            KeyCode::Right => {
                self.move_right();
                None
            }
            KeyCode::Home => {
                self.cursor_pos = 0;
                None
            }
            KeyCode::End => {
                self.cursor_pos = self.token_input.len();
                None
            }
            KeyCode::Enter => {
                if self.token_input.is_empty() {
                    self.error_message = "Token cannot be empty".to_string();
                    return None;
                }
                if let Some(ref service) = self.token_service {
                    service.set_token(self.token_input.clone());
                    self.status = OperationStatus::Completed("Connected".to_string());
                }
                Some(ScreenAction::Navigate("explore"))
            }
            KeyCode::Esc => {
                Some(ScreenAction::Quit)
            }
            _ => None,
        }
    }
}
