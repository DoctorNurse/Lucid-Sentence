//! Real-model smoke test. Skipped unless LUCID_AI_MODEL points at a GGUF file, e.g.
//! LUCID_AI_MODEL=/path/Qwen3.5-0.8B-Q4_K_M.gguf cargo test --release --test smoke -- --nocapture

#![cfg(feature = "llama")]

use lucid_ai::engine::{Engine, GenerateRequest, LoadOptions};

fn chatml(system: &str, user: &str) -> String {
    format!("<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n")
}

#[test]
fn generates_and_follows_a_grammar() {
    let Ok(path) = std::env::var("LUCID_AI_MODEL") else {
        eprintln!("LUCID_AI_MODEL not set; skipping the real-model smoke test");
        return;
    };
    let engine = Engine::load(
        std::path::Path::new(&path),
        LoadOptions {
            n_ctx: 2048,
            ..Default::default()
        },
    )
    .expect("model loads");

    let mut streamed = String::new();
    let (text, stats) = engine
        .generate(
            &GenerateRequest {
                prompt: chatml(
                    "You fix spelling and grammar. Reply with only the corrected text.",
                    "<<<\nshe dont like teh rain\n>>>",
                ),
                max_tokens: 32,
                temperature: 0.0,
                grammar: None,
                stop: vec!["<|im_end|>".into()],
                seed: None,
            },
            |p| {
                streamed.push_str(p);
                true
            },
        )
        .expect("generates");
    eprintln!(
        "grammar fix: {text:?} ({:.1} tok/s)",
        stats.decode_tokens_per_sec()
    );
    assert_eq!(streamed.trim_end(), text.trim_end());
    let lower = text.to_lowercase();
    assert!(lower.contains("the rain"), "{text}");
    assert!(
        lower.contains("doesn't") || lower.contains("does not"),
        "{text}"
    );

    let grammar = r#"root ::= "{\"command\":\"" id "\"}"
id ::= "home.font.bold" | "review.tracking.track-changes" | "none""#;
    let (json, _) = engine
        .generate(
            &GenerateRequest {
                prompt: chatml(
                    "Pick the command id. Commands: home.font.bold (Bold), review.tracking.track-changes (Track Changes), none.",
                    "start tracking my edits",
                ),
                max_tokens: 24,
                temperature: 0.0,
                grammar: Some(grammar.into()),
                stop: vec![],
                seed: None,
            },
            |_| true,
        )
        .expect("grammar generation");
    eprintln!("intent: {json}");
    assert_eq!(json, r#"{"command":"review.tracking.track-changes"}"#);

    // Cancellation from the token callback stops generation.
    let (_, st) = engine
        .generate(
            &GenerateRequest {
                prompt: chatml("Write a long story.", "Go."),
                max_tokens: 200,
                temperature: 0.7,
                grammar: None,
                stop: vec![],
                seed: Some(1),
            },
            |_| false,
        )
        .expect("cancel");
    assert_eq!(st.stopped_by, "cancelled");
}
