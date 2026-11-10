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
