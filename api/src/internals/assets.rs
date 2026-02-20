use rust_embed::RustEmbed;

#[cfg(feature = "mork")]
pub const MORK_BYTES: &[u8] = include_bytes!(env!("MORK_BINARY_PATH"));

#[cfg(not(feature = "mork"))]
pub const MORK_BYTES: &[u8] = &[];

#[cfg(feature = "frontend")]
#[derive(RustEmbed)]
#[folder = "ui-dist/"]
pub struct UiAssets;

#[cfg(not(feature = "frontend"))]
pub struct UiAssets;

#[cfg(not(feature = "frontend"))]
impl UiAssets {
    pub fn get(_path: &str) -> Option<rust_embed::EmbeddedFile> {
        None
    }
}
