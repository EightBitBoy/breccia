//! Renders block text to HTML. The frontend shows the result as-is.

use pulldown_cmark::{CowStr, Event, LinkType, Options, Parser, Tag, TagEnd, html};

use crate::config::Config;
use crate::inline::{self, Link, LinkKind};
use crate::naming::{self, journal_display, parse_journal_name};
use crate::outline::front_matter_len;
use crate::task::{created_at, done_date, done_time, journal_date_in, task_state, with_state};
use chrono::NaiveDateTime;

const OPEN: char = '\u{E000}';
const CLOSE: char = '\u{E001}';

fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// What a page link shows: its label, else the journal date or the target.
fn page_display(l: &Link) -> String {
    if let Some(label) = &l.label {
        return label.clone();
    }
    match parse_journal_name(&l.target) {
        Some(d) => journal_display(d),
        None => l.target.clone(),
    }
}

fn link_html(l: &Link) -> String {
    match l.kind {
        LinkKind::Page => {
            let display = page_display(l);
            format!(
                "<a class=\"link\" data-page=\"{}\" data-name=\"{}\">{}</a>",
                esc(&l.key),
                esc(&l.target),
                esc(&display)
            )
        }
        LinkKind::Tag => format!(
            "<a class=\"tag\" data-page=\"{}\" data-name=\"{}\">#{}</a>",
            esc(&l.key),
            esc(&l.target),
            esc(&l.target)
        ),
    }
}

/// Collects replacement fragments and the placeholders standing in for them.
/// Each slot keeps its HTML and the source text it replaced.
#[derive(Default)]
struct Slots(Vec<(String, String)>);

impl Slots {
    fn add(&mut self, html: String, src: &str) -> String {
        self.0.push((html, src.to_string()));
        format!("{OPEN}{}{CLOSE}", self.0.len() - 1)
    }

    /// Replaces each placeholder by `f(slot)`.
    fn map(&self, rendered: &str, f: impl Fn(&(String, String)) -> &str) -> String {
        let mut out = String::with_capacity(rendered.len());
        let mut rest = rendered;
        while let Some(start) = rest.find(OPEN) {
            out.push_str(&rest[..start]);
            let after = &rest[start + OPEN.len_utf8()..];
            let Some(end) = after.find(CLOSE) else {
                rest = &rest[start..];
                break;
            };
            match after[..end]
                .parse::<usize>()
                .ok()
                .and_then(|n| self.0.get(n))
            {
                Some(slot) => out.push_str(f(slot)),
                None => {
                    out.push_str(&rest[start..start + OPEN.len_utf8() + end + CLOSE.len_utf8()])
                }
            }
            rest = &after[end + CLOSE.len_utf8()..];
        }
        out.push_str(rest);
        out
    }

    fn fill(&self, rendered: &str) -> String {
        self.map(rendered, |s| &s.0)
    }

    /// The original source text instead of the placeholders.
    fn plain(&self, s: &str) -> String {
        self.map(s, |s| &s.1)
    }
}

/// User text must not contain our placeholder markers.
fn clean(text: &str) -> String {
    text.replace([OPEN, CLOSE], "\u{FFFD}")
}

/// Replaces every link in `text` with a placeholder.
fn put_links(text: &str, slots: &mut Slots) -> String {
    let mut out = text.to_string();
    let links = inline::links(text);
    for l in links.iter().rev() {
        let p = slots.add(link_html(l), &text[l.range.clone()]);
        out.replace_range(l.range.clone(), &p);
    }
    out
}

fn scheme_ok(url: &str, schemes: &[&str]) -> bool {
    let u = url
        .trim_start_matches(|c: char| c.is_whitespace() || c.is_control())
        .to_ascii_lowercase();
    schemes.iter().any(|s| u.starts_with(s))
}

fn title_attr(title: &str, slots: &Slots) -> String {
    if title.is_empty() {
        String::new()
    } else {
        format!(" title=\"{}\"", esc(&slots.plain(title)))
    }
}

/// Where the address of a bare URL ends: at whitespace, a quote, an angle bracket or a placeholder.
fn url_end(rest: &str) -> usize {
    rest.find(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | OPEN | CLOSE))
        .unwrap_or(rest.len())
}

