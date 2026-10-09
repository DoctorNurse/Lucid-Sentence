//! Device facts for the tier gate (plan §9.4): total and available RAM, CPU threads,
//! and whether the native runtime can run on this CPU.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub total_ram_bytes: u64,
    pub available_ram_bytes: u64,
    pub cpu_threads: u32,
    pub os: String,
    pub arch: String,
    pub native_runtime: bool,
}

pub fn info() -> DeviceInfo {
    let (total, avail) = memory();
    DeviceInfo {
        total_ram_bytes: total,
        available_ram_bytes: avail,
        cpu_threads: std::thread::available_parallelism()
            .map(|n| u32::try_from(n.get()).unwrap_or(1))
            .unwrap_or(1),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        native_runtime: crate::engine::Engine::available(),
    }
}

/// Parses `/proc/meminfo` (Linux and Android). Returns (total, available) in bytes.
pub fn parse_meminfo(text: &str) -> (u64, u64) {
    let field = |name: &str| -> u64 {
        text.lines()
            .find(|l| l.starts_with(name))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|v| v.parse::<u64>().ok())
            .map_or(0, |kb| kb * 1024)
    };
    (field("MemTotal:"), field("MemAvailable:"))
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn memory() -> (u64, u64) {
    std::fs::read_to_string("/proc/meminfo")
        .map(|t| parse_meminfo(&t))
        .unwrap_or((0, 0))
}

#[cfg(target_os = "macos")]
fn memory() -> (u64, u64) {
    let total = std::process::Command::new("/usr/sbin/sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0);
    (total, 0)
}

#[cfg(windows)]
fn memory() -> (u64, u64) {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    // SAFETY: MEMORYSTATUSEX is plain data; dwLength must be set before the call.
    unsafe {
        let mut m: MEMORYSTATUSEX = std::mem::zeroed();
        m.dwLength = u32::try_from(std::mem::size_of::<MEMORYSTATUSEX>()).unwrap_or(64);
        if GlobalMemoryStatusEx(&mut m) != 0 {
            (m.ullTotalPhys, m.ullAvailPhys)
        } else {
            (0, 0)
        }
    }
}

#[cfg(not(any(
    target_os = "linux",
    target_os = "android",
    target_os = "macos",
    windows
)))]
fn memory() -> (u64, u64) {
    (0, 0)
}

/// Peak resident set size of this process in bytes (Linux/Android only; 0 elsewhere).
pub fn peak_rss_bytes() -> u64 {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        std::fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|t| {
                t.lines()
                    .find(|l| l.starts_with("VmHWM:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .map_or(0, |kb| kb * 1024)
    }
    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    {
        0
    }
}

/// Current resident set size in bytes (Linux/Android only; 0 elsewhere).
pub fn rss_bytes() -> u64 {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        std::fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|t| {
                t.lines()
                    .find(|l| l.starts_with("VmRSS:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .map_or(0, |kb| kb * 1024)
    }
    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_meminfo() {
        let t = "MemTotal:        7864320 kB\nMemFree:  100 kB\nMemAvailable:    3145728 kB\n";
        assert_eq!(parse_meminfo(t), (7_864_320 * 1024, 3_145_728 * 1024));
        assert_eq!(parse_meminfo(""), (0, 0));
    }

    #[test]
    fn reports_something() {
        let i = info();
        assert!(i.cpu_threads >= 1);
        assert!(!i.os.is_empty());
    }
}
