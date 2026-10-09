//! Resumable, checksum-verified model downloads.
//!
//! The file is written to `<dest>.part`; an interrupted download resumes with an HTTP
//! `Range` request. On completion the whole file is hashed (SHA-256) and compared with
//! the pinned manifest value before it is renamed into place. A mismatch deletes the
//! partial file, so a corrupted or tampered model is never loaded.

use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone)]
pub struct DownloadSpec {
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub dest: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Done,
    Cancelled,
}

#[derive(Debug)]
pub struct DownloadError(pub String);

impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for DownloadError {}

fn derr(e: impl std::fmt::Display) -> DownloadError {
    DownloadError(e.to_string())
}

pub fn part_path(dest: &Path) -> PathBuf {
    let mut p = dest.as_os_str().to_owned();
    p.push(".part");
    PathBuf::from(p)
}

/// Bytes already on disk for a partial download (0 if none).
pub fn resume_offset(dest: &Path) -> u64 {
    fs::metadata(part_path(dest)).map(|m| m.len()).unwrap_or(0)
}

/// Streams a file through SHA-256 and returns the lowercase hex digest.
pub fn sha256_file(path: &Path, cancel: Option<&AtomicBool>) -> Result<String, DownloadError> {
    let mut f = File::open(path).map_err(derr)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            return Err(DownloadError("cancelled".into()));
        }
        let n = f.read(&mut buf).map_err(derr)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex(&h.finalize()))
}

pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(s, "{b:02x}");
    }
    s
}

