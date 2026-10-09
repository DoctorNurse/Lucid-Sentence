# On-device AI

Lucid Sentence can rewrite, fix grammar, summarize, shorten, and expand a selection, and it can turn a
plain-language request ("make the text bold") into a ribbon command. All of this runs **on the device**.
It is optional and **off by default**. The model is a one-time download, and after that everything works
offline. Nothing the user writes leaves the device, there is no telemetry, and there is no cloud fallback.
This implements plan §9 (Part A), and §9.7 for the local MCP server (see [MCP.md](MCP.md)).

## Where it lives

| Piece                                                           | Path                                                            | Notes                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Native runtime, downloads, device facts, MCP server core        | `packages/ai/native` (Rust crate `lucid-ai`)                    | llama.cpp via `llama-cpp-2`; benchmark CLI and real-model smoke test |
| Model manifest, prompts, tasks, Tell Lucid, web runtime, stores | `packages/ai` (`@lucid-sentence/ai`)                            | DOM-free, unit-tested with a mock model                              |
| Tauri commands                                                  | `apps/shell/src-tauri/src/ai.rs`, `mcp.rs`                      | `ai_*` on desktop and Android; `mcp_*` desktop only                  |
| UI                                                              | `apps/demo/src/ai/`                                             | model manager, suggestion card, Tell Lucid, MCP settings             |
| Ribbon                                                          | Review › **Assistant** (`packages/commands/src/tabs/review.ts`) | desktop, tablet, and phone placements                                |

## Model

**Default: Qwen3.5 2B (instruct), Q4_K_M GGUF. License: Apache-2.0.** Verified on Hugging Face on
2026-10-09 (`Qwen/Qwen3.5-2B`: `license: apache-2.0`, 2.27B parameters).

|                                          | Qwen3.5 2B (recommended)                                           | Qwen3.5 0.8B (lite)                                                |
| ---------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| File                                     | `Qwen3.5-2B-Q4_K_M.gguf`                                           | `Qwen3.5-0.8B-Q4_K_M.gguf`                                         |
| Source (pinned commit)                   | `unsloth/Qwen3.5-2B-GGUF@f6d5376be1ed`                             | `unsloth/Qwen3.5-0.8B-GGUF@6ab461498e20`                           |
| Download                                 | 1,280,835,840 bytes (1.28 GB)                                      | 532,517,120 bytes (533 MB)                                         |
| SHA-256                                  | `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223` | `bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517` |
| Peak RAM while running (box, 4k context) | ~1.9 GB                                                            | ~0.9 GB                                                            |
| Device floor (plan §9.4)                 | 8 GB RAM (Galaxy S24)                                              | 6 GB RAM                                                           |

- The manifest (`packages/ai/src/models.ts`) pins URL, size, and SHA-256. A download is used only after
  its SHA-256 matches; a mismatch deletes the file. The app's allow-list accepts only Apache-2.0 and MIT
  models (`ALLOWED_LICENSES`, tested).
- The same GGUF file runs on every platform, with the same ChatML prompts and "thinking" turned off.

### Why Qwen3.5 2B over Gemma 4 E2B

Gemma 4 E2B is also Apache-2.0 now (`google/gemma-4-E2B-it`, checked 2026-10-09). On the box CPU, same
prompts, Q4_K_M, 8 threads:

|                                | Qwen3.5 2B    | Gemma 4 E2B   |
| ------------------------------ | ------------- | ------------- |
| Download                       | **1.28 GB**   | 3.11 GB       |
| Peak RSS                       | **1.9 GB**    | 4.3 GB        |
| Prompt processing              | 130–140 tok/s | 115–125 tok/s |
| Decode                         | 21–23 tok/s   | 20–23 tok/s   |
| Output quality (these prompts) | good          | good          |

Gemma's per-layer embeddings make the file and resident memory more than twice as large for similar speed,
which breaks the S24 budget (≤ 2.2 GB extra RAM, plan §9.5). Gemma 4 E2B stays a candidate for a 12 GB
"enhanced" tier after on-device testing. Reproduce with
`lucid-ai-bench gemma-4-E2B-it-Q4_K_M.gguf --template gemma4`.

