/**
 * Word-level diff for showing AI suggestions (plan §9.1: "shown as a diff"). Whitespace
 * stays attached to the following word so joining the parts restores the text exactly.
 */

export interface DiffPart {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export function tokenize(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}'’_-]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** LCS diff over tokens. Falls back to delete-all/insert-all for very long inputs. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const parts: DiffPart[] = [];
  const push = (op: DiffPart['op'], text: string): void => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.op === op) last.text += text;
    else parts.push({ op, text });
  };
  // Trim common prefix and suffix first (cheap, and keeps the table small).
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  push('equal', a.slice(0, start).join(''));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > 4_000_000) {
    push('delete', midA.join(''));
    push('insert', midB.join(''));
  } else {
    const n = midA.length;
    const m = midB.length;
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      const row = dp[i]!;
      const next = dp[i + 1]!;
      for (let j = m - 1; j >= 0; j--) {
        row[j] = midA[i] === midB[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        push('equal', midA[i]!);
        i++;
        j++;
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        push('delete', midA[i]!);
        i++;
      } else {
        push('insert', midB[j]!);
        j++;
      }
    }
    while (i < n) push('delete', midA[i++]!);
    while (j < m) push('insert', midB[j++]!);
  }
  push('equal', a.slice(endA).join(''));
  return parts;
}

export function applyDiff(parts: readonly DiffPart[], side: 'before' | 'after'): string {
  return parts
    .filter((p) => p.op === 'equal' || p.op === (side === 'before' ? 'delete' : 'insert'))
    .map((p) => p.text)
    .join('');
}

export function changeCount(parts: readonly DiffPart[]): number {
  return parts.filter((p) => p.op !== 'equal' && p.text.trim()).length;
}
