# breccia - task runner

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# List recipes
default:
    @just --list

# Run Breccia in dev mode (frontend hot reload)
[working-directory: 'app']
dev:
    npm run tauri dev

# Run dev mode with the DevTools protocol on port 9222
[working-directory: 'app']
dev-debug:
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'; npm run tauri dev

# Build the release exe (no installer)
[working-directory: 'app']
build:
    npm run tauri build -- --no-bundle

# Build the Windows installer (NSIS) into target/release/bundle/nsis
[working-directory: 'app']
bundle:
    npm run tauri build -- --bundles nsis

# Regenerate app/src-tauri/icons from icons/icon.svg (Tauri CLI; the mobile folders it also writes are dropped)
[working-directory: 'app']
icons:
    npx tauri icon src-tauri/icons/icon.svg -o src-tauri/icons; if ($LASTEXITCODE) { exit $LASTEXITCODE }
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue src-tauri/icons/android, src-tauri/icons/ios

# Run all tests (frontend build first: Tauri needs app/dist to compile)
test:
    Set-Location app; npm run build; if ($LASTEXITCODE) { exit $LASTEXITCODE }; npm test; if ($LASTEXITCODE) { exit $LASTEXITCODE }
    cargo test --workspace; if ($LASTEXITCODE) { exit $LASTEXITCODE }
    node app/scripts/clean-stale.mjs hint

# Delete build outputs in target/ older than 7 days (the newest of each stays; add --dry-run to only count)
clean-stale *args:
    node app/scripts/clean-stale.mjs {{args}}

# Check formatting and types, and run clippy
lint:
    cargo fmt --all --check
    cargo clippy --workspace --all-targets -- -D warnings
    Set-Location app; npm run check

# End-to-end smoke test against the release build
e2e: build
    Set-Location app; npm run e2e

# Screenshots for the README from docs/demo (release exe, off screen)
screenshots: build
    Set-Location app; node e2e/screenshots.mjs

# The network view at 5,000 pages and 50,000 links, in the release exe (add --onscreen to watch)
graph-scale *args: build
    Set-Location app; node e2e/graph-scale.mjs {{args}}

# Set the app version everywhere (Cargo.toml, Cargo.lock, package files), then check it
version v:
    node app/scripts/version.mjs bump {{v}}; if ($LASTEXITCODE) { exit $LASTEXITCODE }
    node app/scripts/version.mjs check

# Check that every version file agrees
check-version:
    node app/scripts/version.mjs check

# Cut a release: checks, version, CHANGELOG section, commit, tag, push (version optional: next minor)
release *args:
    node app/scripts/release.mjs {{args}}

# Show what the next CHANGELOG section would list (writes nothing; needs git-cliff)
changelog:
    node app/scripts/release.mjs preview