## Runtimes (what builds in CI, and why)

| Platform                                          | Runtime                                                                                                                         | Why                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Windows, macOS, Linux app                         | **llama.cpp, native**, in the Tauri process (`llama-cpp-2` 0.1.159, MIT OR Apache-2.0, bundled llama.cpp with `qwen35` support) | Fastest; Metal on macOS; the model file never crosses the WebView bridge            |
| Android app (arm64, x86_64)                       | **llama.cpp, native** (NDK, static libc++; arm64 built with `armv8.2-a+dotprod`)                                                | Same code path as desktop; dot-product kernels on every 8 GB-class phone            |
| Android app (32-bit Arm)                          | none (shows "needs a 64-bit device")                                                                                            | Below the 8 GB floor; keeps the APK build simple                                    |
| Web, iPhone/iPad home-screen app, Android browser | **wllama 3.8.1** (MIT): llama.cpp compiled to WebAssembly, WebGPU when available                                                | Reads the same GGUF from OPFS; served from our own origin under `ai/` (never a CDN) |

- **WebLLM was not chosen.** It needs MLC-compiled weights (a second artifact to host and verify) and
  requires WebGPU, which would leave out browsers without it. wllama falls back to CPU SIMD.
- wllama ships two builds: a fast one that needs WebAssembly JSPI + Memory64 (Chromium, including Android
  WebView) and a compatibility build for Safari/iOS and Firefox (`@wllama/wllama-compat`, 16 MB). Both are
  emitted under `ai/`, cached by the service worker in a separate cache the first time they're used (the
  app fetches the one it needs right after a model download), and are not precached. Tauri builds leave
  them out.
- Multi-threaded WebAssembly needs cross-origin isolation (COOP/COEP headers), which GitHub Pages can't
  send, so the web build runs single-threaded (WebGPU still applies). The native apps are unaffected.
- `cpu_supported()` refuses to start the native runtime on x86 CPUs without AVX2/FMA/F16C (the ggml kernels
  are built with them; the Rust code keeps the baseline target).

## Features

All results are **suggestions**: a card shows a word diff with **Accept**, **Reject**, and **Retry**.
Accepting replaces the text as one undoable edit. When the document engine lands (M1), accepting becomes a
tracked change instead (plan §9.5); `Suggestion` already carries `original`, `proposed`, and `diff` for that.

- **Rewrite** with a tone: Clearer, Formal, Friendly, Concise, Confident, Plain language.
- **Fix Grammar**, **Shorten**, **Expand** (replace the selection), **Summarize** (adds a paragraph after it).
- **Tell Lucid**: a shortlist of registry commands (synonyms and keywords), then the model picks one id
  under a GBNF grammar (`{"command":"<id>|none","value":"…"}`), the app validates it, and the user confirms
  before anything runs. Without a model it falls back to keyword matching. Also reachable from the command
  search: type a request and choose **Ask Lucid**.
- Selections over 2,500 words are refused with a message; with no selection the paragraph at the caret is used.
- The selected text is untrusted input: it is fenced, ChatML control tokens are stripped, and the model can
  only produce text for review or one validated, user-confirmed command id.

### Model manager (Review › Assistant › AI Models)

- Opt-in switch (off by default), device line (RAM, WebGPU, free storage; CPU threads in the app).
- Model cards: size, parameters, quantization, RAM floor, license link, and a device check
  (fits / check / too large) from `checkModel` (RAM with 10% slack, storage, platform warnings).
