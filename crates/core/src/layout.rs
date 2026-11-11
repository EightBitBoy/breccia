//! The fixed names in a notes folder: where pages, journals and the settings live.

use std::path::{Path, PathBuf};

/// The folder of pages, at any depth below it.
pub const PAGES: &str = "pages";
/// The folder of journal days, one level deep.
pub const JOURNALS: &str = "journals";
/// The folder of Breccia's own files.
pub const CONFIG_DIR: &str = "breccia";
/// The settings file in [`CONFIG_DIR`].
pub const CONFIG_FILE: &str = "config.toml";
/// The settings file relative to the notes folder, as the watcher and Git name it.
pub const CONFIG_REL: &str = "breccia/config.toml";

/// `<root>/breccia/config.toml`.
pub fn config_path(root: &Path) -> PathBuf {
    root.join(CONFIG_DIR).join(CONFIG_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_config_names_agree() {
        assert_eq!(CONFIG_REL, format!("{CONFIG_DIR}/{CONFIG_FILE}"));
        assert_eq!(config_path(Path::new("n")), Path::new("n").join(CONFIG_REL));
    }
}