/// `url` without the sentence punctuation and the unbalanced closing brackets at its end.
fn trim_url(url: &str) -> &str {
    let mut url = url;
    loop {
        let Some(last) = url.chars().next_back() else {
            return url;
        };
        let open = match last {
            ')' => Some('('),
            ']' => Some('['),
            _ => None,
        };
        let cut = match open {
            Some(o) => url.matches(o).count() < url.matches(last).count(),
            None => matches!(last, '.' | ',' | ';' | ':' | '!' | '?' | '\'' | '*'),
        };
        if !cut {
            return url;
        }
        url = &url[..url.len() - last.len_utf8()];
    }
}

/// Splits plain text into text and links for the bare `http://` and `https://` addresses in it. An address
/// starts at the beginning of a word (after whitespace, an opening bracket or a quote).
fn linkify<'a>(text: &str, out: &mut Vec<Event<'a>>) {
    let lower = text.to_ascii_lowercase();
    let mut done = 0;
    let mut from = 0;
    while let Some(p) = lower[from..].find("http") {
        let start = from + p;
        from = start + 4;
        let rest = &lower[start..];
        let scheme = if rest.starts_with("https://") {
            8
        } else if rest.starts_with("http://") {
            7
        } else {
            continue;
        };
        let word_start = text[..start].chars().next_back().is_none_or(|c| {
            c.is_whitespace() || matches!(c, '(' | '[' | '"' | '\'' | '*' | '_' | '~')
        });
        if !word_start {
            continue;
        }
        let url = trim_url(&text[start..start + url_end(&text[start..])]);
        if url.len() <= scheme || !url[scheme..].starts_with(|c: char| c.is_alphanumeric()) {
            continue;
        }
        if start > done {
            out.push(Event::Text(text[done..start].to_string().into()));
        }
        out.push(Event::Html(
            format!("<a class=\"ext\" href=\"{}\">{}</a>", esc(url), esc(url)).into(),
        ));
        done = start + url.len();
        from = done;
    }
    if done < text.len() {
        out.push(Event::Text(text[done..].to_string().into()));
    }
}

fn markdown(src: &str, slots: &Slots) -> String {
    let opts = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;
    // Each event with whether it is plain text that may hold a bare address.
    let mut events: Vec<(Event, bool)> = Vec::new();
    let mut in_link = false;
    let mut in_code_block = false;
    let mut close_link = false;
    let mut parser = Parser::new_ext(src, opts);
    while let Some(e) = parser.next() {
        match e {
            Event::Start(Tag::Link {
                link_type,
                dest_url,
                title,
                ..
            }) => {
                let mut dest = slots.plain(&dest_url);
                // `<name@example.com>` arrives without a scheme.
                if link_type == LinkType::Email {
                    dest.insert_str(0, "mailto:");
                }
                in_link = true;
                close_link = scheme_ok(&dest, &["http:", "https:", "mailto:"]);
                if close_link {
                    events.push((
                        Event::Html(
                            format!(
                                "<a class=\"ext\" href=\"{}\"{}>",
                                esc(&dest),
                                title_attr(&title, slots)
                            )
                            .into(),
                        ),
                        false,
                    ));
                }
            }
            Event::End(TagEnd::Link) => {
                in_link = false;
                if close_link {
                    events.push((Event::Html(CowStr::Borrowed("</a>")), false));
                }
            }
            Event::Start(Tag::Image {
                dest_url, title, ..
            }) => {
                let mut alt = String::new();
                for inner in parser.by_ref() {
                    match inner {
                        Event::End(TagEnd::Image) => break,
                        Event::Text(t) | Event::Code(t) | Event::Html(t) | Event::InlineHtml(t) => {
                            alt.push_str(&t)
                        }
                        Event::SoftBreak | Event::HardBreak => alt.push(' '),
                        _ => {}
                    }
                }
                let alt = slots.plain(&alt);
                let dest = slots.plain(&dest_url);
                if scheme_ok(&dest, &["http:", "https:"]) {
                    events.push((
                        Event::Html(
                            format!(
                                "<img src=\"{}\" alt=\"{}\"{} />",
                                esc(&dest),
                                esc(&alt),
                                title_attr(&title, slots)
                            )
                            .into(),
                        ),
                        false,
                    ));
                } else {
                    events.push((Event::Text(alt.into()), false));
                }
            }
            Event::Start(Tag::CodeBlock(k)) => {
                in_code_block = true;
                events.push((Event::Start(Tag::CodeBlock(k)), false));
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code_block = false;
                events.push((Event::End(TagEnd::CodeBlock), false));
            }
            Event::Text(t) if in_link => events.push((Event::Text(slots.plain(&t).into()), false)),
            Event::Text(t) => events.push((Event::Text(t), !in_code_block)),
            Event::Html(s) | Event::InlineHtml(s) => events.push((Event::Text(s), false)),
            Event::SoftBreak => events.push((Event::HardBreak, false)),
            e => events.push((e, false)),
        }
    }
    // Bare addresses: runs of plain text are joined first, as the parser may split an address
    // (at `_`, `&` and the like).
    let mut linked: Vec<Event> = Vec::new();
    let mut run = String::new();
    for (e, bare) in events {
        if bare && let Event::Text(t) = &e {
            run.push_str(t);
            continue;
        }
        if !run.is_empty() {
            linkify(&std::mem::take(&mut run), &mut linked);
        }
        linked.push(e);
    }
    if !run.is_empty() {
        linkify(&run, &mut linked);
    }
    let mut out = String::new();
    html::push_html(&mut out, linked.into_iter());
    out
}

