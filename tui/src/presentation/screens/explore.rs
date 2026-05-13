use ratatui::prelude::*;
use ratatui::widgets::*;
use crossterm::event::{KeyEvent, KeyCode};
use serde::Deserialize;
use super::{Screen, ScreenAction};
use crate::presentation::theme::*;
use crate::domain::models::OperationStatus;
use crate::application::space_service::SpaceService;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Deserialize)]
pub struct ExploreResponse {
    pub expr: String,
    pub token: Vec<i32>,
    #[serde(default)]
    pub has_more: bool,
}

#[derive(Debug, Clone)]
pub struct TreeNode {
    pub expr: String,
    pub token: Vec<i32>,
    pub children: Vec<TreeNode>,
    pub expanded: bool,
    pub depth: usize,
    pub loaded: bool,
    pub label: String,
}

fn build_label(expr: &str) -> String {
    let trimmed = expr.trim();
    if trimmed.len() <= 80 { trimmed.to_string() }
    else { format!("{}...", &trimmed[..77]) }
}

fn quote_from_bytes(data: &[i32]) -> String {
    let mut result = String::new();
    for &byte in data {
        let b = byte as u8;
        match b {
            b'0'..=b'9' | b'A'..=b'Z' | b'a'..=b'z' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

// Minimal S-expression type for namespace unwrapping
#[derive(Debug, Clone)]
enum SExpr {
    Atom(String),
    List(Vec<SExpr>),
}

fn parse_sexpr(s: &str) -> Option<SExpr> {
    let s = s.trim();
    if s.is_empty() { return None; }
    if !s.starts_with('(') {
        // Atom: take until whitespace or ')'
        let end = s.find(|c: char| c.is_whitespace() || c == ')').unwrap_or(s.len());
        return Some(SExpr::Atom(s[..end].to_string()));
    }
    // List: find matching ')'
    let mut depth = 0;
    let mut items = Vec::new();
    let mut start = 1;
    for (i, c) in s.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    let inner = &s[start..i];
                    // Parse each whitespace-separated token as a child
                    let mut buf = String::new();
                    for ch in inner.chars() {
                        if ch.is_whitespace() {
                            if !buf.is_empty() {
                                if let Some(child) = parse_sexpr(&buf) {
                                    items.push(child);
                                }
                                buf.clear();
                            }
                        } else {
                            buf.push(ch);
                        }
                    }
                    if !buf.is_empty() {
                        if let Some(child) = parse_sexpr(&buf) {
                            items.push(child);
                        }
                    }
                    return Some(SExpr::List(items));
                }
            }
            _ => {}
        }
    }
    None
}

fn serialize_sexpr(expr: &SExpr) -> String {
    match expr {
        SExpr::Atom(s) => s.clone(),
        SExpr::List(items) => {
            let inner: Vec<String> = items.iter().map(serialize_sexpr).collect();
            format!("({})", inner.join(" "))
        }
    }
}

