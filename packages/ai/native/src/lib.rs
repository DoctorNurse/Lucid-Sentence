//! Lucid Sentence on-device AI (native side), used by the Tauri shell on desktop and Android.
//!
//! - [`engine`]: llama.cpp (GGUF) text generation with optional GBNF grammar constraints.
//! - [`download`]: resumable, checksum-verified model downloads into app data.
//! - [`device`]: RAM and CPU checks for the device-tier gate.
//! - [`mcp`]: the opt-in local MCP server (127.0.0.1, Origin/Host checks, per-document keys).
//!
//! Nothing here talks to the network except [`download`], and only for a URL from the
//! pinned model manifest that the user chose to download. There is no telemetry.

pub mod device;
pub mod download;
pub mod engine;
pub mod mcp;