/// Copies `body` into the part file from `offset`, reporting progress. Separated from
/// the HTTP layer so tests can drive it with any reader.
pub fn write_stream(
    mut body: impl Read,
    part: &Path,
    offset: u64,
    total: u64,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<Outcome, DownloadError> {
    let mut f = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(part)
        .map_err(derr)?;
    f.set_len(offset).map_err(derr)?;
    f.seek(SeekFrom::Start(offset)).map_err(derr)?;
    let mut done = offset;
    let mut buf = vec![0u8; 256 * 1024];
    let mut since = 0u64;
    loop {
        if cancel.load(Ordering::Relaxed) {
            f.flush().map_err(derr)?;
            return Ok(Outcome::Cancelled);
        }
        let n = body.read(&mut buf).map_err(derr)?;
        if n == 0 {
            break;
        }
        f.write_all(&buf[..n]).map_err(derr)?;
        done += n as u64;
        since += n as u64;
        if since >= 4 * 1024 * 1024 {
            since = 0;
            progress(done, total);
        }
        if done > total {
            return Err(DownloadError(
                "The server sent more data than expected.".into(),
            ));
        }
    }
    f.sync_all().map_err(derr)?;
    progress(done, total);
    Ok(Outcome::Done)
}

/// Verifies the finished part file and moves it into place.
pub fn finish(spec: &DownloadSpec, cancel: &AtomicBool) -> Result<(), DownloadError> {
    let part = part_path(&spec.dest);
    let len = fs::metadata(&part).map_err(derr)?.len();
    if len != spec.size {
        return Err(DownloadError(format!(
            "Download incomplete: {len} of {} bytes.",
            spec.size
        )));
    }
    let digest = sha256_file(&part, Some(cancel))?;
    if !digest.eq_ignore_ascii_case(&spec.sha256) {
        let _ = fs::remove_file(&part);
        return Err(DownloadError(
            "Checksum mismatch: the downloaded file was discarded. Try again.".into(),
        ));
    }
    fs::rename(&part, &spec.dest).map_err(derr)?;
    Ok(())
}

/// Downloads (or resumes) `spec`. Blocking; run it on a worker thread.
pub fn download(
    spec: &DownloadSpec,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<Outcome, DownloadError> {
    if let Some(dir) = spec.dest.parent() {
        fs::create_dir_all(dir).map_err(derr)?;
    }
    if spec.dest.exists() {
        return Ok(Outcome::Done);
    }
    let part = part_path(&spec.dest);
    let mut offset = resume_offset(&spec.dest);
    if offset > spec.size {
        let _ = fs::remove_file(&part);
        offset = 0;
    }
    if offset < spec.size {
        let agent = ureq::AgentBuilder::new()
            .user_agent("LucidSentence-ModelDownload/1")
            .redirects(8)
            .build();
        let mut req = agent.get(&spec.url);
        if offset > 0 {
            req = req.set("Range", &format!("bytes={offset}-"));
        }
        let resp = req.call().map_err(derr)?;
        let status = resp.status();
        if offset > 0 && status == 200 {
            // The server ignored the Range header: start over.
            offset = 0;
        } else if status != 200 && status != 206 {
            return Err(DownloadError(format!("HTTP {status}")));
        }
        let outcome = write_stream(
            resp.into_reader(),
            &part,
            offset,
            spec.size,
            cancel,
            progress,
        )?;
        if outcome == Outcome::Cancelled {
            return Ok(Outcome::Cancelled);
        }
    }
    finish(spec, cancel)?;
    Ok(Outcome::Done)
}

/// Deletes a model and any partial download.
pub fn delete(dest: &Path) -> Result<(), DownloadError> {
    for p in [dest.to_path_buf(), part_path(dest)] {
        if p.exists() {
            fs::remove_file(&p).map_err(derr)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("lucid-ai-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn sha(data: &[u8]) -> String {
        hex(&Sha256::digest(data))
    }

    #[test]
    fn resumes_and_verifies() {
        let dir = tmp("resume");
        let data: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
        let spec = DownloadSpec {
            url: String::new(),
            sha256: sha(&data),
            size: data.len() as u64,
            dest: dir.join("m.gguf"),
        };
        let part = part_path(&spec.dest);
        let cancel = AtomicBool::new(false);
        let mut seen = 0;
        // First half, then "interrupted".
        write_stream(
            Cursor::new(&data[..100_000]),
            &part,
            0,
            spec.size,
            &cancel,
            &mut |d, _| seen = d,
        )
        .unwrap();
        assert_eq!(resume_offset(&spec.dest), 100_000);
        assert!(
            finish(&spec, &cancel).is_err(),
            "incomplete must not finish"
        );
        // Resume from the offset.
        let off = resume_offset(&spec.dest);
        write_stream(
            Cursor::new(&data[off as usize..]),
            &part,
            off,
            spec.size,
            &cancel,
            &mut |d, _| seen = d,
        )
        .unwrap();
        assert_eq!(seen, spec.size);
        finish(&spec, &cancel).unwrap();
        assert_eq!(fs::read(&spec.dest).unwrap(), data);
        assert!(!part.exists());
        delete(&spec.dest).unwrap();
        assert!(!spec.dest.exists());
    }

    #[test]
    fn rejects_bad_checksum() {
        let dir = tmp("bad");
        let data = b"not the model".to_vec();
        let spec = DownloadSpec {
            url: String::new(),
            sha256: sha(b"the model"),
            size: data.len() as u64,
            dest: dir.join("m.gguf"),
        };
        let cancel = AtomicBool::new(false);
        write_stream(
            Cursor::new(&data),
            &part_path(&spec.dest),
            0,
            spec.size,
            &cancel,
            &mut |_, _| {},
        )
        .unwrap();
        let e = finish(&spec, &cancel).unwrap_err();
        assert!(e.0.contains("Checksum"));
        assert!(!spec.dest.exists());
        assert!(!part_path(&spec.dest).exists());
    }

    #[test]
    fn cancels() {
        let dir = tmp("cancel");
        let cancel = AtomicBool::new(true);
        let out = write_stream(
            Cursor::new(vec![0u8; 10]),
            &dir.join("x.part"),
            0,
            10,
            &cancel,
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(out, Outcome::Cancelled);
    }
}
