use ratatui::prelude::*;
use crossterm::event::{KeyEvent, MouseEvent};
use crate::domain::models::OperationStatus;

pub mod login;
pub mod explore;
pub mod clear;
pub mod transform;
pub mod composition;
pub mod union;
pub mod intersection;
pub mod upload;
pub mod export;
pub mod tokens;
pub mod stubs;

pub trait Screen {
    fn render(&mut self, f: &mut Frame, area: Rect);
    fn handle_key(&mut self, key: KeyEvent) -> Option<ScreenAction>;
    fn handle_mouse(&mut self, _mouse: MouseEvent, _area: Rect) -> Option<ScreenAction> {
        None
    }
    fn handle_paste(&mut self, _text: &str) -> Option<ScreenAction> {
        None
    }
    fn set_namespace(&mut self, _ns: &str) {}
    fn namespace(&self) -> &str { "" }
    fn get_status(&self) -> &OperationStatus;
    fn reset_status(&mut self) {}
    fn update(&mut self) {}
    fn get_id(&self) -> &'static str;
}

#[derive(Debug, Clone, PartialEq)]
pub enum ScreenAction {
    Navigate(&'static str),
    Back,
    Quit,
    None,
    OpenCommandPalette,
}
