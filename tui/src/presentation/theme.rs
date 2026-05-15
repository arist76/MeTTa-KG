use ratatui::style::{Color, Style};

pub struct AppTheme {
    pub primary: Color,
    pub secondary: Color,
    pub background: Color,
    pub surface: Color,
    pub text: Color,
    pub text_dim: Color,
    pub accent: Color,
    pub error: Color,
    pub success: Color,
    pub warning: Color,
    pub border: Color,
    pub selection: Color,
    pub highlight: Color,
}

impl AppTheme {
    pub fn dark() -> Self {
        Self {
            primary: Color::Rgb(34, 197, 94),
            secondary: Color::Rgb(100, 116, 139),
            background: Color::Rgb(15, 23, 42),
            surface: Color::Rgb(30, 41, 59),
            text: Color::Rgb(226, 232, 240),
            text_dim: Color::Rgb(148, 163, 184),
            accent: Color::Rgb(56, 189, 248),
            error: Color::Rgb(239, 68, 68),
            success: Color::Rgb(34, 197, 94),
            warning: Color::Rgb(250, 204, 21),
            border: Color::Rgb(51, 65, 85),
            selection: Color::Rgb(34, 197, 94),
            highlight: Color::Rgb(30, 41, 59),
        }
    }
}

pub fn primary_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.primary)
}

pub fn text_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.text)
}

pub fn text_dim_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.text_dim)
}

pub fn error_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.error)
}

pub fn success_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.success)
}

pub fn selected_style(theme: &AppTheme) -> Style {
    Style::default().bg(theme.selection).fg(Color::Black)
}

pub fn title_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.primary).add_modifier(ratatui::style::Modifier::BOLD)
}

pub fn label_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.text_dim).add_modifier(ratatui::style::Modifier::BOLD)
}

pub fn section_style(theme: &AppTheme) -> Style {
    Style::default().fg(theme.accent).add_modifier(ratatui::style::Modifier::BOLD)
}