/// Inserts `fragment` before the first `</p>`, or at the end.
fn append_to_first_paragraph(out: &mut String, fragment: &str) {
    match out.find("</p>") {
        Some(i) => out.insert_str(i, fragment),
        None => out.push_str(fragment),
    }
}

/// Inserts `fragment` after the first paragraph, or at the end.
fn insert_after_first_paragraph(out: &mut String, fragment: &str) {
    match out.find("</p>\n") {
        Some(i) => out.insert_str(i + "</p>\n".len(), fragment),
        None => out.push_str(fragment),
    }
}

fn inline_html(value: &str) -> String {
    let value = &clean(value);
    let mut slots = Slots::default();
    let src = put_links(value, &mut slots);
    let out = slots.fill(&markdown(&src, &slots));
    let out = out.trim_end();
    match out.strip_prefix("<p>").and_then(|o| o.strip_suffix("</p>")) {
        Some(inner) => inner.to_string(),
        None => out.to_string(),
    }
}

/// How long a task took from `created` to `done`, as the chip says it: whole
/// days, else whole hours, else whole minutes, rounded down and never
/// under `1 minute`. `None` when `created` is after `done`.
pub(crate) fn took(created: NaiveDateTime, done: NaiveDateTime) -> Option<String> {
    if created > done {
        return None;
    }
    let minutes = (done - created).num_minutes();
    let (n, unit) = match minutes {
        m if m >= 24 * 60 => (m / (24 * 60), "day"),
        m if m >= 60 => (m / 60, "hour"),
        m => (m.max(1), "minute"),
    };
    Some(format!("{n} {unit}{}", if n == 1 { "" } else { "s" }))
}

