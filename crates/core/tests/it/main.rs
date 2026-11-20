//! The one integration-test program of breccia-core: every test file is a module here,
//! so the core is linked once, not once per file. Run one file's tests with `cargo test -p breccia-core <file>::`.

// First, so its macros (`answer!`) are in scope in every module below.
#[macro_use]
mod support;

mod aliases;
mod auto_archive;
mod backlinks;
mod board;
mod color;
mod config;
mod dailies;
mod dailies_session;
mod dates;
mod demo;
mod disk;
mod edit;
mod format_doc;
mod frontmatter;
mod fsio;
mod git_commit;
mod git_engine;
mod git_env;
mod git_repo;
mod git_sync;
mod gitenv;
mod graph;
mod inline;
mod journal;
mod naming;
mod page_color;
mod place;
mod relink;
mod rename;
mod render;
mod roundtrip;
mod scale;
mod search;
mod search_store;
mod session;
mod states;
mod table;
mod task;
mod tree;
mod watch;
mod wire_types;
mod workspace;
