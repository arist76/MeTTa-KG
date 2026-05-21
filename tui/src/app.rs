use std::sync::Arc;
use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{self, Event, KeyCode, KeyModifiers, KeyEventKind, MouseEvent, MouseEventKind};
use crate::infrastructure::api_client::ApiClient;
use crate::application::token_service::TokenService;
use crate::application::space_service::SpaceService;
use crate::presentation::theme::*;
use crate::presentation::screens::{Screen, ScreenAction};
use crate::presentation::screens::login;
use crate::presentation::screens::explore;
use crate::presentation::screens::clear;
use crate::presentation::screens::transform;
use crate::presentation::screens::composition;
use crate::presentation::screens::union;
use crate::presentation::screens::intersection;
use crate::presentation::screens::upload;
use crate::presentation::screens::export;
use crate::presentation::screens::tokens;
use crate::presentation::screens::stubs;
use crate::presentation::components::sidebar::*;
use crate::presentation::components::status_bar::*;
use crate::presentation::components::command_palette::CommandPalette;
use crate::presentation::widgets::toast::ToastManager;
use crate::domain::models::OperationStatus;

pub struct App {
    pub screen: Box<dyn Screen>,
    pub screens: std::collections::HashMap<&'static str, Box<dyn Screen>>,
    pub active_screen: &'static str,
    pub theme: AppTheme,
    pub quit: bool,
    pub api_client: Arc<ApiClient>,
    pub token_service: Arc<TokenService>,
    pub space_service: Arc<SpaceService>,
    pub status_message: String,
    pub command_palette: CommandPalette,
    pub show_help: bool,
    pub current_namespace: String,
    pub editing_namespace: bool,
    pub     toast_manager: ToastManager,
    last_toast: Option<(&'static str, String)>,
    pub pending_shortcut: Option<char>,
}

impl App {
    pub fn new(backend_url: String) -> Self {
        let api_client = Arc::new(ApiClient::new(backend_url));
        let token_service = Arc::new(TokenService::new(api_client.clone()));
        let space_service = Arc::new(SpaceService::new(api_client.clone()));

        let mut screens: std::collections::HashMap<&'static str, Box<dyn Screen>> =
            std::collections::HashMap::new();

        let mut login = login::LoginScreen::new();
        login.set_token_service(token_service.clone());
        screens.insert("login", Box::new(login));

        let mut explore = explore::ExploreScreen::new();
        explore.set_space_service(space_service.clone());
        screens.insert("explore", Box::new(explore));

        let mut clear = clear::ClearScreen::new();
        clear.set_space_service(space_service.clone());
        screens.insert("clear", Box::new(clear));

        let mut transform = transform::TransformScreen::new();
        transform.set_space_service(space_service.clone());
        screens.insert("transform", Box::new(transform));

        let mut composition = composition::CompositionScreen::new();
        composition.set_space_service(space_service.clone());
        screens.insert("composition", Box::new(composition));

        let mut union = union::UnionScreen::new();
        union.set_space_service(space_service.clone());
        screens.insert("union", Box::new(union));

        let mut intersection = intersection::IntersectionScreen::new();
        intersection.set_space_service(space_service.clone());
        screens.insert("intersection", Box::new(intersection));

        let mut upload = upload::ImportScreen::new();
        upload.set_space_service(space_service.clone());
        screens.insert("import", Box::new(upload));

        let mut export = export::ExportScreen::new();
        export.set_space_service(space_service.clone());
        screens.insert("export", Box::new(export));

        let mut tokens = tokens::TokensScreen::new();
        tokens.set_token_service(token_service.clone());
        screens.insert("tokens", Box::new(tokens));

        screens.insert("difference", Box::new(stubs::StubScreen::new("Difference")));
        screens.insert("restrict", Box::new(stubs::StubScreen::new("Restrict")));
        screens.insert("decapitate", Box::new(stubs::StubScreen::new("Decapitate")));
        screens.insert("head", Box::new(stubs::StubScreen::new("Head")));
        screens.insert("cartesian", Box::new(stubs::StubScreen::new("Cartesian")));

        let initial = "login";
        let screen = screens.remove(initial).unwrap();
        Self {
            screen,
            screens,
            active_screen: initial,
            theme: AppTheme::dark(),
            quit: false,
            api_client,
            token_service,
            space_service,
            status_message: "Ctrl+P: Command Palette | Ctrl+C: Quit".to_string(),
            command_palette: CommandPalette::new(),
            show_help: false,
            current_namespace: "/".to_string(),
            editing_namespace: false,
            toast_manager: ToastManager::new(),
            last_toast: None,
            pending_shortcut: None,
        }
    }

