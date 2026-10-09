/**
 * Pure helpers for audio-synced notes (unit-testable without media APIs).
 * A mark ties a stroke or paragraph to a time in a recording.
 */
export interface Mark {
  rec: string;
  t: number;
  kind: 'stroke' | 'text';
  ref: string;
}

/** Position of a mark on a timeline, 0–100 (%), clamped. */
export function markPosition(t: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(100, (t / duration) * 100));
}

/** Format milliseconds as m:ss (or h:mm:ss). */
export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Where playback should start for a tapped mark: a little before it, for context. */
export function seekTime(markT: number, leadMs = 1500): number {
  return Math.max(0, markT - leadMs);
}

/** Marks within a recording, sorted by time. */
export function marksFor(rec: string, marks: readonly Mark[]): Mark[] {
  return marks.filter((m) => m.rec === rec).sort((a, b) => a.t - b.t);
}
