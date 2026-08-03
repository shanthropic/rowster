mod address;
mod app;
mod commands;
mod db;
mod downloads;
/// Public so integration tests (tests/) can exercise the security guards.
pub mod error;
mod events;
mod favicons;
mod find;
mod layout;
/// Public so integration tests can reference the chrome label constant.
pub mod model;
mod navlog;
mod permissions;
mod repos;
/// Public so integration tests can exercise the security guards.
pub mod security;
mod session;
mod settings;
/// Public so integration tests can construct default application state.
pub mod state;
mod tabs;
mod webview;

pub fn run() {
    app::run();
}