    fn create_screen(&self, id: &'static str) -> Box<dyn Screen> {
        match id {
            "login" => {
                let mut s = login::LoginScreen::new();
                s.set_token_service(self.token_service.clone());
                Box::new(s)
            }
            "explore" => {
                let mut s = explore::ExploreScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "clear" => {
                let mut s = clear::ClearScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "transform" => {
                let mut s = transform::TransformScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "composition" => {
                let mut s = composition::CompositionScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "union" => {
                let mut s = union::UnionScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "intersection" => {
                let mut s = intersection::IntersectionScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "import" => {
                let mut s = upload::ImportScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "export" => {
                let mut s = export::ExportScreen::new();
                s.set_space_service(self.space_service.clone());
                Box::new(s)
            }
            "tokens" => {
                let mut s = tokens::TokensScreen::new();
                s.set_token_service(self.token_service.clone());
                Box::new(s)
            }
            id => Box::new(stubs::StubScreen::new(id)),
        }
    }

    pub fn navigate(&mut self, id: &'static str) {
        if self.active_screen == id || id == "login" {
            return;
        }
        let old_screen_id = self.active_screen;
        let mut old_screen = std::mem::replace(&mut self.screen, Box::new(stubs::StubScreen::new("")));
        old_screen.reset_status();
        self.screens.insert(old_screen_id, old_screen);

        let mut new_screen = if let Some(s) = self.screens.remove(id) {
            s
        } else {
            self.create_screen(id)
        };
        new_screen.set_namespace(&self.current_namespace);
        self.screen = new_screen;
        self.active_screen = id;
    }

    pub fn run(&mut self) -> anyhow::Result<()> {
        let mut terminal = ratatui::init();

        while !self.quit {
            terminal.draw(|f| self.render(f))?;
            self.handle_events()?;
            self.screen.update();
            self.process_toasts();
        }

        ratatui::restore();
        Ok(())
    }

    fn process_toasts(&mut self) {
        self.toast_manager.remove_expired();

        let screen_id = self.screen.get_id();
        let status = self.screen.get_status();
        let toast_key = match status {
            OperationStatus::Completed(msg) => Some((screen_id, format!("ok:{}", msg))),
            OperationStatus::Failed(msg) => Some((screen_id, format!("err:{}", msg))),
            _ => None,
        };

        if let Some(ref key) = toast_key {
            if self.last_toast.as_ref() != Some(key) {
                match status {
                    OperationStatus::Completed(msg) => {
                        self.toast_manager.success(msg.clone());
                    }
                    OperationStatus::Failed(msg) => {
                        self.toast_manager.error(msg.clone());
                    }
                    _ => {}
                }
                self.last_toast = Some(key.clone());
            }
        } else {
            self.last_toast = None;
        }
    }

    fn render(&mut self, f: &mut Frame) {
        let area = f.area();

        if self.show_help {
            self.render_help(f, area);
            return;
        }

        let has_token = self.token_service.has_token();
        let sidebar_w = sidebar_width();
        let ns_h: u16 = 3;
        let footer_h: u16 = 1;

        let main_layout = Layout::horizontal([
            Constraint::Length(sidebar_w),
            Constraint::Min(20),
        ]);
        let [sidebar_area, content_area] = main_layout.areas(area);

        let content_layout = Layout::vertical([
            Constraint::Length(ns_h),
            Constraint::Min(5),
            Constraint::Length(footer_h),
        ]);
        let [ns_bar_area, screen_area, footer_area] = content_layout.areas(content_area);

        render_sidebar(f, sidebar_area, self.active_screen, &self.theme);

        self.render_namespace_bar(f, ns_bar_area, has_token);

        self.screen.render(f, screen_area);

        render_status_bar(
            f,
            footer_area,
            &self.theme,
            &self.status_message,
            "Ctrl+P:Palette  ?:Help  Esc:Back  Ctrl+C:Quit",
        );

        self.toast_manager.render(f, area);
    }

    fn render_namespace_bar(&mut self, f: &mut Frame, area: Rect, _has_token: bool) {
        let theme = &self.theme;
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary));

        let inner = block.inner(area);
        f.render_widget(block, area);

        let chunks = Layout::horizontal([
            Constraint::Length(12),
            Constraint::Min(10),
        ]);
        let [label_area, path_area] = chunks.areas(inner);

        let label = Paragraph::new(" Namespace ")
            .style(Style::default().fg(theme.accent).add_modifier(Modifier::BOLD));
        f.render_widget(label, label_area);

        let path_text = if self.editing_namespace {
            self.current_namespace.clone()
        } else {
            format!(" {}  [Click/Enter to edit]", self.current_namespace)
        };

        let path_style = if self.editing_namespace {
            Style::default().fg(theme.text).bg(theme.surface)
        } else {
            Style::default().fg(theme.primary)
        };

        let path = Paragraph::new(path_text)
            .style(path_style);
        f.render_widget(path, path_area);
    }

    fn render_help(&self, f: &mut Frame, area: Rect) {
        let theme = &self.theme;
        let vertical = Layout::vertical([Constraint::Percentage(20), Constraint::Min(10), Constraint::Percentage(20)]);
        let center = vertical.split(area)[1];

        let horizontal = Layout::horizontal([Constraint::Percentage(20), Constraint::Min(50), Constraint::Percentage(20)]);
        let inner = horizontal.split(center)[1];

        let block = Block::default()
            .title(" Help ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.primary));
        let content = block.inner(inner);
        f.render_widget(block, inner);

        let mut y = content.y;
        let max_y = content.y + content.height;
        let help_items = vec![
            ("?", "Open/close help popup"),
            ("Ctrl+P", "Open command palette"),
            ("Ctrl+C / Ctrl+Q", "Quit application"),
            ("ie", "Open Explore"),
            ("ic", "Open Clear"),
            ("ui", "Open Import"),
            ("ue", "Open Export"),
            ("ut", "Open Tokens"),
            ("1-9", "Transform..Cartesian"),
            ("↑ / ↓ / Tab", "Navigate between elements"),
            ("Enter", "Execute action / submit"),
            ("Esc", "Go back / cancel"),
            ("Mouse click", "Select sidebar item"),
        ];

        for (key, desc) in &help_items {
            let line = Line::from(vec![
                Span::styled(format!(" {:<15} ", key), Style::default().fg(theme.primary).add_modifier(Modifier::BOLD)),
                Span::styled(*desc, Style::default().fg(theme.text)),
            ]);
            f.render_widget(Paragraph::new(line), Rect::new(content.x + 1, y, content.width - 2, 1));
            y += 1;
        }

        y += 1;
        f.render_widget(
            Paragraph::new("Press any key to close")
                .style(Style::default().fg(theme.text_dim))
                .alignment(Alignment::Center),
            Rect::new(content.x, y, content.width, 1),
        );
    }

    fn handle_events(&mut self) -> anyhow::Result<()> {
        if !event::poll(std::time::Duration::from_millis(100))? {
            return Ok(());
        }

        let event = event::read()?;
        match event {
            Event::Key(key) if key.kind == KeyEventKind::Press => {
                if self.show_help {
                    self.show_help = false;
                    return Ok(());
                }

                if self.command_palette.visible {
                    self.handle_command_palette_key(key);
                    return Ok(());
                }

                let is_ctrl = key.modifiers.contains(KeyModifiers::CONTROL);

                if is_ctrl {
                    match key.code {
                        KeyCode::Char('c') | KeyCode::Char('q') => {
                            self.quit = true;
                            return Ok(());
                        }
                        KeyCode::Char('p') => {
                            self.command_palette.toggle();
                            return Ok(());
                        }
                        _ => {}
                    }
                }

                if self.editing_namespace {
                    match key.code {
                        KeyCode::Enter | KeyCode::Esc => {
                            self.editing_namespace = false;
                            self.screen.set_namespace(&self.current_namespace);
                            self.status_message = format!("Namespace: {}", self.current_namespace);
                        }
                        KeyCode::Char(c) => {
                            self.current_namespace.push(c);
                        }
                        KeyCode::Backspace => {
                            self.current_namespace.pop();
                        }
                        _ => {}
                    }
                    return Ok(());
                }

                if key.code == KeyCode::Char('?') {
                    self.show_help = true;
                    return Ok(());
                }

                if let Some(c) = self.pending_shortcut {
                    self.pending_shortcut = None;
                    if c == 'u' || c == 'U' {
                        match key.code {
                            KeyCode::Char('i') | KeyCode::Char('I') => { self.navigate("import"); return Ok(()); }
                            KeyCode::Char('e') | KeyCode::Char('E') => { self.navigate("export"); return Ok(()); }
                            KeyCode::Char('t') | KeyCode::Char('T') => { self.navigate("tokens"); return Ok(()); }
                            _ => {}
                        }
                    } else if c == 'i' || c == 'I' {
                        match key.code {
                            KeyCode::Char('e') | KeyCode::Char('E') => { self.navigate("explore"); return Ok(()); }
                            KeyCode::Char('c') | KeyCode::Char('C') => { self.navigate("clear"); return Ok(()); }
                            _ => {}
                        }
                    }
                }

                if (key.code == KeyCode::Char('u') || key.code == KeyCode::Char('U')) && key.modifiers.is_empty() {
                    self.pending_shortcut = Some('u');
                    return Ok(());
                }
                
                if (key.code == KeyCode::Char('i') || key.code == KeyCode::Char('I')) && key.modifiers.is_empty() {
                    self.pending_shortcut = Some('i');
                    return Ok(());
                }

                match key.code {
                    KeyCode::Char('1') if key.modifiers.is_empty() => { self.navigate("transform"); return Ok(()); }
                    KeyCode::Char('2') if key.modifiers.is_empty() => { self.navigate("composition"); return Ok(()); }
                    KeyCode::Char('3') if key.modifiers.is_empty() => { self.navigate("union"); return Ok(()); }
                    KeyCode::Char('4') if key.modifiers.is_empty() => { self.navigate("intersection"); return Ok(()); }
                    KeyCode::Char('5') if key.modifiers.is_empty() => { self.navigate("difference"); return Ok(()); }
                    KeyCode::Char('6') if key.modifiers.is_empty() => { self.navigate("restrict"); return Ok(()); }
                    KeyCode::Char('7') if key.modifiers.is_empty() => { self.navigate("decapitate"); return Ok(()); }
                    KeyCode::Char('8') if key.modifiers.is_empty() => { self.navigate("head"); return Ok(()); }
                    KeyCode::Char('9') if key.modifiers.is_empty() => { self.navigate("cartesian"); return Ok(()); }
                    KeyCode::Esc => {
                        if self.active_screen == "login" {
                            self.quit = true;
                        } else {
                            self.navigate("explore");
                        }
                    }
                    _ => {
                        if let Some(action) = self.screen.handle_key(key) {
                            match action {
                                ScreenAction::Navigate(id) => self.navigate(id),
                                ScreenAction::Back => {
                                    if self.active_screen != "explore" {
                                        self.navigate("explore");
                                    }
                                }
                                ScreenAction::Quit => self.quit = true,
                                ScreenAction::None => {}
                                ScreenAction::OpenCommandPalette => {
                                    self.command_palette.toggle();
                                }
                            }
                        }
                    }
                }
            }
            Event::Paste(text) => {
                if self.editing_namespace {
                    self.current_namespace.push_str(&text);
                } else if !self.command_palette.visible && !self.show_help {
                    if let Some(action) = self.screen.handle_paste(&text) {
                        match action {
                            ScreenAction::Navigate(id) => self.navigate(id),
                            ScreenAction::Quit => self.quit = true,
                            _ => {}
                        }
                    }
                }
            }
            Event::Mouse(mouse) => {
                self.handle_mouse(mouse);
            }
            _ => {}
        }
        Ok(())
    }

    fn handle_command_palette_key(&mut self, key: crossterm::event::KeyEvent) {
        match key.code {
            KeyCode::Esc => self.command_palette.toggle(),
            KeyCode::Enter => {
                if let Some(id) = self.command_palette.selected_id() {
                    let id_str: &'static str = Box::leak(id.to_string().into_boxed_str());
                    self.navigate(id_str);
                }
                self.command_palette.toggle();
            }
            KeyCode::Up => self.command_palette.prev(),
            KeyCode::Down => self.command_palette.next(),
            KeyCode::Char(c) => self.command_palette.insert_char(c),
            KeyCode::Backspace => self.command_palette.delete_char(),
            _ => {}
        }
    }

    fn handle_mouse(&mut self, mouse: MouseEvent) {
        match mouse.kind {
            MouseEventKind::Down(button) if button == crossterm::event::MouseButton::Left => {
                let sidebar_w = sidebar_width();
                if mouse.column < sidebar_w {
                    let sections = default_sidebar_sections();
                    let mut y = 3u16;
                    for section in &sections {
                        y += 1;
                        for item in &section.items {
                            if mouse.row == y {
                                let id: &'static str = Box::leak(item.id.to_string().into_boxed_str());
                                self.navigate(id);
                                return;
                            }
                            y += 1;
                        }
                        y += 1;
                    }
                }
            }
            _ => {}
        }
        if let Some(action) = self.screen.handle_mouse(mouse, Rect::default()) {
            match action {
                ScreenAction::Navigate(id) => self.navigate(id),
                _ => {}
            }
        }
    }
}
