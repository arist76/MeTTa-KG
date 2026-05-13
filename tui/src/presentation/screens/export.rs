use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::{OperationStatus, Mm2Input};
use crate::application::space_service::SpaceService;
use std::sync::{Arc, Mutex};

pub struct ExportScreen {
    pub namespace: String,
    pattern: String,
    template: String,
    format: String,
    output: String,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
    focused: usize,
    pending_result: Arc<Mutex<Option<Result<String, String>>>>,
}

impl ExportScreen {
    pub fn new() -> Self {
        Self {
            namespace: "/".to_string(),
            pattern: "$x".to_string(),
            template: "$x".to_string(),
            format: "metta".to_string(),
            output: String::new(),
            status: OperationStatus::Idle,
            space_service: None,
            focused: 0,
            pending_result: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }

    fn current_field(&mut self) -> &mut String {
        match self.focused {
            0 => &mut self.pattern,
            1 => &mut self.template,
            _ => &mut self.pattern,
        }
    }

    fn cycle_format(&mut self) {
        self.format = match self.format.as_str() {
            "metta" => "json",
            "json" => "csv",
            "csv" => "raw",
            _ => "metta",
        }.to_string();
    }
}

impl Screen for ExportScreen {
    fn get_id(&self) -> &'static str { "export" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn reset_status(&mut self) { self.status = OperationStatus::Idle; self.output.clear(); }
    fn namespace(&self) -> &str { &self.namespace }
    fn set_namespace(&mut self, ns: &str) { self.namespace = ns.to_string(); }

    fn update(&mut self) {
        let result = self.pending_result.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(output) => {
                    let cleaned = output
                        .strip_prefix('"')
                        .and_then(|s| s.strip_suffix('"'))
                        .unwrap_or(&output)
                        .replace("\\n", "\n")
                        .replace("\\t", "\t")
                        .replace("\\\"", "\"")
                        .replace("\\\\", "\\");
                    self.output = cleaned;
                    self.status = OperationStatus::Completed("Export complete".to_string());
                }
                Err(e) => {
                    self.status = OperationStatus::Failed(e);
                }
            }
        }
    }

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();
        let chunks = Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(3),
        ]);
        let [header_area, pattern_area, template_area, output_area, button_area] = chunks.areas(area);

        let header = Paragraph::new(format!("Export: {}", self.namespace))
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.primary)));
        f.render_widget(header, header_area);

        let fields = [
            (" Pattern ", 0, &self.pattern),
            (" Template ", 1, &self.template),
        ];

        for (title, idx, val) in &fields {
            let focused = self.focused == *idx;
            let display = if focused { format!("{}█", val) } else { val.to_string() };
            let y = if *idx == 0 { pattern_area.y } else { template_area.y };
            let area = Rect::new(pattern_area.x, y, pattern_area.width, 3);

            let input = Paragraph::new(display)
                .style(Style::default().fg(theme.text))
                .block(Block::default()
                    .title(*title)
                    .borders(Borders::ALL)
                    .border_style(if focused { Style::default().fg(theme.primary) } else { Style::default().fg(theme.border) }));
            f.render_widget(input, area);
        }

        let output_view = Paragraph::new(if self.output.is_empty() { "Run export to see results..." } else { &self.output })
            .style(Style::default().fg(theme.text))
            .block(Block::default()
                .title(format!(" Output ({}) ", self.format))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme.border)))
            .wrap(Wrap { trim: false });
        f.render_widget(output_view, output_area);

        f.render_widget(Block::default()
            .title(format!(" [Enter] Export [Tab] Focus [F] Format: {} ", self.format))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary)), button_area);
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        self.current_field().push_str(text);
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Tab => { self.focused = (self.focused + 1) % 2; None }
            KeyCode::Char('f') | KeyCode::Char('F') => { self.cycle_format(); None }
            KeyCode::Enter => {
                let service = self.space_service.clone();
                if let Some(service) = service {
                    let input = Mm2Input { pattern: self.pattern.clone(), template: self.template.clone() };
                    let path = format!("/{}", self.namespace.trim_start_matches('/'));
                    let pending = self.pending_result.clone();
                    tokio::spawn(async move {
                        let result = service.export(&path, &input).await.map_err(|e| e.to_string());
                        *pending.lock().unwrap() = Some(result);
                    });
                }
                self.status = OperationStatus::Running;
                None
            }
            KeyCode::Char(c) => { self.current_field().push(c); None }
            KeyCode::Backspace => { self.current_field().pop(); None }
            _ => None,
        }
    }
}
