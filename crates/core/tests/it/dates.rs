use breccia_core::dates::parse_typed_date;
use chrono::NaiveDate;

fn d(y: i32, m: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, day).unwrap()
}

#[test]
fn typed_dates() {
    let today = d(2026, 10, 30);
    let p = |s: &str| parse_typed_date(s, today);
    assert_eq!(p("2026-03-12"), Some(d(2026, 3, 12)));
    assert_eq!(p("12 Mar"), Some(d(2026, 3, 12)));
    assert_eq!(p("12 march"), Some(d(2026, 3, 12)));
    assert_eq!(p(" 12 MAR 2024 "), Some(d(2024, 3, 12)));
    assert_eq!(p("Mar 12"), Some(d(2026, 3, 12)));
    assert_eq!(p("March 12 2025"), Some(d(2025, 3, 12)));
    assert_eq!(p("12.3."), Some(d(2026, 3, 12)));
    assert_eq!(p("12.3.2026"), Some(d(2026, 3, 12)));
    assert_eq!(p("12.03.2026"), Some(d(2026, 3, 12)));
    assert_eq!(p("3 Sept"), Some(d(2026, 9, 3)));
    assert_eq!(
        p("12 Dec"),
        Some(d(2025, 12, 12)),
        "no year: not after today"
    );
    assert_eq!(p("30 Oct"), Some(today));
    assert_eq!(p("31 Oct"), Some(d(2025, 10, 31)));
    assert_eq!(p("today"), Some(today));
    assert_eq!(p("Yesterday"), Some(d(2026, 10, 29)));
    assert_eq!(p("tomorrow"), Some(d(2026, 10, 31)));
    assert_eq!(
        p("2027-01-05"),
        Some(d(2027, 1, 5)),
        "future days are allowed"
    );
    assert_eq!(p("29 Feb"), Some(d(2024, 2, 29)));
    for bad in [
        "31 Feb",
        "2026-02-30",
        "13.13.",
        "3/12",
        "0 Mar",
        "12",
        "Mar",
        "12 Mar x",
        "licence",
        "",
        "2026-3-12x",
    ] {
        assert_eq!(p(bad), None, "{bad:?}");
    }
}

#[test]
fn around_new_year() {
    assert_eq!(
        parse_typed_date("31 Dec", d(2027, 1, 2)),
        Some(d(2026, 12, 31))
    );
    assert_eq!(
        parse_typed_date("2 Jan", d(2027, 1, 2)),
        Some(d(2027, 1, 2))
    );
    assert_eq!(
        parse_typed_date("3 Jan", d(2027, 1, 2)),
        Some(d(2026, 1, 3))
    );
}

#[test]
fn february_29_edge_cases() {
    let p = |s: &str, today: NaiveDate| parse_typed_date(s, today);
    assert_eq!(
        p("2025-02-29", d(2026, 10, 30)),
        None,
        "2025 is no leap year"
    );
    assert_eq!(p("29 Feb 2025", d(2026, 10, 30)), None);
    assert_eq!(p("29 Feb 2024", d(2026, 10, 30)), Some(d(2024, 2, 29)));
    assert_eq!(p("29 Feb", d(2028, 2, 29)), Some(d(2028, 2, 29)), "today");
    assert_eq!(
        p("29 Feb", d(2028, 3, 1)),
        Some(d(2028, 2, 29)),
        "yesterday"
    );
    assert_eq!(
        p("29 Feb", d(2027, 3, 1)),
        Some(d(2024, 2, 29)),
        "no 2027 or 2026 or 2025 leap day"
    );
}