/// HTML for a block: Markdown, links, tags, task state and properties.
pub fn block_html(text: &str, cfg: &Config) -> String {
    let text = &clean(text);
    let mut slots = Slots::default();
    let props = inline::properties(text);
    let mut lines: Vec<&str> = text.split('\n').collect();
    lines.drain(1..1 + props.len());
    let body = lines.join("\n");

    let is_task = task_state(&body, cfg).is_some();
    let body = match task_state(&body, cfg) {
        Some(state) => {
            let kw = &state.keyword;
            let badge = slots.add(
                format!(
                    "<span class=\"st\" data-color=\"{}\">{}</span>",
                    esc(&state.color),
                    esc(kw)
                ),
                kw,
            );
            let rest = &body[kw.len()..];
            let mut src = badge;
            if state.finished && rest.starts_with(' ') {
                let first_end = rest.find('\n').unwrap_or(rest.len());
                let open = slots.add("<span class=\"done-text\">".into(), "");
                let close = slots.add("</span>".into(), "");
                src.push(' ');
                src.push_str(&open);
                src.push_str(&put_links(&rest[1..first_end], &mut slots));
                src.push_str(&close);
                src.push_str(&put_links(&rest[first_end..], &mut slots));
            } else {
                src.push_str(&put_links(rest, &mut slots));
            }
            src
        }
        None => put_links(&body, &mut slots),
    };

    let mut out = slots.fill(&markdown(&body, &slots));

    // The done day, and its time when one is written, then how long the task
    // took since `created::`.
    let chip = done_date(text).map(|d| {
        let when = match done_time(text) {
            Some(t) => {
                let took = created_at(text)
                    .and_then(|c| took(c, d.and_time(t)))
                    .map(|s| format!(" after {s}"))
                    .unwrap_or_default();
                format!("{} {}{took}", naming::day_short(d), t.format("%H:%M"))
            }
            None => naming::day_short(d),
        };
        format!("<span class=\"chip\">\u{2713} {when}</span>")
    });
    let mut shown = Vec::new();
    for (key, value) in &props {
        if key == "done" && journal_date_in(value).is_some() {
            continue;
        }
        // A task's archived date is not shown in pages: boards
        // leave archived tasks out, and the Archive view shows the date.
        // Nor its created time: the done chip says how long it took.
        if (key == "archived" || key == "created") && is_task {
            continue;
        }
        shown.push(format!(
            "<div class=\"prop\"><span class=\"prop-key\">{}</span> {}</div>",
            esc(key),
            inline_html(value)
        ));
    }
    if let Some(chip) = chip {
        append_to_first_paragraph(&mut out, &chip);
    }
    if !shown.is_empty() {
        let block = format!("<div class=\"props\">{}</div>", shown.concat());
        insert_after_first_paragraph(&mut out, &block);
    }
    out
}

/// HTML for a board card: the first line without its state keyword, inline.
/// A finished task's text is wrapped in `done-text`.
pub fn card_html(text: &str, cfg: &Config) -> String {
    let text = &clean(text);
    let first = text.split('\n').next().unwrap_or("");
    let rest = with_state(first, None, cfg);
    let html = inline_html(&rest);
    match task_state(first, cfg) {
        Some(s) if s.finished && !rest.is_empty() => {
            format!("<span class=\"done-text\">{html}</span>")
        }
        _ => html,
    }
}

/// HTML for a page preamble: Markdown and links only; the line that names
/// the page (`inline::title_line`) and the line that colors it
/// (`color::color_line`) are hidden.
pub fn preamble_html(text: &str) -> String {
    let text = &clean(text);
    let (front, text) = text.split_at(front_matter_len(text).unwrap_or(0));
    let mut out = String::new();
    if !front.is_empty() {
        let shown = front.strip_suffix('\n').unwrap_or(front);
        let shown = shown.strip_suffix('\r').unwrap_or(shown);
        out.push_str(&format!(
            "<pre class=\"front-matter\"><code>{}</code></pre>",
            esc(shown)
        ));
    }
    let hidden = [
        inline::title_line(text).map(|(i, _)| i),
        crate::color::color_line(text).map(|(i, _)| i),
    ];
    let kept: Vec<&str> = text
        .split('\n')
        .enumerate()
        .filter(|(i, _)| !hidden.contains(&Some(*i)))
        .map(|(_, l)| l)
        .collect();
    let mut slots = Slots::default();
    let src = put_links(&kept.join("\n"), &mut slots);
    out.push_str(&slots.fill(&markdown(&src, &slots)));
    out
}

/// The first line of `text` as a breadcrumb: links shown as their display
/// text, trimmed, cut to 40 characters with `…`.
pub fn crumb(text: &str) -> String {
    let out = plain_line(text);
    if out.chars().count() > 40 {
        format!("{}…", out.chars().take(40).collect::<String>())
    } else {
        out
    }
}

/// The first line of `text` as plain text: links shown as their display
/// text, trimmed.
pub fn plain_line(text: &str) -> String {
    let line = text.split('\n').next().unwrap_or("");
    let mut out = String::new();
    let mut at = 0;
    for l in inline::links(line) {
        out.push_str(&line[at..l.range.start]);
        match l.kind {
            LinkKind::Page => out.push_str(&page_display(&l)),
            LinkKind::Tag => {
                out.push('#');
                out.push_str(&l.target);
            }
        }
        at = l.range.end;
    }
    out.push_str(&line[at..]);
    out.trim().to_string()
}
