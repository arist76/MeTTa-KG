use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::presentation::widgets::table::TableWidget;
use crate::domain::models::{Token, OperationStatus};
use crate::application::token_service::TokenService;
use std::sync::Arc;

pub struct TokensScreen {
    tokens: Vec<Token>,
    table: TableWidget,
    status: OperationStatus,
    create_description: String,
    create_namespace: String,
    create_read: bool,
    create_write: bool,
    create_share_read: bool,
    create_share_write: bool,
    create_share_share: bool,
    show_create: bool,
    mode: TokenMode,
    focused_input: usize,
    token_service: Option<Arc<TokenService>>,
}

#[derive(PartialEq)]
enum TokenMode {
    List,
    Create,
}

impl TokensScreen {
    pub fn new() -> Self {
        Self {
            tokens: Vec::new(),
            table: TableWidget::new(vec![
                "ID".into(),
                "Namespace".into(),
                "Description".into(),
                "Read".into(),
                "Write".into(),
                "Created".into(),
            ]),
            status: OperationStatus::Idle,
            create_description: String::new(),
            create_namespace: String::new(),
            create_read: true,
            create_write: true,
            create_share_read: false,
            create_share_write: false,
            create_share_share: false,
            show_create: false,
            mode: TokenMode::List,
            focused_input: 0,
            token_service: None,
        }
    }

    pub fn set_token_service(&mut self, service: Arc<TokenService>) {
        self.token_service = Some(service);
    }

    pub async fn refresh(&mut self) {
        if let Some(ref service) = self.token_service {
            match service.list_tokens().await {
                Ok(tokens) => {
                    self.tokens = tokens;
                    self.table.set_rows(
                        self.tokens
                            .iter()
                            .map(|t| {
                                vec![
                                    t.id.to_string(),
                                    t.namespace.clone(),
                                    truncate(&t.description, 20),
                                    if t.permission_read { "✓" } else { "✗" }.into(),
                                    if t.permission_write { "✓" } else { "✗" }.into(),
                                    t.creation_timestamp[..10].to_string(),
                                ]
                            })
                            .collect(),
                    );
                    self.status = OperationStatus::Completed("Tokens loaded".to_string());
                }
                Err(e) => {
                    self.status = OperationStatus::Failed(e.to_string());
                }
            }
        }
    }

    fn delete_selected(&mut self) {
        let ids = self.table.selected_ids();
        if ids.is_empty() {
            return;
        }
        let token_index = ids[0];
        if token_index < self.tokens.len() {
            let token_id = self.tokens[token_index].id;
            if let Some(ref service) = self.token_service {
                let service = service.clone();
                let id = token_id;
                tokio::spawn(async move {
                    let _ = service.delete_token(id).await;
                });
                self.status = OperationStatus::Running;
            }
        }
    }

    fn refresh_selected(&mut self) {
        let ids = self.table.selected_ids();
        if ids.is_empty() {
            return;
        }
        let token_index = ids[0];
        if token_index < self.tokens.len() {
            let token_id = self.tokens[token_index].id;
            if let Some(ref service) = self.token_service {
                let service = service.clone();
                let id = token_id;
                tokio::spawn(async move {
                    let _ = service.refresh_token(id).await;
                });
                self.status = OperationStatus::Running;
            }
        }
    }

