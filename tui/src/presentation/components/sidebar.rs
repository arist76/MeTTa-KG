use ratatui::prelude::*;
use ratatui::widgets::*;
use crate::presentation::theme::*;

pub struct SidebarItem {
    pub id: &'static str,
    pub label: &'static str,
    pub icon: char,
}

pub struct SidebarSection {
    pub title: &'static str,
    pub items: Vec<SidebarItem>,
}

pub fn default_sidebar_sections() -> Vec<SidebarSection> {
    vec![
        SidebarSection {
            title: "Inspection and Visualization",
            items: vec![
                SidebarItem { id: "explore", label: "Explore", icon: '◎' },
                SidebarItem { id: "clear", label: "Clear", icon: '✕' },
            ],
        },
        SidebarSection {
            title: "Set and Algebraic Operations",
            items: vec![
                SidebarItem { id: "transform", label: "Transform", icon: '↻' },
                SidebarItem { id: "composition", label: "Composition", icon: '∪' },
                SidebarItem { id: "union", label: "Union", icon: '∪' },
                SidebarItem { id: "intersection", label: "Intersection", icon: '∩' },
                SidebarItem { id: "difference", label: "Difference", icon: '∖' },
                SidebarItem { id: "restrict", label: "Restrict", icon: '◁' },
                SidebarItem { id: "decapitate", label: "Decapitate", icon: 'T' },
                SidebarItem { id: "head", label: "Head", icon: 'H' },
                SidebarItem { id: "cartesian", label: "Cartesian", icon: 'X' },
            ],
        },
        SidebarSection {
            title: "Utility",
            items: vec![
                SidebarItem { id: "import", label: "Import", icon: '↑' },
                SidebarItem { id: "export", label: "Export", icon: '↓' },
                SidebarItem { id: "tokens", label: "Tokens", icon: '🔑' },
            ],
        },
    ]
}

pub fn render_sidebar(f: &mut Frame, area: Rect, active_id: &str, theme: &AppTheme) {
    let sections = default_sidebar_sections();

    let block = Block::default()
        .title(" MeTTa-KG ")
        .borders(Borders::RIGHT | Borders::TOP)
        .border_style(Style::default().fg(theme.primary));

    let inner = block.inner(area);
    f.render_widget(block, area);

    let mut y = inner.y;

    let header = Paragraph::new("MeTTa-KG v0.1.0")
        .style(Style::default().fg(theme.primary).add_modifier(Modifier::BOLD))
        .alignment(Alignment::Center);
    f.render_widget(header, Rect::new(inner.x, y, inner.width, 1));
    y += 2;

    for section in &sections {
        if y >= inner.y + inner.height - 1 {
            break;
        }

        let section_title = Span::styled(
            section.title,
            Style::default().fg(theme.accent).add_modifier(Modifier::BOLD),
        );
        f.render_widget(
            Paragraph::new(section_title),
            Rect::new(inner.x + 1, y, inner.width - 2, 1),
        );
        y += 1;

        for item in &section.items {
            if y >= inner.y + inner.height - 1 {
                break;
            }

            let is_active = active_id == item.id;
            let style = if is_active {
                Style::default()
                    .fg(Color::Black)
                    .bg(theme.primary)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(theme.text)
            };

            let line = format!(" {} {}", item.icon, item.label);
            f.render_widget(
                Paragraph::new(Span::styled(line, style)),
                Rect::new(inner.x + 2, y, inner.width - 3, 1),
            );
            y += 1;
        }

        y += 1;
    }
}

pub fn sidebar_width() -> u16 {
    28
}
