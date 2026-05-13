use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::presentation::widgets::table::TableWidget;
use crate::domain::models::{Token, OperationStatus};
use crate::application::token_service::TokenService;
use std::sync::Arc;
use std::sync::Mutex;

pub struct TokensScreen {
    tokens: Vec<Token>,
    table: TableWidget,
    status: OperationStatus,
    token_service: Option<Arc<TokenService>>,
    should_refresh: bool,
    pending_tokens: Arc<Mutex<Option<Result<Vec<Token>, String>>>>,
    mode: TokenMode,
    focused_input: usize,
    create_description: String,
    create_child_namespace: String,
    create_read: bool,
    create_write: bool,
    create_share_read: bool,
    create_share_write: bool,
    create_share_share: bool,
    selected_parent_idx: usize,
    namespace_picker_visible: bool,
    pending_operation: Arc<Mutex<Option<Result<String, String>>>>,
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
                "Code".into(),
                "Namespace".into(),
                "Description".into(),
                "R".into(),
                "W".into(),
                "Created".into(),
            ]),
            status: OperationStatus::Idle,
            token_service: None,
            should_refresh: true,
            pending_tokens: Arc::new(Mutex::new(None)),
            mode: TokenMode::List,
            focused_input: 0,
            create_description: String::new(),
            create_child_namespace: String::new(),
            create_read: true,
            create_write: false,
            create_share_read: false,
            create_share_write: false,
            create_share_share: false,
            selected_parent_idx: 0,
            namespace_picker_visible: false,
            pending_operation: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_token_service(&mut self, service: Arc<TokenService>) {
        self.token_service = Some(service);
    }

    fn load_tokens_impl(&mut self) {
        if let Some(ref service) = self.token_service {
            let service = service.clone();
            let pending = self.pending_tokens.clone();
            tokio::spawn(async move {
                let result = match service.list_tokens().await {
                    Ok(tokens) => Ok(tokens),
                    Err(e) => Err(e.to_string()),
                };
                *pending.lock().unwrap() = Some(result);
            });
        }
    }

    fn update_table(&mut self) {
        self.table.set_rows(
            self.tokens.iter().map(|t| {
                vec![
                    t.id.to_string(),
                    truncate(&t.code, 8),
                    t.namespace.clone(),
                    truncate(&t.description, 15),
                    if t.permission_read { "✓" } else { " " }.into(),
                    if t.permission_write { "✓" } else { " " }.into(),
                    t.creation_timestamp[..10].to_string(),
                ]
            }).collect(),
        );
    }

    fn available_parents(&self) -> Vec<&Token> {
        self.tokens.iter()
            .filter(|t| t.permission_share_read || t.permission_share_write)
            .collect()
    }

    fn selected_parent(&self) -> Option<&Token> {
        let parents = self.available_parents();
        parents.get(self.selected_parent_idx).copied()
    }

    fn full_namespace(&self) -> String {
        match self.selected_parent() {
            None => "/".to_string(),
            Some(parent) => {
                let child = self.create_child_namespace.trim();
                if child.is_empty() {
                    parent.namespace.clone()
                } else {
                    format!("{}{}/", parent.namespace.trim_end_matches('/'), child)
                }
            }
        }
    }

    fn delete_selected(&mut self) {
        let ids = self.table.selected_ids();
        if ids.is_empty() { return; }
        let token_index = ids[0];
        if token_index < self.tokens.len() {
            let token_id = self.tokens[token_index].id;
            if let Some(ref service) = self.token_service {
                let (service, pending) = (service.clone(), self.pending_operation.clone());
                tokio::spawn(async move {
                    let result = service.delete_token(token_id).await
                        .map(|_| format!("Token {} deleted", token_id))
                        .map_err(|e| e.to_string());
                    *pending.lock().unwrap() = Some(result);
                });
                self.status = OperationStatus::Running;
            }
        }
    }

    fn refresh_selected(&mut self) {
        let ids = self.table.selected_ids();
        if ids.is_empty() { return; }
        let token_index = ids[0];
        if token_index < self.tokens.len() {
            let token_id = self.tokens[token_index].id;
            if let Some(ref service) = self.token_service {
                let (service, pending) = (service.clone(), self.pending_operation.clone());
                tokio::spawn(async move {
                    let result = service.refresh_token(token_id).await
                        .map(|t| format!("Token {} refreshed: {}", token_id, truncate(&t.code, 8)))
                        .map_err(|e| e.to_string());
                    *pending.lock().unwrap() = Some(result);
                });
                self.status = OperationStatus::Running;
            }
        }
    }

    fn submit_create(&mut self) {
        if let Some(ref service) = self.token_service {
            let (ns, desc, r, w, sr, sw, ss) = (
                self.full_namespace(), self.create_description.clone(),
                self.create_read, self.create_write,
                self.create_share_read, self.create_share_write, self.create_share_share,
            );
            let (service, pending) = (service.clone(), self.pending_operation.clone());
            tokio::spawn(async move {
                let result = service.create_token(desc, ns, r, w, sr, sw, ss).await
                    .map(|t| format!("Token created: {} (id={})", truncate(&t.code, 8), t.id))
                    .map_err(|e| e.to_string());
                *pending.lock().unwrap() = Some(result);
            });
            self.mode = TokenMode::List;
            self.should_refresh = true;
            self.status = OperationStatus::Running;
        }
    }

    fn cascade_permissions(&mut self) {
        if !self.create_read {
            self.create_write = false;
            self.create_share_read = false;
            self.create_share_write = false;
            self.create_share_share = false;
        }
        if self.create_write && !self.create_read {
            self.create_read = true;
        }
        if (self.create_share_read || self.create_share_write) && !self.create_read {
            self.create_read = true;
        }
        if self.create_share_write {
            self.create_write = true;
            self.create_share_read = true;
        }
        if self.create_share_share && !self.create_share_write {
            self.create_share_write = true;
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() > max { format!("{}..", &s[..max]) } else { s.to_string() }
}

impl Screen for TokensScreen {
    fn get_id(&self) -> &'static str { "tokens" }
    fn get_status(&self) -> &OperationStatus { &self.status }

    fn update(&mut self) {
        if self.should_refresh {
            self.should_refresh = false;
            self.load_tokens_impl();
        }

        let result = self.pending_tokens.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(tokens) => {
                    self.tokens = tokens;
                    self.update_table();
                    self.status = OperationStatus::Completed("Tokens loaded".to_string());
                }
                Err(e) => {
                    self.status = OperationStatus::Failed(e.to_string());
                }
            }
        }

        let result = self.pending_operation.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(msg) => {
                    self.status = OperationStatus::Completed(msg);
                    self.should_refresh = true;
                }
                Err(e) => {
                    self.status = OperationStatus::Failed(e);
                }
            }
        }
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
                ("[R] Refresh", "Reload token list"),
                ("[C] Create", "Create new token"),
                ("[D] Delete", "Delete selected token"),
                ("[F] Refresh Code", "Regenerate selected token code"),
            ];
            for (key, desc) in &actions {
                f.render_widget(Paragraph::new(Span::styled(
                    format!("{} - {}", key, desc), Style::default().fg(theme.text),
                )), Rect::new(inner.x + 1, y, inner.width - 2, 1));
                y += 1;
            }

            if self.tokens.is_empty() {
                y += 1;
                f.render_widget(Paragraph::new("No tokens loaded yet. Press R to refresh.")
                    .style(Style::default().fg(theme.text_dim)),
                    Rect::new(inner.x + 1, y, inner.width - 2, 1));
            }
        } else {
            let form_block = Block::default()
                .title(" Create Token ")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme.primary));
            let inner = form_block.inner(main_area);
            f.render_widget(form_block, main_area);

            let parents = self.available_parents();
            let mut y = inner.y;

            // Parent namespace picker
            let parent_label = if self.namespace_picker_visible {
                " Select Parent Namespace (↑↓ Enter) "
            } else {
                " Parent Namespace (Enter to pick) "
            };

            if self.namespace_picker_visible {
                let picker_h = (parents.len() as u16).min(6).max(1);
                let picker_area = Rect::new(inner.x, y, inner.width, picker_h + 2);

                let items: Vec<ListItem> = parents.iter().enumerate().map(|(i, t)| {
                    let style = if i == self.selected_parent_idx {
                        Style::default().bg(theme.primary).fg(Color::Black)
                    } else {
                        Style::default().fg(theme.text)
                    };
                    ListItem::new(format!(" {}  {}", t.namespace, t.description)).style(style)
                }).collect();

                let list = List::new(items)
                    .block(Block::default()
                        .title(parent_label)
                        .borders(Borders::ALL)
                        .border_style(Style::default().fg(theme.primary)));
                f.render_widget(list, picker_area);
                y += picker_h + 2;
            } else {
                let selected = parents.get(self.selected_parent_idx).map(|t| t.namespace.as_str()).unwrap_or("/");
                let parent_input = Paragraph::new(selected)
                    .style(Style::default().fg(theme.text))
                    .block(Block::default()
                        .title(parent_label)
                        .borders(Borders::ALL)
                        .border_style(Style::default().fg(theme.border)));
                f.render_widget(parent_input, Rect::new(inner.x, y, inner.width, 3));
                y += 4;
            }

            // Child namespace + full namespace preview
            if !self.namespace_picker_visible && parents.len() > self.selected_parent_idx {
                let ns_border = if self.focused_input == 0 {
                    Style::default().fg(theme.primary)
                } else {
                    Style::default().fg(theme.border)
                };

                let full_ns = self.full_namespace();
                let display = if self.focused_input == 0 {
                    format!("{}█", self.create_child_namespace)
                } else {
                    self.create_child_namespace.clone()
                };

                let child_input = Paragraph::new(display)
                    .style(Style::default().fg(theme.text))
                    .block(Block::default()
                        .title(format!(" Child Namespace  (Full: {})", full_ns))
                        .borders(Borders::ALL)
                        .border_style(ns_border));
                f.render_widget(child_input, Rect::new(inner.x, y, inner.width, 3));
                y += 4;
            }

            if !self.namespace_picker_visible {
                // Description
                let desc_border = if self.focused_input == 1 {
                    Style::default().fg(theme.primary)
                } else {
                    Style::default().fg(theme.border)
                };
                let desc_display = if self.focused_input == 1 {
                    format!("{}█", self.create_description)
                } else {
                    self.create_description.clone()
                };
                let desc_input = Paragraph::new(desc_display)
                    .style(Style::default().fg(theme.text))
                    .block(Block::default()
                        .title(" Description ")
                        .borders(Borders::ALL)
                        .border_style(desc_border));
                f.render_widget(desc_input, Rect::new(inner.x, y, inner.width, 3));
                y += 4;

                // Permissions
                let perms = [
                    ("Read", self.create_read, 2),
                    ("Write", self.create_write, 3),
                    ("Share Read", self.create_share_read, 4),
                    ("Share Write", self.create_share_write, 5),
                    ("Share Share", self.create_share_share, 6),
                ];
                for (label, val, idx) in &perms {
                    let marker = if *val { "[✓]" } else { "[ ]" };
                    let style = if self.focused_input == *idx {
                        Style::default().fg(theme.primary).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default().fg(theme.text)
                    };
                    f.render_widget(Paragraph::new(Span::styled(
                        format!(" {} {}", marker, label), style,
                    )), Rect::new(inner.x + 1, y, inner.width - 2, 1));
                    y += 1;
                }

                y += 1;
                let hint = Span::styled(
                    "[Enter] Submit  [Tab] Next  [Space] Toggle  [Esc] Cancel",
                    Style::default().fg(theme.text_dim),
                );
                f.render_widget(Paragraph::new(hint), Rect::new(inner.x + 1, y, inner.width - 2, 1));
            }
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
                0 => self.create_child_namespace.push_str(text),
                1 => self.create_description.push_str(text),
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
                    self.selected_parent_idx = 0;
                    self.namespace_picker_visible = true;
                    None
                }
                KeyCode::Char('r') | KeyCode::Char('R') => {
                    self.should_refresh = true;
                    None
                }
                KeyCode::Char('d') | KeyCode::Char('D') => { self.delete_selected(); None }
                KeyCode::Char('f') | KeyCode::Char('F') => { self.refresh_selected(); None }
                KeyCode::Up => { self.table.prev(); None }
                KeyCode::Down => { self.table.next(); None }
                _ => None,
            },
            TokenMode::Create => {
                if self.namespace_picker_visible {
                    match key.code {
                        KeyCode::Up => {
                            let count = self.available_parents().len();
                            if count > 0 {
                                self.selected_parent_idx = self.selected_parent_idx.saturating_sub(1);
                            }
                            None
                        }
                        KeyCode::Down => {
                            let count = self.available_parents().len();
                            if count > 0 {
                                self.selected_parent_idx = (self.selected_parent_idx + 1) % count;
                            }
                            None
                        }
                        KeyCode::Enter => {
                            self.namespace_picker_visible = false;
                            self.focused_input = 0;
                            None
                        }
                        KeyCode::Esc => {
                            self.mode = TokenMode::List;
                            None
                        }
                        _ => None,
                    }
                } else {
                    match key.code {
                        KeyCode::Tab => {
                            self.focused_input = (self.focused_input + 1) % 7;
                            None
                        }
                        KeyCode::Char(' ') => {
                            if self.focused_input >= 2 {
                                let perm_idx = self.focused_input - 2;
                                match perm_idx {
                                    0 => self.create_read = !self.create_read,
                                    1 => self.create_write = !self.create_write,
                                    2 => self.create_share_read = !self.create_share_read,
                                    3 => self.create_share_write = !self.create_share_write,
                                    4 => self.create_share_share = !self.create_share_share,
                                    _ => {}
                                }
                                self.cascade_permissions();
                            }
                            None
                        }
                        KeyCode::Char(c) => {
                            match self.focused_input {
                                0 => self.create_child_namespace.push(c),
                                1 => self.create_description.push(c),
                                _ => {
                                    let perm_idx = self.focused_input - 2;
                                    match perm_idx {
                                        0 => self.create_read = !self.create_read,
                                        1 => self.create_write = !self.create_write,
                                        2 => self.create_share_read = !self.create_share_read,
                                        3 => self.create_share_write = !self.create_share_write,
                                        4 => self.create_share_share = !self.create_share_share,
                                        _ => {}
                                    }
                                    self.cascade_permissions();
                                }
                            }
                            None
                        }
                        KeyCode::Backspace => {
                            match self.focused_input {
                                0 => { self.create_child_namespace.pop(); }
                                1 => { self.create_description.pop(); }
                                _ => {}
                            }
                            None
                        }
                        KeyCode::Enter => {
                            if self.focused_input >= 2 {
                                self.submit_create();
                            } else {
                                self.focused_input = (self.focused_input + 1) % 7;
                            }
                            None
                        }
                        KeyCode::Esc => { self.mode = TokenMode::List; None }
                        _ => None,
                    }
                }
            },
        }
    }
}