    fn submit_create(&mut self) {
        if let Some(ref service) = self.token_service {
            let desc = self.create_description.clone();
            let ns = self.create_namespace.clone();
            let r = self.create_read;
            let w = self.create_write;
            let sr = self.create_share_read;
            let sw = self.create_share_write;
            let ss = self.create_share_share;
            let service = service.clone();
            tokio::spawn(async move {
                let _ = service.create_token(desc, ns, r, w, sr, sw, ss).await;
            });
            self.status = OperationStatus::Running;
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() > max {
        format!("{}...", &s[..max])
    } else {
        s.to_string()
    }
}

impl Screen for TokensScreen {
    fn get_id(&self) -> &'static str {
        "tokens"
    }

    fn get_status(&self) -> &OperationStatus {
        &self.status
    }

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();

        let chunks = Layout::vertical([Constraint::Min(3), Constraint::Min(10), Constraint::Min(3)]);
        let [header_area, main_area, footer_area] = chunks.areas(area);

        let header = Paragraph::new("Token Management")
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.primary)));
        f.render_widget(header, header_area);

        if self.mode == TokenMode::List {
            let main_chunks = Layout::horizontal([
                Constraint::Percentage(70),
                Constraint::Percentage(30),
            ]);
            let [table_area, actions_area] = main_chunks.areas(main_area);

            self.table.render(f, table_area, &theme);

            let actions_block = Block::default()
                .title(" Actions ")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme.border));

            let inner = actions_block.inner(actions_area);
            f.render_widget(actions_block, actions_area);

            let mut y = inner.y;
            let actions = vec![
                ("[R] Refresh", "Refresh token list"),
                ("[C] Create", "Create new token"),
                ("[D] Delete", "Delete selected token"),
                ("[F] Refresh Code", "Refresh selected token code"),
            ];

            for (key, desc) in &actions {
                let line = Span::styled(
                    format!("{} - {}", key, desc),
                    Style::default().fg(theme.text),
                );
                f.render_widget(Paragraph::new(line), Rect::new(inner.x + 1, y, inner.width - 2, 1));
                y += 1;
            }
        } else {
            let form_block = Block::default()
                .title(" Create Token ")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme.primary));

            let inner = form_block.inner(main_area);
            f.render_widget(form_block, main_area);

            let mut y = inner.y;

            let fields = vec![
                ("Description", &self.create_description),
                ("Namespace (e.g., /test/)", &self.create_namespace),
            ];

            for (i, (label, value)) in fields.iter().enumerate() {
                let border_style = if self.focused_input == i {
                    Style::default().fg(theme.primary)
                } else {
                    Style::default().fg(theme.border)
                };

                let input = Paragraph::new(value.as_str())
                    .style(Style::default().fg(theme.text))
                    .block(
                        Block::default()
                            .title(format!(" {} ", label))
                            .borders(Borders::ALL)
                            .border_style(border_style),
                    );
                f.render_widget(input, Rect::new(inner.x, y, inner.width, 3));
                y += 4;
            }

            let perms = [
                ("Read", self.create_read),
                ("Write", self.create_write),
                ("Share Read", self.create_share_read),
                ("Share Write", self.create_share_write),
                ("Share Share", self.create_share_share),
            ];

            for (i, (label, val)) in perms.iter().enumerate() {
                let idx = i + 2;
                let marker = if *val { "[✓]" } else { "[ ]" };
                let style = if self.focused_input == idx {
                    Style::default().fg(theme.primary).add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(theme.text)
                };
                let line = format!(" {} {}", marker, label);
                f.render_widget(Paragraph::new(Span::styled(line, style)), Rect::new(inner.x + 1, y, inner.width - 2, 1));
                y += 1;
            }

            y += 1;
            let submit = Span::styled(
                "[Enter] Create Token  [Esc] Cancel",
                Style::default().fg(theme.text_dim),
            );
            f.render_widget(Paragraph::new(submit), Rect::new(inner.x + 1, y, inner.width - 2, 1));
        }

        let footer = match &self.status {
            OperationStatus::Running => Paragraph::new("Processing...").style(Style::default().fg(theme.warning)),
            OperationStatus::Completed(msg) => Paragraph::new(msg.as_str()).style(success_style(&theme)),
            OperationStatus::Failed(msg) => Paragraph::new(msg.as_str()).style(error_style(&theme)),
            OperationStatus::Idle => Paragraph::new("").style(Style::default()),
        };
        f.render_widget(footer.block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.border))), footer_area);
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        if self.mode == TokenMode::Create {
            match self.focused_input {
                0 => self.create_description.push_str(text),
                1 => self.create_namespace.push_str(text),
                _ => {}
            }
        }
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match self.mode {
            TokenMode::List => match key.code {
                KeyCode::Char('c') | KeyCode::Char('C') => {
                    self.mode = TokenMode::Create;
                    self.focused_input = 0;
                    None
                }
                KeyCode::Char('r') | KeyCode::Char('R') => {
                    let service = self.token_service.clone();
                    if let Some(service) = service {
                        let service = service.clone();
                        tokio::spawn(async move {
                            let _ = service.list_tokens().await;
                        });
                    }
                    None
                }
                KeyCode::Char('d') | KeyCode::Char('D') => {
                    self.delete_selected();
                    None
                }
                KeyCode::Char('f') | KeyCode::Char('F') => {
                    self.refresh_selected();
                    None
                }
                KeyCode::Up => {
                    self.table.prev();
                    None
                }
                KeyCode::Down => {
                    self.table.next();
                    None
                }
                _ => None,
            },
            TokenMode::Create => match key.code {
                KeyCode::Char(c) => {
                    if self.focused_input == 0 {
                        self.create_description.push(c);
                    } else if self.focused_input == 1 {
                        self.create_namespace.push(c);
                    } else {
                        let perm_idx = self.focused_input - 2;
                        match perm_idx {
                            0 => self.create_read = !self.create_read,
                            1 => self.create_write = !self.create_write,
                            2 => self.create_share_read = !self.create_share_read,
                            3 => self.create_share_write = !self.create_share_write,
                            4 => self.create_share_share = !self.create_share_share,
                            _ => {}
                        }
                    }
                    None
                }
                KeyCode::Backspace => {
                    if self.focused_input == 0 {
                        self.create_description.pop();
                    } else if self.focused_input == 1 {
                        self.create_namespace.pop();
                    }
                    None
                }
                KeyCode::Tab => {
                    self.focused_input = (self.focused_input + 1) % 7;
                    None
                }
                KeyCode::Enter => {
                    if self.focused_input < 2 {
                        self.focused_input = (self.focused_input + 1) % 7;
                    } else {
                        self.submit_create();
                        self.mode = TokenMode::List;
                    }
                    None
                }
                KeyCode::Esc => {
                    self.mode = TokenMode::List;
                    None
                }
                _ => None,
            },
        }
    }
}
