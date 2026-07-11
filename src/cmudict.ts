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
function parseLine(map: Map<string, string[]>, line: string): void {
  if (!line || line.startsWith(';;;')) return;
  const sep = line.indexOf('  ');
  if (sep <= 0) return;
  let word = line.slice(0, sep);
  // "(2)"-style alternates share the base word's entry.
  if (line.charCodeAt(sep - 1) === 41 /* ')' */) {
    const paren = word.lastIndexOf('(');
    if (paren <= 0) return;
    word = word.slice(0, paren);
    const existing = map.get(word);
    if (existing) existing.push(line.slice(sep + 2).trim());
    return;
  }
  map.set(word, [line.slice(sep + 2).trim()]);
}

export function parseCmuDict(text: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of text.split('\n')) parseLine(map, line);
  return map;
}

// Parse in slices, yielding to the event loop between them, so the
// ~134k-line file never blocks the main thread in one long task.
async function parseCmuDictChunked(text: string): Promise<Map<string, string[]>> {
  const lines = text.split('\n');
  const map = new Map<string, string[]>();
  const CHUNK = 20000;
  for (let start = 0; start < lines.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, lines.length);
    for (let i = start; i < end; i++) parseLine(map, lines[i]);
    if (end < lines.length) await new Promise(resolve => setTimeout(resolve, 0));
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
  return dict.get(key) ?? dict.get(key.replace(/'/g, '')) ?? null;
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
