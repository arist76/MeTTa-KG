use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::{OperationStatus, SetOperationInput};
use crate::application::space_service::SpaceService;
use std::sync::{Arc, Mutex};

struct Focus(usize);

pub struct CompositionScreen {
    pub sources: Vec<String>,
    pub target: String,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
    focused: Focus,
    field_count: usize,
    pending_result: Arc<Mutex<Option<Result<bool, String>>>>,
}

impl CompositionScreen {
    pub fn new() -> Self {
        Self {
            sources: vec![String::new(), String::new()],
            target: String::new(),
            status: OperationStatus::Idle,
            space_service: None,
            focused: Focus(0),
            field_count: 3,
            pending_result: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }

    fn add_source(&mut self) {
        self.sources.push(String::new());
        self.field_count = self.sources.len() + 1;
    }
}

impl Screen for CompositionScreen {
    fn get_id(&self) -> &'static str { "composition" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn set_namespace(&mut self, _ns: &str) {}

    fn update(&mut self) {
        let result = self.pending_result.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(true) => self.status = OperationStatus::Completed("Composition completed".to_string()),
                Ok(false) => self.status = OperationStatus::Failed("Composition returned false".to_string()),
                Err(e) => self.status = OperationStatus::Failed(e),
            }
        }
    }

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();
        let chunks = Layout::vertical([
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(3),
            Constraint::Length(3),
        ]);
        let [header_area, sources_area, target_area, button_area] = chunks.areas(area);

        let header = Paragraph::new("Composition")
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.primary)));
        f.render_widget(header, header_area);

        let per_cell = sources_area.height.max(3) / self.sources.len().max(1) as u16;
        for (i, src) in self.sources.iter().enumerate() {
            let y = sources_area.y + (i as u16 * per_cell);
            let cell_area = Rect::new(sources_area.x, y, sources_area.width, per_cell.saturating_sub(1));
            let focused = self.focused.0 == i;
            let display = if focused { format!("{}█", src) } else { src.clone() };
            let cell = Paragraph::new(display)
                .style(Style::default().fg(theme.text))
                .block(Block::default()
                    .title(format!(" Source {} ", i + 1))
                    .borders(Borders::ALL)
                    .border_style(if focused { Style::default().fg(theme.primary) } else { Style::default().fg(theme.border) }));
            f.render_widget(cell, cell_area);
        }

        let t_focused = self.focused.0 == self.sources.len();
        let t_display = if t_focused { format!("{}█", self.target) } else { self.target.clone() };
        let target_input = Paragraph::new(t_display)
            .style(Style::default().fg(theme.text))
            .block(Block::default()
                .title(" Target ")
                .borders(Borders::ALL)
                .border_style(if t_focused { Style::default().fg(theme.primary) } else { Style::default().fg(theme.border) }));
        f.render_widget(target_input, target_area);

        f.render_widget(Block::default()
            .title(" [Enter] Execute [Tab] Focus [A] Add Source ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary)), button_area);
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        let i = self.focused.0;
        if i < self.sources.len() { self.sources[i].push_str(text); } else { self.target.push_str(text); }
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Tab => { self.focused.0 = (self.focused.0 + 1) % self.field_count; None }
            KeyCode::Char('a') | KeyCode::Char('A') => { self.add_source(); None }
            KeyCode::Enter => {
                let (service, pending) = (self.space_service.clone(), self.pending_result.clone());
                if let Some(service) = service {
                    let input = SetOperationInput { source: self.sources.clone(), target: vec![self.target.clone()] };
                    tokio::spawn(async move {
                        let result = service.composition(&input).await.map_err(|e| e.to_string());
                        *pending.lock().unwrap() = Some(result);
                    });
                }
                self.status = OperationStatus::Running;
                None
            }
            KeyCode::Char(c) => {
                let i = self.focused.0;
                if i < self.sources.len() { self.sources[i].push(c); } else { self.target.push(c); }
                None
            }
            KeyCode::Backspace => {
                let i = self.focused.0;
                if i < self.sources.len() { self.sources[i].pop(); } else { self.target.pop(); }
                None
            }
            _ => None,
        }
    }
}
