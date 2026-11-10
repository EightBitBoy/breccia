# Contributing to Breccia

Breccia is a local-first outliner for the desktop: Markdown files in a folder, with a journal, pages, links and
boards. See the [README](README.md).

## Issues and pull requests

Issues are welcome: a bug, an idea, a question. A pull request is welcome after its issue is agreed with the owner,
so that nobody writes a change that cannot be merged. Say in the issue what you want to change and why.

[`docs/spec.md`](docs/spec.md) is binding. Read it before you change behaviour. One rule matters most (spec section 2):
Breccia never silently drops, reorders or reformats text the user wrote, and that includes `breccia/config.toml`
with its comments and unknown keys.

## Build and check

The toolchain that is known to work: Windows 11, Rust 1.90, Node 24, just 1.58, git-cliff 2.14.2.

- `just test`: frontend build, Vitest, then `cargo test --workspace`.
- `just lint`: `cargo fmt --check`, clippy with `-D warnings`, and `svelte-check`. Run `cargo fmt --all` if it fails
  on formatting.
- `just e2e`: builds the release exe and drives it. Windows only. Run it when you change how the app is wired.
- `just dev` runs the app in dev mode on a fresh copy of the demo notes folder.

Every test must be able to fail: write it, see it fail, then make it pass. CI runs the tests and the lint on every
push and pull request.

## Commits

- Write conventional commit subjects, for example `fix(core): Git sync: a refused pull is retried once`.
- `feat` and `fix` subjects become lines of the changelog. Write them so a user of the app understands them: what they
  can now do, or what no longer goes wrong. No code names, file paths or issue numbers, one line, at most about 90
  characters, no trailing period.
- Changes only developers notice are `chore`, `refactor`, `test`, `docs` or `ci`.
- One change per commit.
- All text files use LF line endings.

## Dependency updates

Dependabot opens grouped pull requests once a month. The Tauri crates and the `@tauri-apps/*` npm packages must stay
on the same major.minor version, because the Tauri CLI refuses a build where they differ. Merge their two pull
requests together.

## License

By contributing you agree that your contribution is released under the [MIT License](LICENSE).
