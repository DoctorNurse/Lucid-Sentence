//! llama.cpp runtime. Prompts arrive fully formatted (the chat template lives in
//! `packages/ai`, shared with the web runtime), so this layer only tokenizes, decodes,
//! samples, and streams pieces back.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Instant;

/// One generation request. `grammar` is GBNF (root rule `root`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub prompt: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub temperature: f32,
    #[serde(default)]
    pub grammar: Option<String>,
    #[serde(default)]
    pub stop: Vec<String>,
    #[serde(default)]
    pub seed: Option<u32>,
}

fn default_max_tokens() -> u32 {
    256
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateStats {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    /// Time to first token (prompt processing), milliseconds.
    pub prompt_ms: f64,
    /// Decode time for the completion tokens, milliseconds.
    pub decode_ms: f64,
    pub stopped_by: String,
}

impl GenerateStats {
    pub fn decode_tokens_per_sec(&self) -> f64 {
        if self.decode_ms <= 0.0 {
            0.0
        } else {
            f64::from(self.completion_tokens) * 1000.0 / self.decode_ms
        }
    }
    pub fn prompt_tokens_per_sec(&self) -> f64 {
        if self.prompt_ms <= 0.0 {
            0.0
        } else {
            f64::from(self.prompt_tokens) * 1000.0 / self.prompt_ms
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadOptions {
    #[serde(default = "default_ctx")]
    pub n_ctx: u32,
    /// 0 = choose automatically (performance cores).
    #[serde(default)]
    pub n_threads: i32,
    /// Layers to offload to the GPU (Metal on macOS). 0 keeps everything on the CPU.
    #[serde(default)]
    pub n_gpu_layers: u32,
}

fn default_ctx() -> u32 {
    4096
}

impl Default for LoadOptions {
    fn default() -> Self {
        Self {
            n_ctx: default_ctx(),
            n_threads: 0,
            n_gpu_layers: 0,
        }
    }
}

#[derive(Debug)]
pub struct EngineError(pub String);

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for EngineError {}

fn err(e: impl std::fmt::Display) -> EngineError {
    EngineError(e.to_string())
}

/// Removes any stop string from the end of `text` and reports whether one matched.
pub fn trim_stop(text: &mut String, stop: &[String]) -> bool {
    for s in stop {
        if s.is_empty() {
            continue;
        }
        if let Some(i) = text.find(s.as_str()) {
            text.truncate(i);
            return true;
        }
    }
    false
}

/// Default thread count: leave headroom for the UI. On phones the big.LITTLE split
/// means more threads than performance cores slows decoding down.
pub fn default_threads() -> i32 {
    let n = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let t = if cfg!(target_os = "android") {
        n.min(4)
    } else {
        (n.saturating_sub(1)).clamp(1, 8)
    };
    i32::try_from(t).unwrap_or(4)
}

/// Whether this CPU can run the native build (x86_64 builds use AVX2/FMA/F16C kernels).
pub fn cpu_supported() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        std::arch::is_x86_feature_detected!("avx2")
            && std::arch::is_x86_feature_detected!("fma")
            && std::arch::is_x86_feature_detected!("f16c")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        true
    }
}

#[cfg(feature = "llama")]
mod imp {
    use super::*;
    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::sampling::LlamaSampler;
    use std::num::NonZeroU32;
    use std::sync::OnceLock;

    static BACKEND: OnceLock<Result<LlamaBackend, String>> = OnceLock::new();

    fn backend() -> Result<&'static LlamaBackend, EngineError> {
        BACKEND
            .get_or_init(|| {
                LlamaBackend::init()
                    .map(|mut b| {
                        b.void_logs();
                        b
                    })
                    .map_err(|e| e.to_string())
            })
            .as_ref()
            .map_err(|e| EngineError(e.clone()))
    }

    pub struct Engine {
        model: LlamaModel,
        opts: LoadOptions,
        pub load_ms: f64,
    }

    impl Engine {
        pub fn available() -> bool {
            cpu_supported()
        }

        pub fn load(path: &Path, opts: LoadOptions) -> Result<Self, EngineError> {
            if !cpu_supported() {
                return Err(EngineError(
                    "This CPU lacks AVX2/FMA, which the native runtime needs.".into(),
                ));
            }
            let t0 = Instant::now();
            let params = LlamaModelParams::default().with_n_gpu_layers(opts.n_gpu_layers);
            let model = LlamaModel::load_from_file(backend()?, path, &params).map_err(err)?;
            Ok(Self {
                model,
                opts,
                load_ms: t0.elapsed().as_secs_f64() * 1000.0,
            })
        }

        pub fn model_size_bytes(&self) -> u64 {
            self.model.size()
        }

        /// Runs one completion. `on_piece` gets each decoded text piece; return `false` to stop.
        pub fn generate(
            &self,
            req: &GenerateRequest,
            mut on_piece: impl FnMut(&str) -> bool,
        ) -> Result<(String, GenerateStats), EngineError> {
            let threads = if self.opts.n_threads > 0 {
                self.opts.n_threads
            } else {
                default_threads()
            };
            let n_ctx = self.opts.n_ctx.max(512);
            let ctx_params = LlamaContextParams::default()
                .with_n_ctx(NonZeroU32::new(n_ctx))
                .with_n_batch(512)
                .with_n_threads(threads)
                .with_n_threads_batch(threads);
            let mut ctx = self
                .model
                .new_context(backend()?, ctx_params)
                .map_err(err)?;

            let vocab = self.model.vocab();
            // The prompt already carries the chat template's special tokens.
            let tokens = vocab.tokenize(req.prompt.as_bytes(), false, true);
            if tokens.is_empty() {
                return Err(EngineError("Empty prompt".into()));
            }
            let budget = n_ctx as usize;
            if tokens.len() + req.max_tokens as usize > budget {
                return Err(EngineError(format!(
                    "The text is too long for the model's context ({} + {} > {} tokens). Select less text.",
                    tokens.len(),
                    req.max_tokens,
                    budget
                )));
            }

            let mut stats = GenerateStats {
                prompt_tokens: u32::try_from(tokens.len()).unwrap_or(u32::MAX),
                ..Default::default()
            };
            let t_prompt = Instant::now();
            let mut batch = LlamaBatch::new(512, 1);
            let last = tokens.len() - 1;
            for (chunk_start, chunk) in tokens.chunks(512).enumerate().map(|(i, c)| (i * 512, c)) {
                batch.clear();
                for (j, t) in chunk.iter().enumerate() {
                    let pos = chunk_start + j;
                    batch
                        .add(*t, i32::try_from(pos).map_err(err)?, &[0], pos == last)
                        .map_err(err)?;
                }
                ctx.decode(&mut batch).map_err(err)?;
            }
            stats.prompt_ms = t_prompt.elapsed().as_secs_f64() * 1000.0;

            let mut samplers = Vec::new();
            if let Some(g) = req.grammar.as_deref().filter(|g| !g.trim().is_empty()) {
                samplers.push(LlamaSampler::grammar(&self.model, g, "root").map_err(err)?);
            }
            if req.temperature <= 0.0 {
                samplers.push(LlamaSampler::greedy());
            } else {
                samplers.push(LlamaSampler::top_k(40));
                samplers.push(LlamaSampler::top_p(0.9, 1));
                samplers.push(LlamaSampler::temp(req.temperature));
                samplers.push(LlamaSampler::dist(req.seed.unwrap_or(0x5eed)));
            }
            let mut sampler = LlamaSampler::chain_simple(samplers);

            let mut out = String::new();
            let mut pending: Vec<u8> = Vec::new();
            let mut logits_idx = batch.n_tokens() - 1;
            let t_decode = Instant::now();
            stats.stopped_by = "length".into();
            for pos in (tokens.len()..).take(req.max_tokens as usize) {
                // `sample` also accepts the token (grammar state advances there).
                let token = sampler.sample(&ctx, logits_idx);
                if vocab.is_eog(token) {
                    stats.stopped_by = "eos".into();
                    break;
                }
                stats.completion_tokens += 1;
                pending.extend(vocab.token_to_piece(token, false, None));
                // Only emit complete UTF-8; multi-byte characters can span tokens.
                let valid = match std::str::from_utf8(&pending) {
                    Ok(s) => s.len(),
                    Err(e) => e.valid_up_to(),
                };
                if valid > 0 {
                    let piece = String::from_utf8_lossy(&pending[..valid]).into_owned();
                    pending.drain(..valid);
                    out.push_str(&piece);
                    if trim_stop(&mut out, &req.stop) {
                        stats.stopped_by = "stop".into();
                        break;
                    }
                    if !on_piece(&piece) {
                        stats.stopped_by = "cancelled".into();
                        break;
                    }
                }
                batch.clear();
                batch
                    .add(token, i32::try_from(pos).map_err(err)?, &[0], true)
                    .map_err(err)?;
                logits_idx = 0;
                ctx.decode(&mut batch).map_err(err)?;
            }
            stats.decode_ms = t_decode.elapsed().as_secs_f64() * 1000.0;
            Ok((out, stats))
        }
    }
}

#[cfg(not(feature = "llama"))]
mod imp {
    use super::*;

    pub struct Engine {
        pub load_ms: f64,
    }

    impl Engine {
        pub fn available() -> bool {
            false
        }
        pub fn load(_path: &Path, _opts: LoadOptions) -> Result<Self, EngineError> {
            let _ = Instant::now();
            Err(EngineError(
                "This build has no native runtime; the web runtime is used instead.".into(),
            ))
        }
        pub fn model_size_bytes(&self) -> u64 {
            0
        }
        pub fn generate(
            &self,
            _req: &GenerateRequest,
            _on_piece: impl FnMut(&str) -> bool,
        ) -> Result<(String, GenerateStats), EngineError> {
            Err(EngineError("No native runtime".into()))
        }
    }
}

pub use imp::Engine;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_stop_strings() {
        let mut s = String::from("Hello<|im_end|>junk");
        assert!(trim_stop(&mut s, &["<|im_end|>".into()]));
        assert_eq!(s, "Hello");
        let mut s = String::from("Hello");
        assert!(!trim_stop(&mut s, &["".into(), "X".into()]));
    }

    #[test]
    fn request_defaults() {
        let r: GenerateRequest = serde_json::from_str(r#"{"prompt":"hi"}"#).unwrap();
        assert_eq!(r.max_tokens, 256);
        assert_eq!(r.temperature, 0.0);
        assert!(r.grammar.is_none());
    }

    #[test]
    fn stats_rates() {
        let s = GenerateStats {
            prompt_tokens: 100,
            completion_tokens: 50,
            prompt_ms: 500.0,
            decode_ms: 2500.0,
            stopped_by: "eos".into(),
        };
        assert!((s.decode_tokens_per_sec() - 20.0).abs() < 1e-9);
        assert!((s.prompt_tokens_per_sec() - 200.0).abs() < 1e-9);
        assert!(threads_ok(default_threads()));
    }

    fn threads_ok(t: i32) -> bool {
        (1..=8).contains(&t)
    }
}