- Download with progress, **Pause**/**Resume** (HTTP Range; the web store keeps bytes in OPFS, the app keeps
  a `.part` file in app data), SHA-256 check, **Delete**. The web app asks for persistent storage.
- The model loads on first use and unloads after 5 idle minutes to give memory back to the editor.

## Benchmarks (box CPU)

`lucid-ai-bench` (`packages/ai/native/src/bin/bench.rs`), Intel Xeon (8 threads, AVX2/AVX-512),
4k context, CPU only, medians of 2 runs. The box is shared, so expect some noise.

| Model        | Threads | Load      | Peak RSS | Rewrite TTFT (157-token prompt) | Prompt tok/s | Decode tok/s |
| ------------ | ------- | --------- | -------- | ------------------------------- | ------------ | ------------ |
| Qwen3.5 2B   | 8       | 1.2–2.7 s | 1.94 GB  | 1.1 s                           | 130–140      | 21–23        |
| Qwen3.5 2B   | 4       | 1.2 s     | 1.94 GB  | 1.9 s                           | 74–85        | 13–14        |
| Qwen3.5 0.8B | 4       | 0.65 s    | 0.90 GB  | 0.9 s                           | 160–175      | 28–29        |
| Gemma 4 E2B  | 8       | 3.0–3.7 s | 4.31 GB  | 2.1 s                           | 115–125      | 20–23        |

Tell Lucid (grammar-constrained) answers in 0.4–0.8 s on the 2B model and picked
`review.tracking.track-changes` for "turn on track changes please". Raw JSON for these runs is in
[`docs/ai-bench/`](ai-bench/). Phones will be slower per thread; the S24 gate targets are TTFT ≤ 1.5 s and ≥ 10 tok/s.

### Web runtime, real model (headless Chromium on the box)

The real web path was tested end to end: opt in, download the lite model (533 MB) from Hugging Face into
OPFS with SHA-256 check, then run Fix grammar and Tell Lucid through the ribbon.

| Step                                             | Result                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Download + verify (0.8B)                         | 31.7 s                                                                          |
| Fix grammar, first run (includes model load)     | 30.5 s, 4.1 tokens/s; "teh/have went/they was" fixed                            |
| Tell Lucid "please make the selected words bold" | `home.font.bold`, 30 s                                                          |
| Build used                                       | JSPI fast build, single thread (the preview server isn't cross-origin isolated) |

The web build is much slower than native (single-threaded WASM here) and is meant
for the lite model. Tell Lucid on the web is slow because its prompt (the command list) is long; the
instant fuzzy match still shows while the model works. Multi-threading needs COOP/COEP headers on the
host, which the GitHub Pages deployment can't set.

## Tests

- `pnpm test`: `packages/ai/test/ai.test.ts` covers the manifest and license allow-list, prompts and
  sanitizing, output cleanup, the word diff, task building, Tell Lucid shortlist/grammar/parsing, SHA-256,
  resumable OPFS-style downloads (with a fake server: resume, bad checksum, cancel), and the Assistant
  state machine, all against `MockRuntime`.
- `cargo test` in `packages/ai/native`: downloads (resume, checksum, cancel), device facts, engine helpers,
  MCP keys, Host/Origin checks, rate limits, JSON-RPC flow, and a loopback server test.
- Real model: `LUCID_AI_MODEL=/path/Qwen3.5-0.8B-Q4_K_M.gguf cargo test --release --test smoke`
  (grammar fix, grammar-constrained intent, cancellation).
- `e2e/assistant.spec.ts` (Playwright, `?ai=mock`): opt-in, download, suggestion accept/reject, Rewrite
  tones, Summarize, Tell Lucid with confirmation, Ask Lucid from the command search, phone and tablet layouts.

## Needs real-device testing

- **Galaxy S24 (8 GB), both Snapdragon 8 Gen 3 and Exynos 2400:** 2B model TTFT, decode speed, peak RAM with
  a document open, and that Android doesn't kill the app (plan §9.5); 10-minute thermal and battery runs.
- **Galaxy S26:** the same, and whether the 2B model should be the default there.
- **Android tablet:** Assistant group in the folded tablet ribbon, suggestion card placement, and S Pen
  selection followed by Rewrite.
- **iPhone/iPad (home-screen web app):** wllama compat build speed and memory on Safari (WebGPU on/off),
  OPFS persistence after the app is closed, the 0.8B default for 6 GB devices.
- **Desktop:** Metal on Apple silicon (universal build), Windows on a CPU without AVX2 (should say the
  runtime is unavailable rather than crash), and the MCP server with a real client.
- **Downloads on mobile data:** the plan asks for Wi-Fi only by default; the app warns on metered
  connections where the browser reports it, but this needs checking on devices.
