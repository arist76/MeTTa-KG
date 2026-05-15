use ratatui::prelude::*;
use ratatui::widgets::*;
use crate::presentation::theme::*;

pub struct EditorWidget {
    pub title: String,
    pub content: String,
    pub cursor_pos: usize,
    pub focused: bool,
}

impl EditorWidget {
    pub fn new(title: &str) -> Self {
        Self {
            title: title.to_string(),
            content: String::new(),
            cursor_pos: 0,
            focused: false,
        }
    }

    pub fn set_content(&mut self, content: String) {
        self.content = content;
        self.cursor_pos = self.content.len();
    }

    pub fn insert_char(&mut self, c: char) {
        self.content.insert(self.cursor_pos, c);
        self.cursor_pos += 1;
    }

    pub fn delete_char(&mut self) {
        if self.cursor_pos > 0 && self.cursor_pos <= self.content.len() {
            self.content.remove(self.cursor_pos - 1);
            self.cursor_pos -= 1;
        }
    }

    pub fn move_cursor_left(&mut self) {
        if self.cursor_pos > 0 {
            self.cursor_pos -= 1;
        }
    }

    pub fn move_cursor_right(&mut self) {
        if self.cursor_pos < self.content.len() {
            self.cursor_pos += 1;
        }
    }

    pub fn move_cursor_home(&mut self) {
        self.cursor_pos = 0;
    }

    pub fn move_cursor_end(&mut self) {
        self.cursor_pos = self.content.len();
    }

    pub fn clear(&mut self) {
        self.content.clear();
        self.cursor_pos = 0;
    }

    pub fn render(&self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        let border_style = if self.focused {
            Style::default().fg(theme.primary)
        } else {
            Style::default().fg(theme.border)
        };

        let block = Block::default()
            .title(format!(" {} ", self.title))
            .borders(Borders::ALL)
            .border_style(border_style);

        let scroll = if self.content.len() > area.height.saturating_sub(2) as usize {
            Some(self.cursor_pos.saturating_sub(area.height.saturating_sub(2) as usize).min(
                self.content.len().saturating_sub(area.height.saturating_sub(2) as usize),
            ))
        } else {
            Some(0)
        };

        let paragraph = Paragraph::new(self.content.as_str())
            .style(Style::default().fg(theme.text))
            .block(block)
            .scroll((scroll.unwrap_or(0) as u16, 0));

        f.render_widget(paragraph, area);

        if self.focused {
            let x = area.x + 1 + (self.cursor_pos as u16).min(area.width.saturating_sub(2));
            let y = area.y + 1 + (self.cursor_pos / area.width.saturating_sub(2).max(1) as usize) as u16;
            f.set_cursor_position(Position::new(x, y));
        }
    }

    pub fn render_multiline(&self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        let border_style = if self.focused {
            Style::default().fg(theme.primary)
        } else {
            Style::default().fg(theme.border)
        };

        let block = Block::default()
            .title(format!(" {} ", self.title))
            .borders(Borders::ALL)
            .border_style(border_style);

        let paragraph = Paragraph::new(self.content.as_str())
            .style(Style::default().fg(theme.text))
            .block(block)
            .wrap(Wrap { trim: false });

        f.render_widget(paragraph, area);

        if self.focused {
            let _line_count = self.content.lines().count().max(1);
            let line_height = area.height.saturating_sub(2).max(1);
            let scroll = self.cursor_pos / area.width.saturating_sub(2).max(1) as usize;
            let x = area.x + 1 + (self.cursor_pos % area.width.saturating_sub(2).max(1) as usize) as u16;
            let y = area.y + 1 + (scroll as u16).min(line_height.saturating_sub(1));
            f.set_cursor_position(Position::new(x, y));
        }
    }
}
