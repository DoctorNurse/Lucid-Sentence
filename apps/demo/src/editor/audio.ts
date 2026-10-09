/**
 * Audio recording for Notes mode. Uses MediaRecorder; recordings stay on this
 * device (IndexedDB). There are no uploads and no network calls.
 */
const DB = 'lucid-sentence-notes';
const STORE = 'recordings';

export interface Recording {
  id: string;
  created: number;
  duration: number;
  mime: string;
  blob: Blob;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB unavailable'));
    };
  });
}

export async function saveRecording(r: Recording): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(r);
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('save failed'));
    };
  });
}

export async function listRecordings(): Promise<Recording[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => {
      resolve((req.result as Recording[]).sort((a, b) => a.created - b.created));
    };
    req.onerror = () => {
      reject(req.error ?? new Error('read failed'));
    };
  });
}

/** The first recording format this WebView supports (Android/Chrome: webm/opus; Safari: mp4). */
export function pickMime(
  supported: (t: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
    (t) => {
      try {
        return supported(t);
      } catch {
        return false;
      }
    },
  );
}

/** A plain-language reason the microphone couldn't start. */
export function micError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'Microphone permission is off. Allow it when asked, or turn it on in Settings → Apps → Lucid Sentence → Permissions → Microphone, then tap Record again.';
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return 'No microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The microphone is busy (another app may be using it). Close that app and try again.';
  }
  if (name === 'NotSupportedError' || name === 'TypeError') {
    return "Audio recording isn't supported in this browser.";
  }
  return "The microphone couldn't start. Check the app's microphone permission and try again.";
}

export class AudioNotes {
  current: { id: string; startedAt: number } | null = null;
  recordings: Recording[] = [];
  #rec: MediaRecorder | null = null;
  #chunks: Blob[] = [];
  #stream: MediaStream | null = null;
  readonly audio = new Audio();
  #url: string | null = null;
  playing: Recording | null = null;

  constructor(readonly onChange: () => void) {
    this.audio.addEventListener('timeupdate', onChange);
    this.audio.addEventListener('ended', onChange);
    this.audio.addEventListener('pause', onChange);
    this.audio.addEventListener('play', onChange);
    void listRecordings()
      .then((r) => {
        this.recordings = r;
        onChange();
      })
      .catch(() => {
        /* storage unavailable: recordings still work for this session */
      });
  }

  get recording(): boolean {
    return this.current !== null;
  }

  /** Current position in the active recording (ms), for timestamping ink and text. */
  clock(): { rec: string; t: number } | null {
    return this.current
      ? { rec: this.current.id, t: performance.now() - this.current.startedAt }
      : null;
  }

  async start(): Promise<void> {
    if (this.#rec) return;
    if (!('mediaDevices' in navigator) || typeof MediaRecorder === 'undefined') {
      throw new DOMException('Recording is not supported here', 'NotSupportedError');
    }
    this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mimeType
        ? new MediaRecorder(this.#stream, { mimeType })
        : new MediaRecorder(this.#stream);
    } catch (e) {
      this.#stream.getTracks().forEach((t) => {
        t.stop();
      });
      this.#stream = null;
      throw e;
    }
    this.#chunks = [];
    rec.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) this.#chunks.push(e.data);
    });
    this.#rec = rec;
    rec.start(1000);
    this.current = { id: `rec-${Date.now().toString(36)}`, startedAt: performance.now() };
    this.onChange();
  }

  async stop(): Promise<Recording | null> {
    const rec = this.#rec;
    const cur = this.current;
    if (!rec || !cur) return null;
    const done = new Promise<void>((resolve) => {
      rec.addEventListener(
        'stop',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    rec.stop();
    await done;
    this.#stream?.getTracks().forEach((t) => {
      t.stop();
    });
    const r: Recording = {
      id: cur.id,
      created: Date.now(),
      duration: performance.now() - cur.startedAt,
      mime: rec.mimeType || 'audio/webm',
      blob: new Blob(this.#chunks, { type: rec.mimeType || 'audio/webm' }),
    };
    this.#rec = null;
    this.current = null;
    this.recordings.push(r);
    this.onChange();
    try {
      await saveRecording(r);
    } catch {
      /* private mode: keep in memory */
    }
    return r;
  }

  /** Play a recording from `t` ms. */
  async play(id: string, t = 0): Promise<void> {
    const r = this.recordings.find((x) => x.id === id);
    if (!r) return;
    if (this.playing?.id !== id) {
      if (this.#url) URL.revokeObjectURL(this.#url);
      this.#url = URL.createObjectURL(r.blob);
      this.audio.src = this.#url;
      this.playing = r;
      await this.#seekable();
    }
    this.audio.currentTime = t / 1000;
    try {
      await this.audio.play();
    } catch {
      /* autoplay or codec: position is still set */
    }
    this.onChange();
  }

  /**
   * Recordings from MediaRecorder (webm) carry no duration, and Chrome won't seek in them
   * until it has scanned to the end once. Do that quietly before the first seek.
   */
  async #seekable(): Promise<void> {
    const a = this.audio;
    const once = (events: string[], ms: number): Promise<void> =>
      new Promise((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          for (const ev of events) a.removeEventListener(ev, done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        for (const ev of events) a.addEventListener(ev, done);
      });
    if (a.readyState < 1) await once(['loadedmetadata', 'error'], 1500);
    // Infinity: a MediaRecorder file without a duration. (NaN: not loaded; leave it.)
    if (a.duration !== Infinity) return;
    const muted = a.muted;
    a.muted = true;
    a.currentTime = 1e7;
    await once(['durationchange', 'error'], 1500);
    a.currentTime = 0;
    a.muted = muted;
  }

  pause(): void {
    this.audio.pause();
  }

  /** Playback position in ms. */
  get position(): number {
    return this.audio.currentTime * 1000;
  }
}
