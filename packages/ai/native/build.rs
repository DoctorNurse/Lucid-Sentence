//! Apple targets: ggml's Metal backend uses `@available(...)`, which needs
//! `___isPlatformVersionAtLeast` from clang's runtime library. Rust links with
//! `-nodefaultlibs`, so link `libclang_rt.osx.a` (fat: arm64 + x86_64) explicitly.

use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let llama = std::env::var("CARGO_FEATURE_LLAMA").is_ok();
    if !llama || !(os == "macos" || os == "ios") {
        return;
    }
    let lib = if os == "macos" {
        "clang_rt.osx"
    } else {
        "clang_rt.ios"
    };
    let out = Command::new("xcrun")
        .args(["clang", "--print-resource-dir"])
        .output()
        .or_else(|_| Command::new("clang").arg("--print-resource-dir").output());
    let Ok(out) = out else {
        println!("cargo:warning=clang not found; Metal builds may fail to link");
        return;
    };
    let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let darwin = std::path::Path::new(&dir).join("lib").join("darwin");
    if darwin.join(format!("lib{lib}.a")).exists() {
        println!("cargo:rustc-link-search=native={}", darwin.display());
        println!("cargo:rustc-link-lib=static={lib}");
    } else {
        println!(
            "cargo:warning=lib{lib}.a not found in {}; Metal builds may fail to link",
            darwin.display()
        );
    }
}
