//! The tray icon (Windows).

use std::ffi::OsString;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// The tray icon exists on Windows only, unless `BRECCIA_NO_TRAY` is set and non-empty.
pub(crate) fn tray_wanted(no_tray: Option<OsString>) -> bool {
    cfg!(windows) && no_tray.is_none_or(|v| v.is_empty())
}

/// The tray's event: the frontend runs its normal close (with the question about unsaved pages) and quits.
const TRAY_EXIT: &str = "tray:exit";

/// Shows the main window and brings it to the front.
pub(crate) fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// The tray icon: a click opens the window; the menu has "Open" and "Exit" only.
pub(crate) fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &exit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Breccia")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "exit" => {
                let _ = app.emit(TRAY_EXIT, ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tray_is_for_windows_and_can_be_turned_off() {
        assert_eq!(tray_wanted(None), cfg!(windows));
        assert_eq!(tray_wanted(Some("".into())), cfg!(windows));
        assert!(!tray_wanted(Some("1".into())));
    }
}
