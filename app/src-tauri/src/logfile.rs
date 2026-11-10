//! The log file: warnings, errors, panics and (with `BRECCIA_TRACE`) timings go
//! through the `log` facade to `breccia.log` in the app's log folder and to
//! stderr. Two files of at most `LOG_CAP` bytes are kept, nothing is deleted by
//! age. The log may hold file and folder paths; it never holds note text, file
//! contents or search text.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

use log::{Level, LevelFilter, Log, Metadata, Record};

pub const LOG_FILE: &str = "breccia.log";
pub const OLD_LOG_FILE: &str = "breccia.1.log";
/// The size at which `breccia.log` is moved to `breccia.1.log`.
pub const LOG_CAP: u64 = 1_000_000;

/// The log folder: `<override>/logs` under `BRECCIA_CONFIG_DIR`, so a test run
/// never writes into an installed Breccia's log; else `default`.
pub fn log_dir_for(config_override: Option<&Path>, default: Option<PathBuf>) -> Option<PathBuf> {
    match config_override {
        Some(dir) => Some(dir.join("logs")),
        None => default,
    }
}

struct Inner {
    dir: Option<PathBuf>,
    file: Option<File>,
    size: u64,
    cap: u64,
}

impl Inner {
    fn open_file(dir: &Path) -> Option<(File, u64)> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join(LOG_FILE))
            .ok()?;
        let size = file.metadata().map(|m| m.len()).unwrap_or(0);
        Some((file, size))
    }

    /// Moves `breccia.log` to `breccia.1.log` (replacing it) and starts a new one.
    fn rotate(&mut self) {
        let Some(dir) = self.dir.clone() else { return };
        // Windows refuses to rename an open file.
        self.file = None;
        let moved = fs::rename(dir.join(LOG_FILE), dir.join(OLD_LOG_FILE)).is_ok();
        if !moved {
            let _ = fs::remove_file(dir.join(LOG_FILE));
        }
        let (file, size) = Inner::open_file(&dir).unzip();
        self.file = file;
        self.size = size.unwrap_or(0);
    }

    fn write(&mut self, line: &str) {
        let need = line.len() as u64 + 1;
        if self.file.is_some() && self.size > 0 && self.size + need > self.cap {
            self.rotate();
        }
        if let Some(file) = &mut self.file {
            // A failed write drops the line; logging never fails the app.
            if writeln!(file, "{line}").is_ok() {
                self.size += need;
            }
        }
    }
}

/// The logger: a size-capped file, and stderr.
pub struct LogFile {
    inner: Mutex<Inner>,
}

impl LogFile {
    /// Opens `breccia.log` in `dir` (created if missing) for appending. A
    /// folder or file that cannot be opened leaves a logger that writes to
    /// stderr only.
    pub fn open(dir: &Path, cap: u64) -> LogFile {
        let opened = fs::create_dir_all(dir)
            .ok()
            .and_then(|()| Inner::open_file(dir));
        let (file, size) = opened.unzip();
        LogFile {
            inner: Mutex::new(Inner {
                dir: file.is_some().then(|| dir.to_path_buf()),
                file,
                size: size.unwrap_or(0),
                cap,
            }),
        }
    }

