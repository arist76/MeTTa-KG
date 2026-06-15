use ratatui::prelude::*;
use ratatui::widgets::*;
use std::collections::VecDeque;
use std::time::Instant;
use crate::presentation::theme::*;

#[derive(Clone)]
pub enum ToastLevel {
    Success,
    Error,
    Info,
    Warning,
}

#[derive(Clone)]
pub struct Toast {
    pub message: String,
    pub level: ToastLevel,
    pub created: Instant,
    pub duration_ms: u128,
}

impl Toast {
    pub fn new(message: String, level: ToastLevel) -> Self {
        let duration_ms = match level {
            ToastLevel::Success => 3000,
            ToastLevel::Error => 5000,
            ToastLevel::Info => 2500,
            ToastLevel::Warning => 4000,
        };
        Self {
            message,
            level,
            created: Instant::now(),
            duration_ms,
        }
    }

    pub fn expired(&self) -> bool {
        self.created.elapsed().as_millis() > self.duration_ms
    }

}

pub struct ToastManager {
    pub toasts: VecDeque<Toast>,
    max_visible: usize,
}

impl ToastManager {
    pub fn new() -> Self {
        Self {
            toasts: VecDeque::new(),
            max_visible: 5,
        }
    }

    pub fn push(&mut self, message: String, level: ToastLevel) {
        if self.toasts.len() >= self.max_visible {
            self.toasts.pop_front();
        }
        self.toasts.push_back(Toast::new(message, level));
    }

    pub fn success(&mut self, msg: String) {
        self.push(msg, ToastLevel::Success);
    }

    pub fn error(&mut self, msg: String) {
        self.push(msg, ToastLevel::Error);
    }

    pub fn info(&mut self, msg: String) {
        self.push(msg, ToastLevel::Info);
    }

    pub fn warning(&mut self, msg: String) {
        self.push(msg, ToastLevel::Warning);
    }

    pub fn remove_expired(&mut self) {
        self.toasts.retain(|t| !t.expired());
    }

    pub fn render(&self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        if self.toasts.is_empty() {
            return;
        }

        let toast_height = 3u16;
        let toast_width = area.width.saturating_sub(8).min(50);
        let start_x = area.width.saturating_sub(toast_width + 2);
        let start_y = area.height.saturating_sub((self.toasts.len() as u16 * (toast_height + 1)).min(area.height.saturating_sub(2)) + 2);

        let mut y = start_y;
        for toast in &self.toasts {
            if y + toast_height > area.height {
                break;
            }

            let toast_area = Rect::new(start_x, y, toast_width, toast_height);
            let (fg, bg, title) = match toast.level {
                ToastLevel::Success => (theme.success, Color::Rgb(5, 46, 22), " ✓ Success "),
                ToastLevel::Error => (theme.error, Color::Rgb(69, 10, 10), " ✗ Error "),
                ToastLevel::Info => (theme.accent, Color::Rgb(8, 47, 73), " ℹ Info "),
                ToastLevel::Warning => (theme.warning, Color::Rgb(64, 52, 4), " ⚠ Warning "),
            };

            let block = Block::default()
                .title(title)
                .borders(Borders::ALL)
                .border_style(Style::default().fg(fg))
                .style(Style::default().bg(bg));

            let inner = block.inner(toast_area);
            f.render_widget(block, toast_area);

            let msg = if toast.message.len() > toast_width.saturating_sub(4) as usize {
                format!("{}...", &toast.message[..toast_width.saturating_sub(7) as usize])
            } else {
                toast.message.clone()
            };

            f.render_widget(
                Paragraph::new(Span::styled(msg, Style::default().fg(theme.text))),
                inner,
            );

            y += toast_height + 1;
        }
    }
}
