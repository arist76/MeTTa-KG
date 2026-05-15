use ratatui::prelude::*;
use ratatui::widgets::*;
use crate::presentation::theme::*;
use crate::presentation::components::sidebar::default_sidebar_sections;

pub struct CommandPalette {
    pub visible: bool,
    pub query: String,
    pub selected: usize,
    pub filtered_items: Vec<&'static str>,
}

impl CommandPalette {
    pub fn new() -> Self {
        Self {
            visible: false,
            query: String::new(),
            selected: 0,
            filtered_items: Vec::new(),
        }
    }

    pub fn toggle(&mut self) {
        self.visible = !self.visible;
        if self.visible {
            self.query.clear();
            self.selected = 0;
            self.update_filter();
        }
    }

    pub fn insert_char(&mut self, c: char) {
        if self.visible {
            self.query.push(c);
            self.selected = 0;
            self.update_filter();
        }
    }

    pub fn delete_char(&mut self) {
        if self.visible && !self.query.is_empty() {
            self.query.pop();
            self.selected = 0;
            self.update_filter();
        }
    }

    pub fn next(&mut self) {
        if !self.filtered_items.is_empty() {
            self.selected = (self.selected + 1) % self.filtered_items.len();
        }
    }

    pub fn prev(&mut self) {
        if !self.filtered_items.is_empty() {
            self.selected = if self.selected == 0 {
                self.filtered_items.len() - 1
            } else {
                self.selected - 1
            };
        }
    }

    fn update_filter(&mut self) {
        let all_items: Vec<&'static str> = default_sidebar_sections()
            .iter()
            .flat_map(|s| s.items.iter().map(|item| item.id))
            .collect();

        if self.query.is_empty() {
            self.filtered_items = all_items;
        } else {
            self.filtered_items = all_items
                .into_iter()
                .filter(|id| id.contains(&self.query.to_lowercase()))
                .collect();
        }
    }

    pub fn selected_id(&self) -> Option<&'static str> {
        if self.filtered_items.is_empty() {
            None
        } else {
            Some(self.filtered_items[self.selected])
        }
    }

    pub fn render(&self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        if !self.visible {
            return;
        }

        let overlay = Rect {
            x: area.width / 4,
            y: area.height / 4,
            width: area.width / 2,
            height: area.height / 2,
        };

        let block = Block::default()
            .title(" Command Palette ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary))
            .bg(theme.background);

        let inner = block.inner(overlay);
        f.render_widget(block, overlay);

        let search_box = Paragraph::new(self.query.as_str())
            .style(Style::default().fg(theme.text))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" Search ")
                    .border_style(Style::default().fg(theme.accent)),
            );
        f.render_widget(search_box, Rect::new(inner.x, inner.y, inner.width, 3));

        let list_area = Rect::new(inner.x, inner.y + 3, inner.width, inner.height.saturating_sub(4));

        let items: Vec<ListItem> = self
            .filtered_items
            .iter()
            .enumerate()
            .map(|(i, id)| {
                let style = if i == self.selected {
                    Style::default().bg(theme.primary).fg(Color::Black)
                } else {
                    Style::default().fg(theme.text)
                };
                ListItem::new(*id).style(style)
            })
            .collect();

        let list = List::new(items);
        f.render_widget(list, list_area);
    }
}
