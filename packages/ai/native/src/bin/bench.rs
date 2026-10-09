//! On-device AI benchmark: model load time, time to first token, prompt and decode
//! tokens/sec, and peak RAM (RSS) on this machine's CPU.
//!
//! Usage: lucid-ai-bench <model.gguf> [--threads N] [--ctx N] [--runs N] [--json]
//!        [--template chatml|gemma4|builtin]
//!
//! The prompts mirror the app's tasks (rewrite, grammar, summarize, Tell Lucid) and use
//! the same ChatML layout as packages/ai/src/prompt.ts, with thinking turned off.
//! `--template gemma4` formats turns for Gemma 4 (the comparison in docs/AI.md);
//! `--template builtin` asks llama.cpp to apply the GGUF's own template.

use lucid_ai::device::{info, peak_rss_bytes, rss_bytes};
use lucid_ai::engine::{default_threads, Engine, GenerateRequest, LoadOptions};
use std::path::PathBuf;

const PASSAGE: &str = "Lucid Sentence is a free, open-source word processor for .docx files. It keeps Word's familiar ribbon so people who already know Word can find every command, and it adds a fresher look with careful typography. The editor runs on desktop, Android, and as a home-screen web app on iPhone and iPad. Optional on-device AI can rewrite a selection, fix grammar, summarize, and turn plain-language requests into ribbon commands, and none of it sends the document anywhere. Every AI edit arrives as a suggestion that the writer accepts or rejects, so the document never changes behind their back.";

fn chatml(system: &str, user: &str) -> String {
    format!("<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n")
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let Some(model) = args.get(1).map(PathBuf::from) else {
        eprintln!("usage: lucid-ai-bench <model.gguf> [--threads N] [--ctx N] [--runs N] [--json]");
        std::process::exit(2);
    };
    let flag = |name: &str| -> Option<String> {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1).cloned())
    };
    let threads: i32 = flag("--threads")
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(default_threads);
    let n_ctx: u32 = flag("--ctx").and_then(|v| v.parse().ok()).unwrap_or(4096);
    let runs: usize = flag("--runs").and_then(|v| v.parse().ok()).unwrap_or(1);
    let as_json = args.iter().any(|a| a == "--json");
    let template = flag("--template").unwrap_or_else(|| "chatml".into());

    let dev = info();
    let rss0 = rss_bytes();
    let engine = Engine::load(
        &model,
        LoadOptions {
            n_ctx,
            n_threads: threads,
            n_gpu_layers: 0,
        },
    )
    .unwrap_or_else(|e| {
        eprintln!("load failed: {e}");
        std::process::exit(1);
    });
    let rss_loaded = rss_bytes();
    let chatml = |system: &str, user: &str| -> String {
        match template.as_str() {
            "builtin" => engine.chat_prompt(system, user).unwrap_or_else(|e| {
                eprintln!("chat template: {e}");
                std::process::exit(1);
            }),
            "gemma4" => format!(
                "<|turn>system\n{system}<turn|>\n<|turn>user\n{user}<turn|>\n<|turn>model\n"
            ),
            _ => chatml(system, user),
        }
    };

    let grammar = r#"root ::= "{\"command\":\"" id "\"}"
id ::= "review.tracking.track-changes" | "home.font.bold" | "view.zoom.zoom" | "insert.tables.table" | "none""#;
    let tasks: Vec<(&str, GenerateRequest)> = vec![
        ("rewrite-formal", GenerateRequest {
            prompt: chatml("You rewrite text. Reply with only the rewritten text.", &format!("Rewrite this to sound more formal:\n\n{PASSAGE}")),
            max_tokens: 160, temperature: 0.0, grammar: None, stop: vec!["<|im_end|>".into(), "<turn|>".into()], seed: None }),
        ("fix-grammar", GenerateRequest {
            prompt: chatml("You fix spelling and grammar. Reply with only the corrected text.", "Fix the grammar:\n\nthe team have went to the meeting yesterday and they was very happy with there results, its a good outcome."),
            max_tokens: 64, temperature: 0.0, grammar: None, stop: vec!["<|im_end|>".into(), "<turn|>".into()], seed: None }),
        ("summarize", GenerateRequest {
            prompt: chatml("You summarize text in one or two sentences. Reply with only the summary.", &format!("Summarize:\n\n{PASSAGE}")),
            max_tokens: 80, temperature: 0.0, grammar: None, stop: vec!["<|im_end|>".into(), "<turn|>".into()], seed: None }),
        ("tell-lucid (grammar)", GenerateRequest {
            prompt: chatml("Map the request to one command id. Commands: review.tracking.track-changes (Track Changes), home.font.bold (Bold), view.zoom.zoom (Zoom), insert.tables.table (Table), none.", "turn on track changes please"),
            max_tokens: 32, temperature: 0.0, grammar: Some(grammar.into()), stop: vec![], seed: None }),
    ];

    let mut rows = Vec::new();
    for run in 0..runs {
        for (name, req) in &tasks {
            let (text, st) = engine.generate(req, |_| true).unwrap_or_else(|e| {
                eprintln!("{name}: {e}");
                std::process::exit(1);
            });
            rows.push(serde_json::json!({
                "run": run, "task": name,
                "promptTokens": st.prompt_tokens, "completionTokens": st.completion_tokens,
                "ttftMs": (st.prompt_ms * 10.0).round() / 10.0,
                "promptTokPerSec": (st.prompt_tokens_per_sec() * 10.0).round() / 10.0,
                "decodeTokPerSec": (st.decode_tokens_per_sec() * 10.0).round() / 10.0,
                "stoppedBy": st.stopped_by, "output": text.trim(),
            }));
        }
    }
    let peak = peak_rss_bytes();
    let mb = |b: u64| (b as f64 / 1_048_576.0 * 10.0).round() / 10.0;
    let summary = serde_json::json!({
        "model": model.file_name().map(|f| f.to_string_lossy().into_owned()),
        "modelFileMB": std::fs::metadata(&model).map(|m| mb(m.len())).unwrap_or(0.0),
        "threads": threads, "nCtx": n_ctx,
        "device": dev,
        "loadMs": (engine.load_ms * 10.0).round() / 10.0,
        "rssBeforeLoadMB": mb(rss0), "rssAfterLoadMB": mb(rss_loaded), "peakRssMB": mb(peak),
        "results": rows,
    });
    if as_json {
        println!(
            "{}",
            serde_json::to_string_pretty(&summary).unwrap_or_default()
        );
        return;
    }
    println!("model {}  threads {threads}  ctx {n_ctx}  load {:.0} ms  peak RSS {:.0} MB (before load {:.0} MB)",
        summary["model"].as_str().unwrap_or("?"), engine.load_ms, mb(peak), mb(rss0));
    println!(
        "{:<22} {:>7} {:>7} {:>9} {:>11} {:>11}",
        "task", "prompt", "output", "TTFT ms", "prompt t/s", "decode t/s"
    );
    for r in summary["results"].as_array().into_iter().flatten() {
        println!(
            "{:<22} {:>7} {:>7} {:>9} {:>11} {:>11}",
            r["task"].as_str().unwrap_or(""),
            r["promptTokens"],
            r["completionTokens"],
            r["ttftMs"],
            r["promptTokPerSec"],
            r["decodeTokPerSec"]
        );
    }
    for r in summary["results"]
        .as_array()
        .into_iter()
        .flatten()
        .take(tasks.len())
    {
        println!(
            "\n[{}] {}",
            r["task"].as_str().unwrap_or(""),
            r["output"].as_str().unwrap_or("")
        );
    }
}
