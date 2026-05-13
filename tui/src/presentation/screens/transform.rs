use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::{OperationStatus, Mm2Cell, Mm2CellValue, Namespace, Mm2InputMultiWithNamespace};
use crate::application::space_service::SpaceService;
use std::sync::Arc;

pub struct TransformScreen {
    cells: Vec<(String, String, bool)>,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
    focused: usize,
}

impl TransformScreen {
    pub fn new() -> Self {
        Self {
            cells: vec![
                (String::new(), String::new(), true),
                (String::new(), String::new(), false),
            ],
            status: OperationStatus::Idle,
            space_service: None,
            focused: 0,
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }

    fn build_s_expr(&self) -> String {
        let parts: Vec<String> = self.cells.iter().map(|(val, ns, _)| {
            if ns.is_empty() {
                format!("({})", val)
            } else {
                format!("({} {})", val, ns)
            }
        }).collect();
        format!("({})", parts.join(" "))
    }

    // (value, namespace, is_pattern)
    fn focused_value(&mut self) -> &mut String {
        &mut self.cells[self.focused].0
    }
}

impl Screen for TransformScreen {
    fn get_id(&self) -> &'static str { "transform" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn set_namespace(&mut self, _ns: &str) {}
    fn namespace(&self) -> &str { "" }

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();

        let chunks = Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(3),
        ]);
        let [header_area, s_expr_area, cells_area, button_area] = chunks.areas(area);

        let header = Paragraph::new("Transform")
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.primary)));
        f.render_widget(header, header_area);

        let s_expr = Paragraph::new(self.build_s_expr())
            .style(Style::default().fg(theme.accent))
            .block(Block::default().title(" S-Expression ").borders(Borders::ALL).border_style(Style::default().fg(theme.border)));
        f.render_widget(s_expr, s_expr_area);

        let per_cell = cells_area.height.max(3) / self.cells.len().max(1) as u16;
        for (i, (val, ns, is_pattern)) in self.cells.iter().enumerate() {
            let y = cells_area.y + (i as u16 * per_cell);
            let cell_area = Rect::new(cells_area.x, y, cells_area.width, per_cell.saturating_sub(1));

            let focused = self.focused == i;
            let label = if *is_pattern { "Pattern" } else { "Template" };
            let display = format!("[{}] ns:{}", val, ns);
            let content = if focused { format!("{}█", display) } else { display };

            let cell = Paragraph::new(content.as_str())
                .style(Style::default().fg(theme.text))
                .block(Block::default()
                    .title(format!(" {} {} ", label, i + 1))
                    .borders(Borders::ALL)
                    .border_style(if focused { Style::default().fg(theme.primary) } else { Style::default().fg(theme.border) }));
            f.render_widget(cell, cell_area);
        }

        let btn = Block::default()
            .title(" [Enter] Execute [Tab] Focus [A] Add Pattern [T] Add Template ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary));
        f.render_widget(btn, button_area);
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        self.cells[self.focused].0.push_str(text);
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Tab => {
                self.focused = (self.focused + 1) % self.cells.len().max(1);
                None
            }
            KeyCode::Char('a') | KeyCode::Char('A') => {
                self.cells.push((String::new(), String::new(), true));
                None
            }
            KeyCode::Char('t') | KeyCode::Char('T') => {
                self.cells.push((String::new(), String::new(), false));
                None
            }
            KeyCode::Enter => {
                let service = self.space_service.clone();
                if let Some(service) = service {
                    let patterns: Vec<Mm2Cell> = self.cells.iter()
                        .filter(|(_, _, is_p)| *is_p)
                        .map(|(val, ns, _)| Mm2Cell::Pattern(Mm2CellValue {
                            value: val.clone(), namespace: Namespace { path: vec![ns.clone()] },
                        })).collect();
                    let templates: Vec<Mm2Cell> = self.cells.iter()
                        .filter(|(_, _, is_p)| !*is_p)
                        .map(|(val, ns, _)| Mm2Cell::Template(Mm2CellValue {
                            value: val.clone(), namespace: Namespace { path: vec![ns.clone()] },
                        })).collect();
                    let input = Mm2InputMultiWithNamespace { patterns, templates };
                    tokio::spawn(async move { let _ = service.transform(&input).await; });
                }
                self.status = OperationStatus::Running;
                None
            }
            KeyCode::Char(c) => { self.cells[self.focused].0.push(c); None }
            KeyCode::Backspace => { self.cells[self.focused].0.pop(); None }
            _ => None,
        }
    }
}
