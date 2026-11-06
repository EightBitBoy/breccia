use breccia_core::naming::*;
use chrono::NaiveDate;

#[test]
fn folder_paths() {
    for ok in ["Projects", "Projects/2027", "People"] {
        assert!(is_valid_folder_path(ok), "{ok}");
    }
    for bad in ["", "a//b", "/a", "a/", "a:b", "con", "x.", "..", " a"] {
        assert!(!is_valid_folder_path(bad), "{bad}");
    }
}

#[test]
fn keys_are_lowercase() {
    assert_eq!(page_key("Project X"), "project x");
    assert_eq!(page_key("ÄRGER"), "ärger");
}

#[test]
fn valid_names() {
    assert!(is_valid_page_name("Project X"));
    assert!(is_valid_page_name("a/b: c?"));
    assert!(!is_valid_page_name("a\tb"));
    for bad in [
        "", "   ", "a\nb", "a]]b", "[[a", "a\u{0}b", "a\u{1f}b", "a\u{7f}b", " a", "a ", "a\r",
    ] {
        assert!(!is_valid_page_name(bad), "{bad:?}");
    }
}

#[test]
fn file_stem_rules() {
    assert_eq!(file_stem_for("Project X"), "Project X");
    assert_eq!(file_stem_for("a/b: c?"), "a_b_ c_");
    assert_eq!(file_stem_for(r#"x\y*z"<>|"#), "x_y_z____");
    assert_eq!(file_stem_for("CON"), "CON_");
    assert_eq!(file_stem_for("con.txt"), "con_.txt");
    assert_eq!(file_stem_for("LPT1"), "LPT1_");
    assert_eq!(file_stem_for("Wait..."), "Wait___");
    assert_eq!(file_stem_for("trail "), "trail_");
    assert_eq!(file_stem_for(".net"), "_net");
}

#[test]
fn journal_names() {
    let d = NaiveDate::from_ymd_opt(2026, 10, 29).unwrap();
    assert_eq!(journal_name(d), "2026-10-29");
    assert_eq!(parse_journal_name("2026-10-29"), Some(d));
    assert_eq!(parse_journal_name("2026-13-01"), None);
    assert_eq!(parse_journal_name("2026-1-5"), None);
    // ten bytes like the canonical form, but not it
    assert_eq!(parse_journal_name("+2026-1-05"), None);
    assert_eq!(parse_journal_name("2026-10-9 "), None);
    assert_eq!(parse_journal_name("notes"), None);
}

#[test]
fn journal_display_is_english_long_form() {
    let d = NaiveDate::from_ymd_opt(2026, 10, 29).unwrap();
    assert_eq!(journal_display(d), "Thursday, 29 Oct 2026");
    assert_eq!(
        journal_display(NaiveDate::from_ymd_opt(2027, 1, 3).unwrap()),
        "Sunday, 3 Jan 2027"
    );
}

#[test]
fn linkable_names_have_no_brackets() {
    use breccia_core::naming::is_linkable_name;
    assert!(is_linkable_name("C# notes"));
    for bad in ["a]b", "a[b", "[x", "x]", "a|b", ""] {
        assert!(!is_linkable_name(bad), "{bad:?}");
    }
}
