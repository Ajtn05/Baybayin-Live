// ============================================================
// cmudict.ts — loader for the CMU Pronouncing Dictionary v0.7a
// (the same file cainesap/syllabify uses, served from /public).
//
// The dictionary is fetched once, parsed into a Map, and then
// looked up synchronously. All pronunciations are kept: the first
// is the default (matching the reference's "first version only"),
// and "(2)"-style alternates power the per-word reading switch.
// ============================================================

export type CmuDictStatus = 'idle' | 'loading' | 'ready' | 'error';

let dict: Map<string, string[]> | null = null;
let status: CmuDictStatus = 'idle';
let pending: Promise<void> | null = null;

export function cmuDictStatus(): CmuDictStatus {
  return status;
}

export function cmuDictSize(): number {
  return dict?.size ?? 0;
}

// Dictionary keys are already uppercase in cmudict.0.7a, so no
// per-line case conversion is needed.
//
// Lines are read as [start, end) spans of the source text rather than as
// split strings: the file is ~134k lines, and materializing them all costs a
// 134k-element array plus a string per line that is thrown away immediately.
// Only the word and its pronunciation — the parts actually kept — allocate.
function parseSpan(map: Map<string, string[]>, text: string, start: number, end: number): void {
  // Tolerate CRLF line endings.
  if (end > start && text.charCodeAt(end - 1) === 13 /* '\r' */) end--;
  if (end <= start) return;
  // The ";;;" header comments only. A lone leading ';' is a real key —
  // cmudict spells out the punctuation marks (";SEMI-COLON").
  if (text.charCodeAt(start) === 59 /* ';' */ && text.startsWith(';;;', start)) return;

  const sep = text.indexOf('  ', start);
  if (sep <= start || sep >= end) return;

  // "(2)"-style alternates share the base word's entry.
  if (text.charCodeAt(sep - 1) === 41 /* ')' */) {
    const paren = text.lastIndexOf('(', sep - 1);
    if (paren <= start) return;
    const existing = map.get(text.slice(start, paren));
    if (existing) existing.push(text.slice(sep + 2, end).trim());
    return;
  }
  map.set(text.slice(start, sep), [text.slice(sep + 2, end).trim()]);
}

export function parseCmuDict(text: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < text.length; ) {
    let nl = text.indexOf('\n', i);
    if (nl === -1) nl = text.length;
    parseSpan(map, text, i, nl);
    i = nl + 1;
  }
  return map;
}

// Parse in time slices, yielding to the event loop between them, so the file
// never blocks the main thread in one long task. Slicing on elapsed time
// rather than a line count keeps each pause inside a frame's budget whatever
// the device's speed, and yields as few times as that allows.
async function parseCmuDictChunked(text: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const SLICE_MS = 8;
  let deadline = performance.now() + SLICE_MS;
  let sinceCheck = 0;

  for (let i = 0; i < text.length; ) {
    let nl = text.indexOf('\n', i);
    if (nl === -1) nl = text.length;
    parseSpan(map, text, i, nl);
    i = nl + 1;
    // Reading the clock per line would cost more than the parsing does.
    if ((++sinceCheck & 4095) === 0 && performance.now() >= deadline) {
      await new Promise(resolve => setTimeout(resolve, 0));
      deadline = performance.now() + SLICE_MS;
    }
  }
  return map;
}

export async function loadCmuDict(url = '/cmudict-0.7a.txt'): Promise<void> {
  if (status === 'ready') return;
  if (pending) return pending;
  status = 'loading';
  pending = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      dict = await parseCmuDictChunked(await response.text());
      status = 'ready';
    } catch (error) {
      status = 'error';
      pending = null;
      throw error;
    }
  })();
  return pending;
}

function entryFor(word: string): string[] | null {
  if (!dict) return null;
  const key = word.toUpperCase();
  const entry = dict.get(key);
  if (entry) return entry;
  // Only pay for the apostrophe-stripped retry when there is one to strip.
  return key.includes("'") ? dict.get(key.replace(/'/g, '')) ?? null : null;
}

/**
 * Look up a word's default (first) CMU pronunciation as an array of
 * ARPAbet phonemes with stress digits. Returns null when the dictionary
 * is not loaded or has no entry.
 */
export function cmuLookup(word: string): string[] | null {
  const entry = entryFor(word);
  return entry ? entry[0].split(/\s+/).filter(Boolean) : null;
}

/**
 * All pronunciations for a word (first = default, rest = the CMU
 * "(2)"-style alternates), each as an array of ARPAbet phonemes.
 */
export function cmuLookupAll(word: string): string[][] {
  const entry = entryFor(word);
  return entry ? entry.map(p => p.split(/\s+/).filter(Boolean)) : [];
}

/** Test hook: install a pre-parsed dictionary (used by the parity harness). */
export function installCmuDict(map: Map<string, string[]>): void {
  dict = map;
  status = 'ready';
}
