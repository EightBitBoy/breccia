# Bugs

Severity: **high** (text loss or a broken main flow), **medium** (wrong behaviour a user can hit), **low** (edge case,
robustness, or only on a platform not shipped yet). `unverified` means the code path was read but not run.

## B1: re-reading a large changed file can allocate hundreds of megabytes (low)

- **Where:** `crates/core/src/outline.rs:765` (`carry_ids`).
- **Problem:** after the common prefix and suffix are cut off, the function builds a full LCS table
  `vec![vec![0usize; nm + 1]; om + 1]` over the middle. The middle is everything between the first and the last
  changed block, so its size is set by where the changes are, not by how many there are. It also clones every
  block's text into the comparison keys (`key` at line 766).
- **Failure scenario:** a page with 5,000 blocks is changed outside Breccia (an editor, a Git pull) in its first and
  its last block. The table is 5,000 × 5,000 × 8 bytes = 200 MB, at 10,000 blocks 800 MB, allocated on the reload
  path while the app runs. Unverified by a run; the arithmetic follows from the code.
- **Fix:** compare by reference (`(usize, &str)` keys), and bound the table: above a cell budget (say 4 million),
  skip the LCS and pair the middle in order, which is what the gaps already do. A linear-space diff (Myers) is the
  thorough version. Add a test with a large middle that asserts the ids of the unchanged blocks survive.

## B2: page keys are lower-cased but not Unicode-normalised (low, macOS only)

- **Where:** `crates/core/src/naming.rs:15` (`page_key`).
- **Problem:** the key is `name.to_lowercase()`. A name typed in a link is normally NFC; a file name read from an
  APFS or HFS+ volume can be NFD. `é` then has two byte forms and two keys. `unicode-normalization` is already a
  dependency (used only in `search/fold.rs`).
- **Failure scenario:** on macOS, `pages/Café.md` created in Finder and a link `[[Café]]` typed in Breccia do not
  meet: the link shows as a missing page, and typing into it could create a second file. Windows and Linux keep the
  bytes they are given, so the shipped platform is not affected. Unverified (no macOS build exists).
- **Fix:** decide before the first macOS build (spec §2 names macOS as a goal): normalise to NFC in `page_key`, and
  add a test with an NFD file name. It is one line now and a migration later.

## B3: the watcher watches the whole notes folder, `.git` included (low)

- **Where:** `crates/core/src/watch.rs:240` (`FolderWatcher::start`), against `watch.rs:129` (`watch_roots`).
- **Problem:** `watch_roots` says which folders matter (`pages/` and `journals/` deep, the root and `breccia/` one
  level) and its doc says "`.git` is not among them". But `start` calls `debouncer.watch(root,
  RecursiveMode::Recursive)`: the operating system reports every change below the notes folder, `.git/objects`
  and any other sub-folder included. `watch_roots` is used only to limit the file-id cache, and by a test
  (`watch_roots_skip_dot_git`) that therefore proves nothing about what is watched.
- **Failure scenario:** every commit, fetch and `git gc` writes many files under `.git`; each becomes an event the
  debouncer queues, sorts and hands to `batch_paths`, which throws it away. With a large repository, or a notes
  folder that also holds attachments or build output, the queue can overflow, and an overflow triggers `rescan`,
  a walk of the whole folder. The cost was not measured.
- **Fix:** either watch the four roots of `watch_roots` separately (the root watch then has to add `pages/` and
  `journals/` when they appear), or keep the one recursive watch and say so: correct the doc of `watch_roots`,
  rename the test, and measure a `git gc` on a large folder with `BRECCIA_TRACE`.

## B4: a page file renamed outside Breccia to another case of its name is reported as a duplicate (low)

- **Where:** `crates/core/src/workspace/disk.rs:152` to `159` (`apply_disk_changes_batched`), `disk.rs:194`
  (`key_of_file`).
- **Problem:** `key_of_file` compares paths exactly. On a case-insensitive file system (Windows, macOS), after
  `pages/a.md` is renamed to `pages/A.md` by another program, both paths still answer `metadata` as a file. The old
  path matches the known page and its bytes are unchanged, so nothing happens. The new path matches no page, is
  read as a new file, gets the key `a`, which is taken, and `add_page` answers with
  `LoadWarning::DuplicatePage { kept: pages/a.md, ignored: pages/A.md }`.
