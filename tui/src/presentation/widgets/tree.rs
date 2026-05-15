use ratatui::prelude::*;
use ratatui::widgets::*;
use crate::domain::models::SpaceNode;
use crate::presentation::theme::*;

pub struct TreeWidget {
    pub nodes: Vec<SpaceNode>,
    pub selected: usize,
    pub scroll_offset: usize,
}

impl TreeWidget {
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            selected: 0,
            scroll_offset: 0,
        }
    }

    pub fn set_nodes(&mut self, nodes: Vec<SpaceNode>) {
        self.nodes = nodes;
        self.selected = 0;
        self.scroll_offset = 0;
    }

    pub fn next(&mut self) {
        let total = self.visible_count();
        if total > 0 {
            self.selected = (self.selected + 1).min(total - 1);
        }
    }

    pub fn prev(&mut self) {
        if self.selected > 0 {
            self.selected -= 1;
        }
    }

    pub fn toggle_current(&mut self) {
    }

    fn flatten(&self) -> Vec<(usize, &SpaceNode)> {
        fn flatten_inner<'a>(nodes: &'a [SpaceNode], depth: usize, result: &mut Vec<(usize, &'a SpaceNode)>) {
            for node in nodes {
                result.push((depth, node));
                if node.expanded && !node.children.is_empty() {
                    flatten_inner(&node.children, depth + 1, result);
                }
            }
        }
        let mut result = Vec::new();
        flatten_inner(&self.nodes, 0, &mut result);
        result
    }

    pub fn visible_count(&self) -> usize {
        self.flatten().len()
    }

    pub fn render(&self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        let block = Block::default()
            .title(" Explore ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.border));

        let inner = block.inner(area);
        f.render_widget(block, area);

        if self.nodes.is_empty() {
            let text = Paragraph::new("No data. Navigate to a space and press Explore.")
                .style(Style::default().fg(theme.text_dim))
                .alignment(Alignment::Center);
            f.render_widget(text, inner);
            return;
        }

        let flat = self.flatten();
        let mut y = inner.y;

        for (i, (depth, node)) in flat.iter().enumerate() {
            if i < self.scroll_offset || i >= self.scroll_offset + inner.height as usize {
                continue;
            }
            if y >= inner.y + inner.height {
                break;
            }

            let indent = *depth as u16 * 2;
            let prefix = if node.expanded {
                "▼ "
            } else if !node.children.is_empty() || node.loaded {
                "▶ "
            } else {
                "  "
            };

            let selected = i == self.selected;
            let line_style = if selected {
                Style::default().bg(theme.selection).fg(Color::Black)
            } else {
                Style::default().fg(theme.text)
            };

            let indent_str = " ".repeat(indent as usize);
            let line = format!("{}{}{}", indent_str, prefix, node.expression);
            let max_width = inner.width.saturating_sub(1) as usize;
            let display_line = if line.len() > max_width {
                format!("{}...", &line[..max_width.saturating_sub(3)])
            } else {
                line
            };

            let span = Span::styled(display_line, line_style);
            f.render_widget(Paragraph::new(span), Rect::new(inner.x, y, inner.width, 1));
            y += 1;
        }
    }
}
