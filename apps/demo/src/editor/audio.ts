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
    this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(this.#stream);
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
    }
    this.audio.currentTime = t / 1000;
    try {
      await this.audio.play();
    } catch {
      /* autoplay or codec: position is still set */
    }
    this.onChange();
  }

  pause(): void {
    this.audio.pause();
  }

  /** Playback position in ms. */
  get position(): number {
    return this.audio.currentTime * 1000;
  }
}
