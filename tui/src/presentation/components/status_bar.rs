use ratatui::prelude::*;
use ratatui::widgets::*;
use crate::presentation::theme::*;

pub fn render_status_bar(f: &mut Frame, area: Rect, theme: &AppTheme, message: &str, key_hints: &str) {
    let bg = theme.surface;
    let block = Block::default()
        .style(Style::default().bg(bg));

    let inner = block.inner(area);
    f.render_widget(block, area);

    let message_span = Span::styled(
        message,
        Style::default().fg(theme.text_dim).bg(bg),
    );

    let hints_span = Span::styled(
        key_hints,
        Style::default().fg(theme.text_dim).bg(bg),
    );

    let line = Line::from(vec![message_span, hints_span.into()]);

    let text = Text::from(line);
    f.render_widget(Paragraph::new(text).style(Style::default().bg(bg)), inner);
}
