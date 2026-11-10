# Releasing Breccia

## What a release is

- A release is a Git tag of the form `vX.Y.Z` (semantic versioning, for example `v1.0.0`). Pre-releases such as `v1.0.1-rc.1` work too.
- Pushing the tag starts the "Release" workflow on GitHub Actions. It checks that the tag matches the app version, runs `just test` and `just lint`, and builds the Windows installer (`Breccia_X.Y.Z_x64-setup.exe`, about 4 MB, installs per user, no admin prompt).
- The workflow then publishes the GitHub release "Breccia X.Y.Z" with the installer attached and, as notes, the `CHANGELOG.md` section of the tagged commit (written by `just release` with git-cliff, and edited by you). It is public as soon as the run is green; there is no draft to approve. A tag with a `-` in it is marked as a pre-release.
- The installer is not code signed yet, so Windows SmartScreen warns on first run.
- If WebView2 is missing, the installer downloads it, so the first install needs internet. A machine without WebView2 and without internet (for example an offline Windows Sandbox) fails to install.

## One-time checks

- GitHub Actions is enabled for the repository.
- Settings, Actions, Workflow permissions may stay read-only. The release job asks for write access itself.
- If the account restricts which actions may run, Settings, Actions, General, Actions permissions must allow the third-party actions used: `taiki-e/install-action`, `Swatinem/rust-cache` and `actions/setup-node` (or allow all actions).
- Install git-cliff 2.14.2 locally: `winget install git-cliff`, or `cargo install git-cliff --version 2.14.2 --locked`. `just release` needs it, and so does `just test` (the release script's tests run the real git-cliff). The workflow installs its own copy.

## Cutting a release

Before you start, check that the CI run of the commit on `main` you are releasing is green. The "CI" workflow
(`ci.yml`) runs `just test` and `just lint` on every push, and the release script does not check it.

1. Run `just e2e`. It is not part of the workflow, so this is the only time it runs before a release.
2. Run `just release` for the next minor version (`v1.0.0` becomes 1.1.0; after a pre-release tag such as `v1.1.0-rc.1` it proposes 1.1.0), or `just release X.Y.Z` for another version. The first release of this repository is 1.0.0: with no `v*` tag yet there is no next minor, so run `just release 1.0.0`. The script first checks that you are on `main`, the working tree is clean, `main` is in sync with origin (it fetches first), the version is newer than the latest `v*` tag, the tag is free locally and on origin, git-cliff is installed, the version files agree (as `just check-version` checks), and `CHANGELOG.md` has no section for the version yet. If a check fails it says why and changes nothing of yours. Fix the cause and run it again.
3. The script then sets the version everywhere (as `just version` does), runs git-cliff to write the new `## [X.Y.Z]` section at the top of `CHANGELOG.md`, prints that section, and pauses. Edit the section in `CHANGELOG.md` now if you like: this text becomes the release notes.
4. Press Enter (or type `y`). The script makes one commit `chore(release): X.Y.Z` (version files and `CHANGELOG.md`), an annotated tag `vX.Y.Z` ("Breccia X.Y.Z"), and pushes both with `git push --atomic origin main vX.Y.Z`. It then prints the address of the Actions page.
5. Open that address and watch the run "Release": `build` and `notes`, then `release`.
6. When the run is green, the release "Breccia X.Y.Z" is published. Nothing else to do.

`just release X.Y.Z --yes` skips the pause (no time to edit the section).

### Stopping, and when the push is refused

- Type `n` at the pause: the script undoes the version bump and the changelog section, and nothing is committed.
- Any other answer than Enter, `y`, `yes`, `n` or `no` (a typo such as `j`) undoes nothing: the script asks again, "Type Enter to release or n to stop".
- Ctrl+C at the pause works like `n`: the prompt closes and the script undoes the bump and the section.
- If you edited `CHANGELOG.md` during the pause and the release stops (`n`, Ctrl+C, or an error), your edited file is first copied to a temp folder, and the script prints "Your edited CHANGELOG.md is saved at …" with its path. Your text is not lost.
- Any error after the version bump undoes it and says so.
- If the script was stopped outside the pause (Ctrl+C before or after the pause, or a closed terminal), look at `git log -1` and `git tag -l vX.Y.Z`. Without a `chore(release): X.Y.Z` commit, run `git restore .` to get the clean tree back. With the commit, nothing was pushed yet unless it printed "Pushed": retry with `git push --atomic origin main vX.Y.Z`, or undo with `git tag -d vX.Y.Z` (if the tag exists) and `git reset --keep HEAD~1`.
- If the tag or the push fails, the commit is only on your machine. The script prints the exact commands to retry and to undo (`git reset --keep HEAD~1`, and `git tag -d vX.Y.Z` if the tag was made). Nothing is public until the push succeeds.

`just check-version` alone tells you whether all version files agree.

## The changelog

- `just changelog` previews: it prints what git-cliff would list for the commits since the last tag and writes nothing.
- `just release` writes the real section. The workflow takes the release text from that section in the tagged `CHANGELOG.md` (the run fails if the section is missing), so what you edited at the pause is what the release says.
- Pre-releases: `just release 1.1.0-rc.1`. git-cliff counts a pre-release tag as a version, so after an rc the final release lists only the commits since the rc. Merge the two sections by hand at the pause.
- The first release, 1.0.0, has no earlier tag, so its section lists every commit since the start. Shorten it by hand at the pause if you like. If no commit is listed (as with only the initial commit), the section says "First public release." instead of "No user-visible changes.".

## Trying the pipeline without a release

Actions, Release, Run workflow, on `main`. This builds and writes notes: no release is created. A manual run on `main` also saves the build cache (a tag run only reads it), which speeds up later runs. When it ends green, download the installer from the run's artifact `breccia-installer` (kept 7 days).

The run also uploads the artifact `release-notes` (kept 7 days; `gh run download <run id> -n release-notes`). `release-notes.md` is what git-cliff would list for the commits since the last tag (a tag run does not use it: its notes are the tagged `CHANGELOG.md` section). `changelog-preview.md` is `CHANGELOG.md` with an "Unreleased" section prepended, which shows what `just release` would add.

## When a run fails

Pushing a tag again, even unchanged or moved to a rewritten commit, starts the workflow again. If the release for that tag exists already, the `release` job fails (`gh release create` refuses a second release for one tag); delete the old release on the Releases page first if a rebuild is wanted.

If the very first step (the version check) failed, no release exists, so there is nothing to delete besides the tag.

If only the `release` job failed and `build` succeeded (for example a network hiccup), use "Re-run failed jobs" on the run. No new tag is needed, because the installer artifact is kept for 7 days.

Otherwise fix the problem on `main`. Then delete the tag locally and on GitHub, and any release the run left behind, and tag again:

- `git tag -d vX.Y.Z`
- `git push origin :refs/tags/vX.Y.Z`

A tag is never moved silently. To get a release out after that, pick one:

- The next patch version: after the fix is on `main`, run `just release X.Y.(Z+1)`. This fits when the fix changed code, or when the broken tag was already seen by others. It makes a new release commit and a new section in `CHANGELOG.md`.
- The same version, tagged by hand: when the fix is only to the workflow or its setup and the release commit itself is fine, run `git tag -a vX.Y.Z -m "Breccia X.Y.Z" <commit>` on the release commit (`chore(release): X.Y.Z`), then `git push origin vX.Y.Z`. The workflow builds that commit, so the fix must be in the workflow file of that commit; if it is not, use the patch version instead.

## Checking the installer

On a test machine or in Windows Sandbox:

- SmartScreen warns: choose "More info", then "Run anyway".
- It installs without an admin prompt, and a Start-menu entry appears.
- Settings shows "Breccia X.Y.Z" at its foot.
- The app opens a notes folder.
- Uninstall from Windows' Installed apps. The notes folder stays untouched.

## Building locally

`just bundle` builds the installer into `target/release/bundle/nsis/Breccia_<version>_x64-setup.exe`.

## The app icon

The icon is drawn in `app/src-tauri/icons/icon.svg`. Every other file in `app/src-tauri/icons/` (`icon.ico`, the PNGs, `icon.icns`) is generated from it by `just icons` (Tauri's `tauri icon`; the Android and iOS folders it also writes are deleted). After changing the SVG, run `just icons` and commit the result; `app/scripts/icons.test.mjs` checks that the files exist, are not Tauri's default and that `icon.ico` has 16, 24, 32, 48, 64 and 256 px. Windows may keep showing an old icon in the taskbar or Explorer until the user signs out; mention that in the release text of the first release with a new icon.

## Minutes

With an empty Rust cache the build job takes about half an hour; later runs that restore the cache are shorter. Actions minutes are free on a public repository; on a private one, Windows minutes count double against the account's quota.