    /// A logger without a file.
    pub fn stderr_only() -> LogFile {
        LogFile {
            inner: Mutex::new(Inner {
                dir: None,
                file: None,
                size: 0,
                cap: LOG_CAP,
            }),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Appends one line (without its newline) to the file, rotating first
    /// when it would pass the cap.
    pub fn write_line(&self, line: &str) {
        self.lock().write(line);
    }

    /// The panic hook's path: the file only (the previous hook prints to
    /// stderr), and no waiting for a lock that the panicking thread may hold.
    fn try_write_line(&self, line: &str) {
        let mut inner = match self.inner.try_lock() {
            Ok(inner) => inner,
            Err(std::sync::TryLockError::Poisoned(e)) => e.into_inner(),
            Err(std::sync::TryLockError::WouldBlock) => return,
        };
        inner.write(line);
    }
}

/// `<local time> <LEVEL> <target>: <redacted message>`.
fn format_line(level: Level, target: &str, message: &str) -> String {
    format!(
        "{} {:<5} {}: {}",
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f%:z"),
        level,
        target,
        redact(message)
    )
}

/// Only Breccia's own records (`breccia_core`, `breccia_lib`, the `trace` and
/// `panic` targets): the libraries below it (tauri, tao, wry, notify) are
/// chatty and may quote paths and window text.
fn accepts(target: &str) -> bool {
    target.starts_with("breccia") || target == "trace" || target == "panic"
}

impl Log for LogFile {
    fn enabled(&self, metadata: &Metadata) -> bool {
        accepts(metadata.target())
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let message = record.args().to_string();
        // Stderr gets the bare message, as the old stderr print had it; the e2e
        // trace summary parses these lines. Plain `writeln!`: the print macro panics when
        // stderr is closed.
        let _ = writeln!(std::io::stderr(), "{message}");
        self.write_line(&format_line(record.level(), record.target(), &message));
    }

    fn flush(&self) {}
}

fn is_url_scheme_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')
}

/// In every `scheme://userinfo@host`, the credentials become `***`: the whole
/// user-info part of an `http` or `https` URL (a token may stand alone), and
/// `user:secret` of any other scheme. `ssh://git@host` and `git@host:path`
/// carry no secret and stay.
pub fn redact(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while let Some(at) = rest.find("://") {
        let (head, tail) = rest.split_at(at + 3);
        out.push_str(head);
        let scheme: String = head[..at]
            .chars()
            .rev()
            .take_while(|c| is_url_scheme_char(*c))
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        let end = tail
            .find(|c: char| {
                c.is_whitespace() || matches!(c, '/' | '?' | '#' | '"' | '\'' | '<' | '>')
            })
            .unwrap_or(tail.len());
        let (authority, after) = tail.split_at(end);
        match authority.rfind('@') {
            Some(i) => {
                let user = &authority[..i];
                let web =
                    scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https");
                if web || user.contains(':') {
                    out.push_str("***");
                } else {
                    out.push_str(user);
                }
                out.push_str(&authority[i..]);
            }
            None => out.push_str(authority),
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

/// The line for a panic. A panic message can quote note text (a bad string
/// slice quotes the string in backticks), so every backtick-quoted span is
/// replaced; the location stays, it is what a bug report needs.
pub fn panic_line(message: &str, file: Option<&str>, line: Option<u32>) -> String {
    let mut text = String::new();
    let mut rest = message;
    while let Some(open) = rest.find('`') {
        text.push_str(&rest[..open]);
        text.push_str("`…`");
        match rest[open + 1..].find('`') {
            Some(close) => rest = &rest[open + 1 + close + 1..],
            // An unclosed quote: drop the rest.
            None => {
                rest = "";
                break;
            }
        }
    }
    text.push_str(rest);
    let place = match (file, line) {
        (Some(f), Some(l)) => format!("{f}:{l}"),
        (Some(f), None) => f.to_string(),
        _ => "unknown location".to_string(),
    };
    format!("panic at {place}: {text}")
}

static LOGGER: OnceLock<LogFile> = OnceLock::new();

/// Installs the logger once (a second call does nothing): to `dir` if given,
/// else stderr only. The maximum level is `Trace` with `trace`, else `Info`.
/// Also installs the panic hook.
pub fn init(dir: Option<&Path>, trace: bool) {
    let logger = LOGGER.get_or_init(|| match dir {
        Some(dir) => LogFile::open(dir, LOG_CAP),
        None => LogFile::stderr_only(),
    });
    if log::set_logger(logger).is_err() {
        return;
    }
    log::set_max_level(if trace {
        LevelFilter::Trace
    } else {
        LevelFilter::Info
    });
    log::info!("Breccia {} started", env!("CARGO_PKG_VERSION"));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "(no message)".into());
        let place = info.location();
        let line = panic_line(&message, place.map(|l| l.file()), place.map(|l| l.line()));
        logger.try_write_line(&format_line(Level::Error, "panic", &line));
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(dir: &Path, name: &str) -> String {
        fs::read_to_string(dir.join(name)).unwrap_or_default()
    }

    fn files(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn log_dir_follows_the_config_override() {
        assert_eq!(
            log_dir_for(Some(Path::new("cfg")), Some(PathBuf::from("app-logs"))),
            Some(PathBuf::from("cfg").join("logs"))
        );
        assert_eq!(
            log_dir_for(None, Some(PathBuf::from("app-logs"))),
            Some(PathBuf::from("app-logs"))
        );
        assert_eq!(log_dir_for(None, None), None);
    }

    #[test]
    fn rotates_before_the_cap() {
        let t = tempfile::tempdir().unwrap();
        let log = LogFile::open(t.path(), 100);
        // 29 bytes and the newline: 30 on disk.
        for i in 0..7 {
            log.write_line(&format!("line {i}{}", "x".repeat(22)));
        }
        assert_eq!(files(t.path()), [OLD_LOG_FILE, LOG_FILE]);
        let current = read(t.path(), LOG_FILE);
        assert!(current.len() <= 100, "{}", current.len());
        assert!(read(t.path(), OLD_LOG_FILE).len() <= 100);
        assert!(current.contains("line 6"));
        assert!(!current.contains("line 0"));
    }

    #[test]
    fn a_line_longer_than_the_cap_is_written_once() {
        let t = tempfile::tempdir().unwrap();
        let log = LogFile::open(t.path(), 10);
        let long = "y".repeat(50);
        log.write_line(&long);
        assert_eq!(files(t.path()), [LOG_FILE]);
        assert_eq!(read(t.path(), LOG_FILE), format!("{long}\n"));
    }

    #[test]
    fn appends_across_opens() {
        let t = tempfile::tempdir().unwrap();
        LogFile::open(t.path(), 1000).write_line("first");
        LogFile::open(t.path(), 1000).write_line("second");
        assert_eq!(read(t.path(), LOG_FILE), "first\nsecond\n");
    }

    #[test]
    fn an_unwritable_folder_falls_back_to_stderr() {
        let t = tempfile::tempdir().unwrap();
        let blocker = t.path().join("logs");
        fs::write(&blocker, "a file where the folder should be").unwrap();
        let log = LogFile::open(&blocker, 100);
        log.write_line("goes nowhere");
        log.log(
            &Record::builder()
                .args(format_args!("x"))
                .level(Level::Warn)
                .target("breccia_lib")
                .build(),
        );
        assert!(blocker.is_file());
    }

    /// `^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d WARN  \S+: x$`
    fn is_file_line(line: &str) -> bool {
        let shape = "dddd-dd-ddTdd:dd:dd.ddd";
        let b = line.as_bytes();
        if b.len() < shape.len() + 6 {
            return false;
        }
        let stamp_ok = shape.bytes().zip(b).all(|(s, c)| match s {
            b'd' => c.is_ascii_digit(),
            _ => s == *c,
        });
        let zone = &line[shape.len()..shape.len() + 6];
        let zone_ok = matches!(zone.as_bytes()[0], b'+' | b'-')
            && zone[1..3].bytes().all(|c| c.is_ascii_digit())
            && &zone[3..4] == ":"
            && zone[4..6].bytes().all(|c| c.is_ascii_digit());
        let rest = &line[shape.len() + 6..];
        stamp_ok
            && zone_ok
            && rest
                .strip_prefix(" WARN  ")
                .and_then(|r| r.strip_suffix(": x"))
                .is_some_and(|target| !target.is_empty() && !target.contains(char::is_whitespace))
    }

    #[test]
    fn file_lines_have_time_and_level() {
        let t = tempfile::tempdir().unwrap();
        let log = LogFile::open(t.path(), 1000);
        log.log(
            &Record::builder()
                .args(format_args!("x"))
                .level(Level::Warn)
                .target("breccia_core::fsio")
                .build(),
        );
        let text = read(t.path(), LOG_FILE);
        let line = text.lines().next().unwrap();
        assert!(is_file_line(line), "{line}");
        assert!(!is_file_line("2026-11-10 WARN  a: x"));
    }

    #[test]
    fn records_of_other_crates_are_not_written() {
        let t = tempfile::tempdir().unwrap();
        let log = LogFile::open(t.path(), 1000);
        for (target, written) in [
            ("tao::x", false),
            ("notify::inotify", false),
            ("breccia_lib", true),
            ("breccia_core::watch", true),
            ("trace", true),
            ("panic", true),
        ] {
            let before = read(t.path(), LOG_FILE).lines().count();
            log.log(
                &Record::builder()
                    .args(format_args!("m"))
                    .level(Level::Warn)
                    .target(target)
                    .build(),
            );
            let after = read(t.path(), LOG_FILE).lines().count();
            assert_eq!(after - before, usize::from(written), "{target}");
        }
    }

    #[test]
    fn redact_masks_url_credentials() {
        assert_eq!(
            redact("push https://me:tok@github.com/a.git failed"),
            "push https://***@github.com/a.git failed"
        );
        // A token without a colon.
        assert_eq!(
            redact("https://ghp_xxx@github.com/a.git"),
            "https://***@github.com/a.git"
        );
        assert_eq!(redact("ssh://git@host/x"), "ssh://git@host/x");
        assert_eq!(redact("git@host:path/x.git"), "git@host:path/x.git");
        assert_eq!(redact("no url here, a@b"), "no url here, a@b");
        assert_eq!(
            redact("a https://u:p@h/x and ssh://u:p@h/y"),
            "a https://***@h/x and ssh://***@h/y"
        );
    }

    #[test]
    fn panic_line_drops_quoted_text() {
        let message =
            "byte index 2 is not a char boundary; it is inside 'é' (bytes 1..3) of `héllo`";
        let line = panic_line(message, Some("src/lib.rs"), Some(12));
        assert!(!line.contains("héllo"), "{line}");
        assert!(line.contains("src/lib.rs:12"), "{line}");
        assert!(line.starts_with("panic at src/lib.rs:12: "), "{line}");
        // An unclosed quote loses the rest too.
        assert!(!panic_line("a `secret", None, None).contains("secret"));
    }

    #[test]
    fn the_panic_path_does_not_wait_for_a_held_lock() {
        let t = tempfile::tempdir().unwrap();
        let log = LogFile::open(t.path(), 1000);
        let _held = log.lock();
        log.try_write_line("dropped, not blocked");
    }
}