fn unwrap_expr(expr: &str, namespace: &str, data_tag: &str) -> String {
    if !expr.starts_with('(') { return expr.to_string(); }

    let ns_components: Vec<&str> = namespace
        .split('/')
        .filter(|p| !p.is_empty())
        .collect();

    let parsed = match parse_sexpr(expr) {
        Some(p) => p,
        None => return expr.to_string(),
    };

    let mut current = parsed;
    let mut changed = false;

    // Unwrap namespace layers: always starts with "__root__" then each component
    for component in std::iter::once("__root__").chain(ns_components.iter().copied()) {
        match &current {
            SExpr::List(items) if items.len() >= 2 => {
                match &items[0] {
                    SExpr::Atom(a) if a == component => {
                        if let SExpr::List(_) = &items[1] {
                            current = items[1].clone();
                            changed = true;
                            continue;
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
        break;
    }

    // Unwrap data tag: uses .includes() match like frontend
    match &current {
        SExpr::List(items) if items.len() >= 2 => {
            match &items[0] {
                SExpr::Atom(a) if a.contains(data_tag) => {
                    if let SExpr::List(_) = &items[1] {
                        current = items[1].clone();
                        changed = true;
                    }
                }
                _ => {}
            }
        }
        _ => {}
    }

    if changed { serialize_sexpr(&current) } else { expr.to_string() }
}

fn compute_data_tag(namespace: &str) -> String {
    let ns_components: Vec<&str> = namespace
        .split('/')
        .filter(|p| !p.is_empty())
        .collect();
    let current_name = ns_components.last().copied().unwrap_or("root");
    format!("__{}data__", current_name)
}

fn process_response(raw: &str, namespace: &str) -> Vec<TreeNode> {
    let unescaped: Option<String> = serde_json::from_str(raw).ok();
    let inner = unescaped.as_deref().unwrap_or(raw);
    let data_tag = compute_data_tag(namespace);

    serde_json::from_str::<Vec<ExploreResponse>>(inner)
        .unwrap_or_default()
        .into_iter()
        .map(|r| {
            let cleaned = unwrap_expr(&r.expr, namespace, &data_tag);
            let label = build_label(&cleaned);
            TreeNode {
                expr: r.expr, token: r.token,
                children: Vec::new(), expanded: false,
                depth: 0, loaded: false, label,
            }
        })
        .collect()
}

fn collapse_flat(nodes: &mut [TreeNode], target: usize) {
    let mut i = 0usize;
    fn go(nodes: &mut [TreeNode], i: &mut usize, target: usize) -> bool {
        for node in nodes.iter_mut() {
            if *i == target { node.expanded = false; return true; }
            *i += 1;
            if node.expanded && go(&mut node.children, i, target) { return true; }
        }
        false
    }
    go(nodes, &mut i, target);
}

fn set_children_flat(nodes: &mut [TreeNode], target: usize, children: Vec<TreeNode>) {
    let mut i = 0usize;
    fn go(nodes: &mut [TreeNode], i: &mut usize, target: usize, children: &mut Option<Vec<TreeNode>>) -> bool {
        for node in nodes.iter_mut() {
            if *i == target {
                if let Some(ch) = children.take() {
                    node.children = ch; node.expanded = true; node.loaded = true;
                }
                return true;
            }
            *i += 1;
            if node.expanded && go(&mut node.children, i, target, children) { return true; }
        }
        false
    }
    let mut ch = Some(children);
    go(nodes, &mut i, target, &mut ch);
}

pub struct ExploreScreen {
    pub namespace: String,
    pattern: String,
    status: OperationStatus,
    space_service: Option<Arc<SpaceService>>,
    nodes: Vec<TreeNode>,
    selected: usize,
    scroll: usize,
    pending_explore: Arc<Mutex<Option<Result<String, String>>>>,
    pending_read: Arc<Mutex<Option<Result<String, String>>>>,
    pending_expand: Arc<Mutex<Option<(usize, Result<Vec<TreeNode>, String>)>>>,
}

impl ExploreScreen {
    pub fn new() -> Self {
        Self {
            namespace: "/".to_string(),
            pattern: "$x".to_string(),
            status: OperationStatus::Idle,
            space_service: None,
            nodes: Vec::new(),
            selected: 0,
            scroll: 0,
            pending_explore: Arc::new(Mutex::new(None)),
            pending_read: Arc::new(Mutex::new(None)),
            pending_expand: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_space_service(&mut self, service: Arc<SpaceService>) {
        self.space_service = Some(service);
    }

    fn flatten(&self) -> Vec<(usize, &TreeNode)> {
        fn go<'a>(nodes: &'a [TreeNode], depth: usize, out: &mut Vec<(usize, &'a TreeNode)>) {
            for node in nodes {
                out.push((depth, node));
                if node.expanded { go(&node.children, depth + 1, out); }
            }
        }
        let mut out = Vec::new();
        go(&self.nodes, 0, &mut out);
        out
    }
}

impl Screen for ExploreScreen {
    fn get_id(&self) -> &'static str { "explore" }
    fn get_status(&self) -> &OperationStatus { &self.status }
    fn namespace(&self) -> &str { &self.namespace }
    fn set_namespace(&mut self, ns: &str) { self.namespace = ns.to_string(); }

    fn update(&mut self) {
        let result = self.pending_explore.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(raw) => {
                    self.nodes = process_response(&raw, &self.namespace);
                    self.selected = 0;
                    self.scroll = 0;
                    let count = self.nodes.len();
                    self.status = OperationStatus::Completed(
                        if count == 0 { "No nodes found".into() } else { format!("Loaded {} nodes", count) }
                    );
                }
                Err(e) => self.status = OperationStatus::Failed(e),
            }
            return;
        }

        let result = self.pending_read.lock().ok().and_then(|mut g| g.take());
        if let Some(result) = result {
            match result {
                Ok(raw) => {
                    // Unwrap JSON string encoding, then split lines into tree nodes
                    let inner: String = serde_json::from_str(&raw).unwrap_or(raw);
                    let lines: Vec<&str> = inner.lines().filter(|l| !l.trim().is_empty()).collect();
                    self.nodes = lines.into_iter().map(|line| {
                        let label = build_label(line);
                        TreeNode {
                            expr: line.to_string(), token: vec![],
                            children: Vec::new(), expanded: false,
                            depth: 0, loaded: false, label,
                        }
                    }).collect();
                    self.selected = 0;
                    self.scroll = 0;
                    let count = self.nodes.len();
                    self.status = OperationStatus::Completed(
                        if count == 0 { "No data".into() } else { format!("Read {} lines", count) }
                    );
                }
                Err(e) => self.status = OperationStatus::Failed(e),
            }
            return;
        }

        let result = self.pending_expand.lock().ok().and_then(|mut g| g.take());
        if let Some((idx, result)) = result {
            match result {
                Ok(children) => {
                    set_children_flat(&mut self.nodes, idx, children);
                    self.status = OperationStatus::Completed("Expanded".to_string());
                }
                Err(e) => self.status = OperationStatus::Failed(e),
            }
        }
    }

    fn render(&mut self, f: &mut Frame, area: Rect) {
        let theme = AppTheme::dark();
        let chunks = Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(5),
        ]);
        let [header_area, pattern_area, list_area] = chunks.areas(area);

        let header = Paragraph::new(format!("Explore: {}", self.namespace))
            .style(title_style(&theme))
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme.primary)));
        f.render_widget(header, header_area);

        let pattern_border = Style::default().fg(theme.primary);
        let pattern_block = Block::default()
            .title(" Pattern (Enter:explore, R:read, ↑↓:navigate, ←→:expand/collapse) ")
            .borders(Borders::ALL)
            .border_style(pattern_border);
        let pattern_inner = pattern_block.inner(pattern_area);
        f.render_widget(pattern_block, pattern_area);
        f.render_widget(Paragraph::new(self.pattern.as_str()).style(Style::default().fg(theme.text)), pattern_inner);

        let list_block = Block::default()
            .title(" Results ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(theme.border));
        let inner = list_block.inner(list_area);
        f.render_widget(list_block, list_area);

        let flat = self.flatten();
        if flat.is_empty() {
            f.render_widget(
                Paragraph::new("Press Enter to explore").style(Style::default().fg(theme.text_dim)).alignment(Alignment::Center),
                inner,
            );
            return;
        }

        let mut y = inner.y;
        for (i, (depth, node)) in flat.iter().enumerate() {
            if i < self.scroll || i >= self.scroll + inner.height as usize { continue; }
            if y >= inner.y + inner.height { break; }

            let selected = i == self.selected;
            let indent = "  ".repeat(*depth);
            let expand_marker = if node.expanded { "▼" } else if !node.token.is_empty() { "▶" } else { " " };
            let line = format!("{}{} {}", indent, expand_marker, node.label);

            let style = if selected {
                Style::default().bg(theme.primary).fg(Color::Black)
            } else {
                Style::default().fg(theme.text)
            };
            f.render_widget(Paragraph::new(Span::styled(line, style)), Rect::new(inner.x, y, inner.width, 1));
            y += 1;
        }
    }

    fn handle_paste(&mut self, text: &str) -> Option<ScreenAction> {
        self.pattern.push_str(text);
        None
    }

    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction> {
        match key.code {
            KeyCode::Enter => {
                let (service, path, pattern, pending) = (
                    self.space_service.clone(), self.namespace.clone(),
                    self.pattern.clone(), self.pending_explore.clone(),
                );
                if let Some(service) = service {
                    tokio::spawn(async move {
                        let result = service.explore(&path, &pattern, "").await.map_err(|e| e.to_string());
                        *pending.lock().unwrap() = Some(result);
                    });
                }
                self.status = OperationStatus::Running;
                None
            }
            KeyCode::Char('r') | KeyCode::Char('R') => {
                let (service, path, pending) = (
                    self.space_service.clone(), self.namespace.clone(),
                    self.pending_read.clone(),
                );
                if let Some(service) = service {
                    tokio::spawn(async move {
                        let result = service.read(&path).await.map_err(|e| e.to_string());
                        *pending.lock().unwrap() = Some(result);
                    });
                }
                self.status = OperationStatus::Running;
                None
            }
            KeyCode::Char(c) => { self.pattern.push(c); None }
            KeyCode::Backspace => { self.pattern.pop(); None }
            KeyCode::Up => {
                if self.selected > 0 { self.selected -= 1; }
                if self.selected < self.scroll { self.scroll = self.selected; }
                None
            }
            KeyCode::Down => {
                let len = self.flatten().len();
                if len > 0 && self.selected + 1 < len { self.selected += 1; }
                if self.selected >= self.scroll + 10 { self.scroll = self.selected.saturating_sub(5); }
                None
            }
            KeyCode::Right | KeyCode::Left => {
                let (is_expanded, can_expand, token) = {
                    let flat = self.flatten();
                    if self.selected < flat.len() {
                        let (_, n) = &flat[self.selected];
                        (n.expanded, !n.token.is_empty() && !n.token.iter().all(|v| *v == -1), n.token.clone())
                    } else { (false, false, vec![]) }
                };

                if is_expanded {
                    collapse_flat(&mut self.nodes, self.selected);
                    self.status = OperationStatus::Completed("Collapsed".to_string());
                } else if can_expand {
                    let (service, ns, pattern, pending) = (
                        self.space_service.clone(), self.namespace.clone(),
                        self.pattern.clone(), self.pending_expand.clone(),
                    );
                    let idx = self.selected;
                    if let Some(service) = service {
                        tokio::spawn(async move {
                            let token_str = quote_from_bytes(&token);
                            let result = service.explore(&ns, &pattern, &token_str).await.map_err(|e| e.to_string());
                            let children = match &result {
                                Ok(raw) => Ok(process_response(raw, &ns)),
                                Err(e) => Err(e.clone()),
                            };
                            *pending.lock().unwrap() = Some((idx, children));
                        });
                    }
                    self.status = OperationStatus::Running;
                }
                None
            }
            _ => None,
        }
    }
}
