/**
 * Prompt layout shared by every runtime (native llama.cpp and wllama), so the same
 * model sees the same text everywhere. Qwen3.5 uses ChatML; the empty think block
 * turns off its "thinking" mode, which keeps latency low (plan §9.2).
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const STOP = ['<|im_end|>', '<|endoftext|>', '<|im_start|>'];

/** Removes ChatML control sequences from untrusted text so it can't close a turn. */
export function sanitize(text: string): string {
  return text.replace(/<\|(im_start|im_end|endoftext)\|>/g, '').replace(/<\/?think>/g, '');
}

export function chatml(messages: readonly ChatMessage[]): string {
  const turns = messages
    .map((m) => `<|im_start|>${m.role}\n${sanitize(m.content)}<|im_end|>\n`)
    .join('');
  return `${turns}<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

/**
 * Cleans a model reply: drops any think block, stray control tokens, a leading
 * "Here is the rewritten text:" preamble, and wrapping quotes the model added.
 */
export function cleanOutput(raw: string, original = ''): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '');
  for (const stop of STOP) {
    const i = s.indexOf(stop);
    if (i >= 0) s = s.slice(0, i);
  }
  s = s.trim();
  s = s.replace(
    /^(sure[,!.]?\s*)?(here(?:['’]s| is| are)\s+(?:the|a|your)\s+[^:\n]{0,60}:)\s*/i,
    '',
  );
  s = s.replace(/^(rewritten|corrected|revised|summary|shortened|expanded)( text)?:\s*/i, '');
  const quoted = /^(["“'])([\s\S]*)(["”'])$/.exec(s);
  if (quoted && !/^["“']/.test(original.trim())) s = quoted[2]!.trim();
  return s.trim();
}