- **Failure scenario:** the user renames `pages/a.md` to `pages/A.md` in Explorer while Breccia runs. Breccia
  shows a duplicate-page warning for a file that is not a duplicate, and the page keeps the name `a` until the
  next start. Unverified by a run; traced by reading.
- **Fix:** when a present path matches no page exactly, look for a page whose path equals it ignoring case and
  whose own path no longer exists under its exact name (`files::is_exact_file`); treat that as a rename: set
  `rel_path`, then `reload` (which re-reads the name). Add the case to `crates/core/tests/it/disk.rs`.

## B5: read-only commands end a run of typing, so undo gets extra steps (low)

- **Where:** `crates/core/src/session/mod.rs:297` (`let typing = self.typing.take();`) and the arms that put it
  back (`mod.rs:520`, `533`, `779`, `787`, `793`).
- **Problem:** typing into one block within a second joins the previous undo step only when the previous command
  was a `block.setText`. `dispatch` clears that memory for every command and five arms restore it by hand
  (`archive.list`, `archive.auto`, `files.changed` without changes, `search.query`, `journal.day`). Every other
  command that changes nothing does not: `page.get`, `pages.get`, `page.refs`, `board.get`, `pages.list`,
  `pages.table`, `config.get`, `states.usage`, `session.dirty`, `graph.get`, `folder.status`, `folder.tree`,
  `page.renameReach`, `journal.feed`.
- **Failure scenario:** the user types `[[` in a block; the editor asks for `pages.list` for the completion list
  between two saves of the block. The second save no longer joins the first, and `Ctrl Z` takes back the text in
  smaller pieces than the one-second rule promises. No text is lost. Verified by reading for this case: the link
  menu asks for `pages.list` through the command queue each time it opens (`app/src/editor/host.svelte.ts:426`).
- **Fix:** M17 (the command says whether it is an edit; `dispatch` restores the typing run for everything else).

## B6: Breccia can run twice on the same notes folder (medium)

- **Where:** `app/src-tauri/src/lib.rs:817` (`run`): no single-instance guard; `app/src-tauri/Cargo.toml` has no
  `tauri-plugin-single-instance`.
- **Problem:** with the tray icon, the close button hides the window and the process stays. Nothing stops a second
  start. The second process opens the last folder too: its own session, its own watcher, its own Git thread, its
  own search-index connection to the same SQLite file, its own read-modify-write of `settings.json` (the lock at
  `settings.rs:120` is per process).
- **Failure scenario:** the user closes the window (Breccia stays in the tray), later starts Breccia from the
  Start menu. Two tray icons, two windows over time. Each process sees the other's saves as outside changes, so no
  text is lost, but both commit and pull on their own timers (two rebases can meet: `index.lock`, a "busy" status),
  each undo history ends at the other's save, and the last one to write `settings.json` wins. Verified by reading
  only: there is no guard anywhere in the repository.
- **Fix:** add `tauri-plugin-single-instance` as the first plugin; its callback shows and focuses the existing
  window (`show_main`). e2e and `just dev` start their own instances on purpose: skip the plugin when
  `BRECCIA_CONFIG_DIR` is set, or the runs would attach to an installed Breccia.

## B7: one panic in a command makes every later command fail until restart (low)

- **Where:** `app/src-tauri/src/lib.rs:519` to `522` (`run_blocking`), also `lib.rs:361`, `lib.rs:422`,
  `crates/core/src/git/engine.rs:155`.
- **Problem:** the session is behind a `std::sync::Mutex`. A panic inside `Session::run` (an index out of range, a
  slice on a wrong byte offset) poisons the lock. From then on every command answers
  `internal: the session lock is poisoned`, the watcher and the index loop stop, and Git reports a failed state.
  The startup code handles the same case the other way (`unwrap_or_else(|e| e.into_inner())`, `lib.rs:889`).
- **Failure scenario:** any undiscovered panic in the core, once. The window stays open and looks alive, but
  nothing the user types is saved any more, and the only message is a notice with an internal error text. No such
  panic is known; the point is what happens when one exists.
- **Fix:** decide the policy in one helper (`fn session(&App) -> MutexGuard<Session>`). Since the files are the
  truth and every edit is saved at once, the safe recovery is: take the guard with `into_inner`, re-open the same
  folder (a fresh `Workspace` from disk, new generation), clear the poison, and send one notice ("Breccia hit an
  internal error and reloaded your notes"). Log the panic (M9). Test it with a command that panics behind a test
  flag.
