//! The main window's off-screen start (the e2e hook) and its saved state.

use std::ffi::OsString;
use std::path::Path;

use tauri::Manager;

/// `BRECCIA_OFFSCREEN` set and non-empty (the e2e hook). Off screen is
/// Windows-only in effect: on other platforms `show_offscreen` shows the window
/// with `show()`, which activates it.
pub(crate) fn offscreen_enabled(var: Option<OsString>) -> bool {
    var.is_some_and(|v| !v.is_empty())
}

/// Where an off-screen window's top left corner goes, in physical pixels on
/// both axes: far beyond any monitor layout.
const OFFSCREEN: i32 = -20_000;

/// Makes every window start hidden and unfocused. tao ignores a start
/// position off every monitor, so `show_offscreen` moves it there and only
/// then shows it.
pub(crate) fn place_offscreen(windows: &mut [tauri::utils::config::WindowConfig]) {
    for w in windows {
        w.focus = false;
        w.visible = false;
    }
}

/// Moves the main window off screen and shows it without activating it, so
/// an e2e run neither takes the keyboard nor comes to the front. Shown, not
/// minimised: WebView2 may throttle a minimised window.
pub(crate) fn show_offscreen(app: &tauri::App) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    window.set_position(tauri::PhysicalPosition::new(OFFSCREEN, OFFSCREEN))?;
    show_inactive(&window)
}

/// `show()` activates the window (`SW_SHOW`); this shows it in the background.
#[cfg(windows)]
pub(crate) fn show_inactive(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn ShowWindow(hwnd: *mut std::ffi::c_void, cmd: i32) -> i32;
    }
    const SW_SHOWNOACTIVATE: i32 = 4;
    let hwnd = window.hwnd()?;
    // SAFETY: a live top-level window of this process, called on its UI
    // thread (setup runs on the main thread).
    unsafe { ShowWindow(hwnd.0, SW_SHOWNOACTIVATE) };
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn show_inactive(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    window.show()
}

/// The window-state plugin, or `None` for an off-screen run: a restored
/// state would bring the window back on screen and focus it, and a saved one
/// would put it off screen on the next normal start.
pub(crate) fn window_state(
    config_override: Option<&Path>,
    offscreen: bool,
) -> Option<tauri_plugin_window_state::Builder> {
    if offscreen {
        return None;
    }
    let mut window_state = tauri_plugin_window_state::Builder::default();
    // The plugin joins its file name onto the app config dir, and joining an
    // absolute path replaces that dir.
    if let Some(dir) = config_override {
        window_state = window_state.with_filename(dir.join(".window-state.json").to_string_lossy());
    }
    Some(window_state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offscreen_needs_a_non_empty_value() {
        assert!(!offscreen_enabled(None));
        assert!(!offscreen_enabled(Some("".into())));
        assert!(offscreen_enabled(Some("1".into())));
    }

    /// The e2e run must neither take the keyboard focus nor show the window
    /// in front. tao ignores a start position off every monitor, so the
    /// window starts hidden and unfocused; setup moves it off screen and
    /// only then shows it.
    #[test]
    fn offscreen_windows_start_hidden_and_unfocused() {
        let ctx: tauri::Context<tauri::Wry> = tauri::generate_context!();
        let mut windows = ctx.config().app.windows.clone();
        assert!(windows[0].focus && windows[0].visible, "config changed");
        place_offscreen(&mut windows);
        let w = &windows[0];
        assert!(!w.focus, "window still takes the focus");
        assert!(!w.visible, "window shows before it is off screen");
        assert!(!w.maximized && !w.fullscreen, "window covers a screen");
    }

    /// An off-screen run neither restores nor saves the window state, so it
    /// cannot put the window off screen on the next normal start.
    #[test]
    fn offscreen_runs_have_no_window_state() {
        assert!(window_state(None, true).is_none());
        assert!(window_state(Some(Path::new("cfg")), true).is_none());
        assert!(window_state(None, false).is_some());
        assert!(window_state(Some(Path::new("cfg")), false).is_some());
    }
}
