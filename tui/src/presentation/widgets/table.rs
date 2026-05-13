use ratatui::prelude::*;
use ratatui::widgets::*;

pub struct TableWidget {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub selected: usize,
    pub column_widths: Vec<u16>,
}

impl TableWidget {
    pub fn new(headers: Vec<String>) -> Self {
        let column_widths = headers.iter().map(|h| h.len() as u16).collect();
        Self {
            headers,
            rows: Vec::new(),
            selected: 0,
            column_widths,
        }
    }

    pub fn set_rows(&mut self, rows: Vec<Vec<String>>) {
        self.rows = rows;
        self.selected = 0;
        for row in &self.rows {
            for (i, cell) in row.iter().enumerate() {
                if i < self.column_widths.len() {
                    let cell_width = cell.len() as u16;
                    let header_width = self.column_widths[i];
                    self.column_widths[i] = header_width.max(cell_width).min(30);
                }
            }
        }
    }

    pub fn next(&mut self) {
        if !self.rows.is_empty() {
            self.selected = (self.selected + 1) % self.rows.len();
        }
    }

    pub fn prev(&mut self) {
        if !self.rows.is_empty() {
            self.selected = if self.selected == 0 {
                self.rows.len() - 1
            } else {
                self.selected - 1
            };
        }
    }

    pub fn selected_ids(&self) -> Vec<usize> {
        if !self.rows.is_empty() {
            vec![self.selected]
        } else {
            Vec::new()
        }
    }

    pub fn render(&self, f: &mut Frame, area: Rect, theme: &crate::presentation::theme::AppTheme) {
        let header_cells: Vec<Cell> = self
            .headers
            .iter()
            .map(|h| Cell::from(h.as_str()).style(Style::default().fg(theme.accent).add_modifier(Modifier::BOLD)))
            .collect();

        let header = Row::new(header_cells).style(Style::default().bg(theme.surface));

        let rows: Vec<Row> = self
            .rows
            .iter()
            .enumerate()
            .map(|(i, row)| {
                let cells: Vec<Cell> = row
                    .iter()
                    .map(|c| Cell::from(c.as_str()).style(Style::default().fg(theme.text)))
                    .collect();
                if i == self.selected {
                    Row::new(cells).style(Style::default().bg(theme.selection).fg(Color::Black))
                } else {
                    Row::new(cells)
                }
            })
            .collect();

        let widths: Vec<Constraint> = self
            .column_widths
            .iter()
            .map(|w| Constraint::Min(*w + 2))
            .collect();

        let table = Table::new(rows, widths)
            .header(header)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(theme.border)),
            );

        f.render_widget(table, area);
    }
}
