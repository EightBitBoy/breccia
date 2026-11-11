//! Task states, boards and Git settings from `<root>/breccia/config.toml`.

mod file;
mod model;
mod range;
mod toml_keep;

pub use file::Expect;
pub use model::*;

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("config.toml changed on disk since it was read")]
    Changed,
    #[error("cannot read config: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid config: {0}")]
    Toml(String),
    #[error("invalid state keyword: {0:?}")]
    InvalidKeyword(String),
    #[error("duplicate state: {0}")]
    DuplicateState(String),
    #[error("config defines no states")]
    NoStates,
    #[error("invalid board: {0}")]
    InvalidBoard(String),
    #[error("invalid state: {0}")]
    InvalidState(String),
    #[error("{0}")]
    InvalidSetting(&'static str),
}
