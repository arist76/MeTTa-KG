use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::{OperationStatus, ImportTab};
use crate::application::space_service::SpaceService;
use std::sync::{Arc, Mutex};

pub struct ImportScreen {
    pub active_tab: ImportTab,
    pub namespace: String,
    pub url: String,
    pub text_input: String,
    pub file_path: String,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
    pending_result: Arc<Mutex<Option<Result<String, String>>>>,
}

impl ImportScreen {
    pub fn new() -> Self {
        Self {
            active_tab: ImportTab::Url,
            namespace: "/".to_string(),
            url: String::new(),
            text_input: String::new(),
            file_path: String::new(),
            status: OperationStatus::Idle,
            space_service: None,
            pending_result: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }

    fn current_field(&mut self) -> &mut String {
        match self.active_tab {
            ImportTab::Url => &mut self.url,
            ImportTab::File => &mut self.file_path,
            ImportTab::Text => &mut self.text_input,
        }
    }
}

impl Screen for ImportScreen {
    fn get_id(&self) -> &'static str { "import" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn reset_status(&mut self) { self.status = OperationStatus::Idle; }
    fn namespace(&self) -> &str { &self.namespace }
    fn set_namespace(&mut self, ns: &str) { self.namespace = ns.to_string(); }

    fn update(&mut self) {
        let result = self.pending_result.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(msg) => self.status = OperationStatus::Completed(msg),
                Err(e) => self.status = OperationStatus::Failed(e),
            }
        }
    }

    fn render(&mut self, f: &mut Frame, area: Rect, theme: &AppTheme) {
        let chunks = Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(3),
        ]);
        let [header_area, tabs_area, content_area, button_area] = chunks.areas(area);

        let header = Paragraph::new(format!("Import Data  [namespace: {}]", self.namespace))
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.primary)));
        f.render_widget(header, header_area);

        let tabs = [("URL", ImportTab::Url), ("File", ImportTab::File), ("Text", ImportTab::Text)];
        let tab_w = tabs_area.width / 3;
        for (i, (label, tab)) in tabs.iter().enumerate() {
            let x = tabs_area.x + (i as u16 * tab_w);
            let style = if self.active_tab == *tab {
                Style::default().fg(Color::Black).bg(theme.primary).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(theme.text)
            };
            f.render_widget(Paragraph::new(Span::styled(*label, style)).alignment(Alignment::Center),
                Rect::new(x, tabs_area.y, tab_w, tabs_area.height));
        }

        let content = match self.active_tab {
            ImportTab::Url => &self.url,
            ImportTab::File => &self.file_path,
            ImportTab::Text => &self.text_input,
        };

        let content_block = Paragraph::new(format!("{}█", content))
            .style(Style::default().fg(theme.text))
            .block(Block::default()
                .title(match self.active_tab {
                    ImportTab::Url => " URL ",
                    ImportTab::File => " File Path ",
                    ImportTab::Text => " MeTTa Text ",
                })
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme.primary)));
        f.render_widget(content_block, content_area);

        f.render_widget(Block::default()
            .title(format!(" [Enter] Import into {} [Tab] Switch Tab ", self.namespace))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary)), button_area);
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        self.current_field().push_str(text);
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Tab => {
                self.active_tab = match self.active_tab {
                    ImportTab::Url => ImportTab::File,
                    ImportTab::File => ImportTab::Text,
                    ImportTab::Text => ImportTab::Url,
                };
                None
            }
            KeyCode::Enter => {
                let (service, pending) = (self.space_service.clone(), self.pending_result.clone());
                let ns = self.namespace.clone();
                if let Some(service) = service {
                    match self.active_tab {
                        ImportTab::Url => {
                            let url = self.url.clone();
                            tokio::spawn(async move {
                                let result = service.import(&ns, &url).await
                                    .map(|_| format!("Import from URL into {} completed", ns))
                                    .map_err(|e| e.to_string());
                                *pending.lock().unwrap() = Some(result);
                            });
                        }
                        ImportTab::Text => {
                            let text = self.text_input.clone();
                            tokio::spawn(async move {
                                let result = service.upload(&ns, text).await
                                    .map(|r| format!("Uploaded into {}: {}", ns, r))
                                    .map_err(|e| e.to_string());
                                *pending.lock().unwrap() = Some(result);
                            });
                        }
                        ImportTab::File => {
                            *pending.lock().unwrap() = Some(Err("File import not implemented in TUI".to_string()));
                        }
                    }
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
