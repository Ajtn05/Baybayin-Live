// ============================================================
// baybayinPhonetic.ts  –  Rule-based English → ARPAbet → ONC
// Rewrite: corrected G2P, vowel reductions, diphthong handling,
// consonant-cluster onsets, and Onset-Maximalism syllabifier.
// Mirrors Andrew Caines / Anthony Evans syllabify logic.
// ============================================================

import { Consideration, SyllableToken } from './types';
import { cmuLookupAll } from './cmudict';
import { syllabifyCmuPhonemes } from './cmuSyllabifier';
import { syllabifyWord } from './baybayinEngine';

export interface PhoneticSyllable {
  onset: string;
  nucleus: string;
  coda: string;
}

export interface PhoneticWord {
  original: string;
  syllables: PhoneticSyllable[];
}

export interface EnglishSyllableTrace extends PhoneticSyllable {
  latin: string;
  stress?: string; // '0' | '1' | '2' from CMU stress digits
}

export type PronunciationSource = 'cmu' | 'dictionary' | 'rules' | 'spelled';

/** Per-word reading choice: a CMU pronunciation by index, or as-spelled. */
export interface WordReading {
  asSpelled?: boolean;
  pronunciationIndex?: number;
  /** Manual per-syllable vowel choices (syllable index → ARPAbet vowel). */
  nucleusOverrides?: Record<number, string>;
}

/**
 * The vowel qualities a user can assign to a syllable, grouped the way
 * the syllabifier's own phoneme classification groups them: short
 * monophthongs vs long vowels/diphthongs. Only choices with distinct
 * Baybayin renderings are offered.
 */
export const NUCLEUS_CHOICES: { value: string; latin: string; kind: 'short' | 'long'; hint: string }[] = [
  { value: 'AH', latin: 'a', kind: 'short', hint: 'as in "sun" / Filipino "araw"' },
  { value: 'EH', latin: 'e', kind: 'short', hint: 'as in "bet"' },
  { value: 'IH', latin: 'i', kind: 'short', hint: 'as in "bit"' },
  { value: 'AO', latin: 'o', kind: 'short', hint: 'as in "law"' },
  { value: 'UH', latin: 'u', kind: 'short', hint: 'as in "book"' },
  { value: 'EY', latin: 'ey', kind: 'long', hint: 'long a, as in "day"' },
  { value: 'AY', latin: 'ay', kind: 'long', hint: 'long i, as in "my"' },
  { value: 'OW', latin: 'o(w)', kind: 'long', hint: 'long o, as in "go"' },
  { value: 'AW', latin: 'aw', kind: 'long', hint: 'as in "now"' },
  { value: 'OY', latin: 'oy', kind: 'long', hint: 'as in "boy"' },
];

export interface EnglishWordAnalysis {
  original: string;
  normalized: string;
  arpabet: string;
  latin: string;
  source: PronunciationSource;
  syllables: EnglishSyllableTrace[];
  considerations: Consideration[];
  /** How many CMU pronunciations exist for this word (0 = none). */
  alternates: number;
}

// ─── Phoneme sets ────────────────────────────────────────────

export const VOWELS = new Set([
  'AO', 'UW', 'EH', 'AH', 'AA', 'IY', 'IH', 'UH',
  'AE', 'AW', 'AY', 'ER', 'EY', 'OW', 'OY',
]);

export const CONSONANTS = new Set([
  'CH', 'DH', 'HH', 'JH', 'NG', 'SH', 'TH', 'ZH',
  'Z', 'S', 'P', 'R', 'K', 'L', 'M', 'N',
  'F', 'G', 'D', 'B', 'T', 'V', 'W', 'Y',
]);

// ─── Baybayin rendering maps ──────────────────────────────────

export const ONSET_MAP: Record<string, string> = {
  B: 'b', CH: 'ts', D: 'd', DH: 'd', F: 'p', G: 'g',
  HH: 'h', JH: 'dy', K: 'k', L: 'l', M: 'm', N: 'n',
  NG: 'ng', P: 'p', R: 'r', S: 's', SH: 'sy', T: 't',
  TH: 't', V: 'b', W: 'w', Y: 'y', Z: 's', ZH: 'dy',
};

export const NUCLEUS_MAP: Record<string, { vowel: string; appendCoda?: string }> = {
  AA: { vowel: 'a' }, AE: { vowel: 'a' }, AH: { vowel: 'a' },
  AO: { vowel: 'o' }, AW: { vowel: 'a', appendCoda: 'w' },
  AY: { vowel: 'a', appendCoda: 'y' }, EH: { vowel: 'e' },
  ER: { vowel: 'e', appendCoda: 'r' }, EY: { vowel: 'e', appendCoda: 'y' },
  IH: { vowel: 'i' }, IY: { vowel: 'i' }, OW: { vowel: 'o' },
  OY: { vowel: 'o', appendCoda: 'y' }, UH: { vowel: 'u' }, UW: { vowel: 'u' },
};

// Codas differ from onsets for the palatal fricatives: "sy"/"dy" only
// read correctly before a vowel, so syllable-finally /ʃ/ and /ʒ/ fall
// back to plain "s" ("english" → ingglis, the way Filipino writes
// "fishball" as pisbol).
export const CODA_MAP: Record<string, string> = { ...ONSET_MAP, SH: 's', ZH: 's' };

// ─── Human-readable justifications for lossy mappings ─────────
// Only phonemes whose Baybayin rendering is NOT a 1:1 match get an
// entry here; these surface on the Details page so users can see
// what compromise was made and why.

export const CONSONANT_MAP_NOTES: Record<string, string> = {
  F:  'Baybayin has no /f/ sound — substituted "p", the closest native stop (as in "Pilipinas"; the abakada practice the KWF Manwal documents in §4.2, "pórma" for forma).',
  V:  'Baybayin has no /v/ sound — substituted "b" (as in "bentilador" for ventilador; abakada practice per KWF Manwal §4.2).',
  Z:  'Baybayin has no /z/ sound — substituted "s" (as in "sóna" for zona; KWF Manwal §4.3).',
  TH: 'The English "th" /θ/ has no Baybayin equivalent — substituted "t" (KWF Manwal §6.5: "maraton" for marathon).',
  DH: 'The voiced "th" /ð/ has no Baybayin equivalent — substituted "d".',
  SH: '/ʃ/ ("sh") is rendered as the "sy" cluster, following Filipino loanword practice ("shampoo" → "siyampu"; KWF Manwal §6.3, "syuting").',
  ZH: '/ʒ/ has no Baybayin equivalent — rendered as "dy", the nearest Filipino cluster.',
  JH: '/dʒ/ ("j") is rendered as "dy", following Filipino loanword practice ("jeep" → "dyip"; KWF Manwal §4.13, "dyípni", "dyáket").',
  CH: '/tʃ/ ("ch") is rendered as "ts", following Filipino loanword practice ("chocolate" → "tsokolate"; KWF Manwal §6.3).',
};

// Coda-position overrides: consulted before CONSONANT_MAP_NOTES for
// syllable-final consonants.
export const CODA_MAP_NOTES: Record<string, string> = {
  SH: '/ʃ/ ("sh") at the end of a syllable is written plain "s" — the "sy" spelling only works before a vowel (Filipino writes "fishball" as "pisbol", and the KWF Manwal §6.3 notes final sh drops to s: "ambus" for ambush).',
  ZH: '/ʒ/ at the end of a syllable is written plain "s" — its "dy" rendering only works before a vowel.',
};

export const NUCLEUS_MAP_NOTES: Record<string, string> = {
  AE: '/æ/ (as in "cat") collapses to "a" — Baybayin uses a three-vowel system (a, i/e, u/o).',
  AH: 'The vowel /ʌ~ə/ (as in "cup" or unstressed syllables) collapses to "a" when the spelling gives no better cue.',
  AA: '/ɑ/ (as in "father") maps to "a" when the spelling gives no better cue.',
  AO: '/ɔ/ (as in "law") maps to "o", written with the u/o kudlit below.',
  EH: '/ɛ/ (as in "bet") maps to "e" — Baybayin writes i and e with the same kudlit above.',
  IH: '/ɪ/ (as in "bit") maps to "i".',
  UH: '/ʊ/ (as in "book") maps to "u" — Baybayin writes u and o with the same kudlit below.',
  AY: 'The diphthong /aɪ/ (as in "my") is decomposed into "a" plus a "y" glide coda.',
  AW: 'The diphthong /aʊ/ (as in "now") is decomposed into "a" plus a "w" glide coda.',
  EY: 'The diphthong /eɪ/ (as in "day") is decomposed into "e" plus a "y" glide coda.',
  OY: 'The diphthong /ɔɪ/ (as in "boy") is decomposed into "o" plus a "y" glide coda.',
  ER: 'The r-colored vowel /ɝ/ (as in "her") is decomposed into "e" plus an "r" coda.',
};

// ─── High-priority hand-crafted dictionary ────────────────────

export const OFFLINE_DICTIONARY: Record<string, PhoneticSyllable[]> = {
  janelle: [
    { onset: 'ZH', nucleus: 'AH', coda: '' },
    { onset: 'N',  nucleus: 'EH', coda: 'L' },
  ],
  linguistics: [
    { onset: 'L',   nucleus: 'IH', coda: 'NG'  },
    { onset: 'G W', nucleus: 'IH', coda: ''     },
    { onset: 'S T', nucleus: 'IH', coda: 'K S'  },
  ],
  chemistry: [
    { onset: 'K',   nucleus: 'EH', coda: 'M' },
    { onset: 'S T', nucleus: 'IH', coda: ''  },
    { onset: 'R',   nucleus: 'IY', coda: ''  },
  ],
  christian: [
    { onset: 'K R',  nucleus: 'IH', coda: 'S' },
    { onset: 'T CH', nucleus: 'AH', coda: 'N' },
  ],
  christina: [
    { onset: 'K R', nucleus: 'IH', coda: 'S' },
    { onset: 'T',   nucleus: 'IY', coda: ''  },
    { onset: 'N',   nucleus: 'AH', coda: ''  },
  ],
  michael: [
    { onset: 'M', nucleus: 'AY', coda: ''  },
    { onset: 'K', nucleus: 'AH', coda: 'L' },
  ],
  john:    [{ onset: 'JH', nucleus: 'AA', coda: 'N' }],
  joseph: [
    { onset: 'JH', nucleus: 'OW', coda: ''  },
    { onset: 'S',  nucleus: 'AH', coda: 'F' },
  ],
  william: [
    { onset: 'W', nucleus: 'IH', coda: 'L' },
    { onset: 'Y', nucleus: 'AH', coda: 'M' },
  ],
  mary: [
    { onset: 'M', nucleus: 'EH', coda: '' },
    { onset: 'R', nucleus: 'IY', coda: '' },
  ],
  charles: [{ onset: 'CH', nucleus: 'AA', coda: 'R L Z' }],
  david: [
    { onset: 'D', nucleus: 'EY', coda: ''  },
    { onset: 'V', nucleus: 'IH', coda: 'D' },
  ],
  james:   [{ onset: 'JH', nucleus: 'EY', coda: 'M Z' }],
  sarah: [
    { onset: 'S', nucleus: 'EH', coda: '' },
    { onset: 'R', nucleus: 'AH', coda: '' },
  ],
  elizabeth: [
    { onset: '',  nucleus: 'IH', coda: 'L' },
    { onset: 'Z', nucleus: 'AH', coda: ''  },
    { onset: 'B', nucleus: 'AH', coda: 'TH'},
  ],
  philippines: [
    { onset: 'F', nucleus: 'IH', coda: 'L' },
    { onset: 'P', nucleus: 'IY', coda: ''  },
    { onset: 'N', nucleus: 'IH', coda: 'Z' },
  ],
  manila: [
    { onset: 'M', nucleus: 'AH', coda: '' },
    { onset: 'N', nucleus: 'IH', coda: '' },
    { onset: 'L', nucleus: 'AH', coda: '' },
  ],
  mabuhay: [
    { onset: 'M',  nucleus: 'AH', coda: '' },
    { onset: 'B',  nucleus: 'UW', coda: '' },
    { onset: 'HH', nucleus: 'AY', coda: '' },
  ],
  salamat: [
    { onset: 'S', nucleus: 'AH', coda: ''  },
    { onset: 'L', nucleus: 'AH', coda: ''  },
    { onset: 'M', nucleus: 'AH', coda: 'T' },
  ],
  computer: [
    { onset: 'K', nucleus: 'AH', coda: 'M' },
    { onset: 'P Y', nucleus: 'UW', coda: '' },
    { onset: 'T', nucleus: 'ER', coda: '' },
  ],
  science: [
    { onset: 'S', nucleus: 'AY', coda: '' },
    { onset: '', nucleus: 'AH', coda: 'N S' },
  ],
  english: [
    { onset: '', nucleus: 'IH', coda: 'NG' },
    { onset: 'G L', nucleus: 'IH', coda: 'SH' },
  ],
  translator: [
    { onset: 'T R', nucleus: 'AE', coda: 'N S' },
    { onset: 'L', nucleus: 'EY', coda: '' },
    { onset: 'T', nucleus: 'ER', coda: '' },
  ],
  deterministic: [
    { onset: 'D', nucleus: 'IH', coda: '' },
    { onset: 'T', nucleus: 'ER', coda: '' },
    { onset: 'M', nucleus: 'AH', coda: '' },
    { onset: 'N', nucleus: 'IH', coda: 'S' },
    { onset: 'T', nucleus: 'IH', coda: 'K' },
  ],
  phonetic: [
    { onset: 'F', nucleus: 'AH', coda: '' },
    { onset: 'N', nucleus: 'EH', coda: '' },
    { onset: 'T', nucleus: 'IH', coda: 'K' },
  ],
  syllable: [
    { onset: 'S', nucleus: 'IH', coda: '' },
    { onset: 'L', nucleus: 'AH', coda: '' },
    { onset: 'B', nucleus: 'AH', coda: 'L' },
  ],
  converter: [
    { onset: 'K', nucleus: 'AH', coda: 'N' },
    { onset: 'V', nucleus: 'ER', coda: '' },
    { onset: 'T', nucleus: 'ER', coda: '' },
  ],
  filipino: [
    { onset: 'F', nucleus: 'IH', coda: '' },
    { onset: 'L', nucleus: 'AH', coda: '' },
    { onset: 'P', nucleus: 'IY', coda: '' },
    { onset: 'N', nucleus: 'OW', coda: '' },
  ],
  baybayin: [
    { onset: 'B', nucleus: 'EY', coda: '' },
    { onset: 'B', nucleus: 'AY', coda: '' },
    { onset: 'Y', nucleus: 'IH', coda: 'N' },
  ],
};

// ─── G2P helper ──────────────────────────────────────────────

/**
 * Tag a literal token into the bracket stream.
 * e.g. tag('K','AH','M') → '[K][AH][M]'
 */
const tag = (...phonemes: string[]) => phonemes.map(p => `[${p}]`).join('');

// ─── englishToArpabet ────────────────────────────────────────

/**
 * Rule-based Grapheme-to-Phoneme (G2P) converter.
 *
 * Strategy:
 *  1. Normalise / collapse double letters.
 *  2. Apply prefix reductions BEFORE any other substitution so the
 *     prefix vowel is already bracketed and never touched by later rules.
 *  3. Apply suffix contractions.
 *  4. Apply digraph / diphthong / VCe rules, each as a bracketed replacement,
 *     working longest-match first to avoid partial overwrites.
 *  5. Convert residual single letters.
 *  6. Extract bracketed tokens, deduplicate adjacent identical phonemes,
 *     then strip a word-final silent-E phoneme.
 *
 * All replacements bracket their output as [PHONEME] so order of
 * application cannot corrupt an already-resolved token.
 */
export function englishToArpabet(word: string): string {
  let w = word.toLowerCase().trim();

  // ── Step 0: collapse true double letters (consonants only) ──
  // We keep vowel digraphs (ee, oo, …) – those are handled below.
  w = w.replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, '$1');

  // ── Step 1: Prefix reductions ────────────────────────────────
  // Applied before anything else so their vowel tokens are never
  // revisited by the generic vowel rules.
  // Each prefix must be followed by a consonant to avoid false hits.

  const CONS_AHEAD = /^[bcdfghjklmnpqrstvwxyz]/;

  if (w.startsWith('com') && CONS_AHEAD.test(w.slice(3))) {
    w = tag('K', 'AH', 'M') + w.slice(3);
  } else if (w.startsWith('con') && CONS_AHEAD.test(w.slice(3))) {
    w = tag('K', 'AH', 'N') + w.slice(3);
  } else if (w.startsWith('pro') && CONS_AHEAD.test(w.slice(3))) {
    w = tag('P', 'R', 'OW') + w.slice(3);
  } else if (w.startsWith('pre') && CONS_AHEAD.test(w.slice(3))) {
    w = tag('P', 'R', 'IH') + w.slice(3);
  } else if (w.startsWith('de') && CONS_AHEAD.test(w.slice(2))) {
    w = tag('D', 'IH') + w.slice(2);
  } else if (w.startsWith('re') && CONS_AHEAD.test(w.slice(2))) {
    w = tag('R', 'IY') + w.slice(2);
  } else if (w.startsWith('un') && CONS_AHEAD.test(w.slice(2))) {
    w = tag('AH', 'N') + w.slice(2);
  } else if (w.startsWith('ex') && CONS_AHEAD.test(w.slice(2))) {
    w = tag('IH', 'K', 'S') + w.slice(2);
  } else if (w.startsWith('in') && CONS_AHEAD.test(w.slice(2))) {
    w = tag('IH', 'N') + w.slice(2);
  }

  // ── Step 2: Common suffix contractions ───────────────────────
  // Must come before generic vowel rules.
  w = w.replace(/tion\b/g,   tag('SH', 'AH', 'N'));
  w = w.replace(/sion\b/g,   tag('ZH', 'AH', 'N'));
  w = w.replace(/cious\b/g,  tag('SH', 'AH', 'S'));
  w = w.replace(/tious\b/g,  tag('SH', 'AH', 'S'));
  w = w.replace(/ture\b/g,   tag('CH', 'ER'));
  w = w.replace(/ous\b/g,    tag('AH', 'S'));
  w = w.replace(/ness\b/g,   tag('N', 'AH', 'S'));
  w = w.replace(/less\b/g,   tag('L', 'AH', 'S'));
  w = w.replace(/ment\b/g,   tag('M', 'AH', 'N', 'T'));
  w = w.replace(/ful\b/g,    tag('F', 'AH', 'L'));
  w = w.replace(/ing\b/g,    tag('IH', 'NG'));
  w = w.replace(/ings\b/g,   tag('IH', 'NG', 'Z'));
  w = w.replace(/tion/g,     tag('SH', 'AH', 'N'));  // mid-word too
  w = w.replace(/al\b/g,     tag('AH', 'L'));
  w = w.replace(/ive\b/g,    tag('IH', 'V'));
  w = w.replace(/ance\b/g,   tag('AH', 'N', 'S'));
  w = w.replace(/ence\b/g,   tag('AH', 'N', 'S'));
  w = w.replace(/able\b/g,   tag('EY', 'B', 'AH', 'L'));
  w = w.replace(/ible\b/g,   tag('IH', 'B', 'AH', 'L'));
  w = w.replace(/ify\b/g,    tag('IH', 'F', 'AY'));
  w = w.replace(/ology\b/g,  tag('AO', 'L', 'AH', 'JH', 'IY'));
  w = w.replace(/ically\b/g, tag('IH', 'K', 'L', 'IY'));
  w = w.replace(/ically/g,   tag('IH', 'K', 'L', 'IY'));
  w = w.replace(/ic\b/g,     tag('IH', 'K'));
  w = w.replace(/ism\b/g,    tag('IH', 'Z', 'AH', 'M'));
  w = w.replace(/ist\b/g,    tag('IH', 'S', 'T'));
  w = w.replace(/ity\b/g,    tag('IH', 'T', 'IY'));
  w = w.replace(/ary\b/g,    tag('EH', 'R', 'IY'));
  w = w.replace(/ery\b/g,    tag('ER', 'IY'));
  w = w.replace(/ory\b/g,    tag('AO', 'R', 'IY'));
  w = w.replace(/ure\b/g,    tag('ER'));
  w = w.replace(/age\b/g,    tag('AH', 'JH'));
  w = w.replace(/ive/g,      tag('IH', 'V'));

  // Helper: apply a regex only to as-yet un-bracketed characters
  const applyToUntagged = (source: string, re: RegExp, repl: string | ((m: string, ...a: string[]) => string)): string => {
    // Split on already-bracketed segments, apply only to gap regions
    return source.replace(/(\[[^\]]+\])|([^\[]+)/g, (_, tagged, plain) => {
      if (tagged) return tagged;
      if (plain)  return (plain as string).replace(re, repl as string);
      return '';
    });
  };

  // ── Step 3: Consonant digraphs (longest first) ───────────────
  // These must run before single-letter fallback rules.
  w = applyToUntagged(w, /tch/g, tag('CH'));
  w = applyToUntagged(w, /dge/g, tag('JH'));
  w = applyToUntagged(w, /sch/g, tag('S', 'K'));  // school, scheme, schedule
  w = applyToUntagged(w, /qu/g,  tag('K', 'W'));
  w = applyToUntagged(w, /xc/g,  tag('K', 'S'));
  w = applyToUntagged(w, /ck/g,  tag('K'));
  w = applyToUntagged(w, /wh/g,  tag('W'));
  w = applyToUntagged(w, /ph/g,  tag('F'));
  w = applyToUntagged(w, /gh/g,  '');        // silent (enough, night)
  w = applyToUntagged(w, /ng/g,  tag('NG'));
  w = applyToUntagged(w, /ch/g,  tag('CH'));
  w = applyToUntagged(w, /sh/g,  tag('SH'));
  w = applyToUntagged(w, /th/g,  tag('TH'));
  w = applyToUntagged(w, /dg/g,  tag('JH'));
  w = applyToUntagged(w, /x/g,   tag('K', 'S'));

  // ── Step 4: Vocalic R combos ─────────────────────────────────
  w = applyToUntagged(w, /ar\b/g,  tag('AA', 'R'));
  w = applyToUntagged(w, /er\b/g,  tag('ER'));
  w = applyToUntagged(w, /ir\b/g,  tag('ER'));
  w = applyToUntagged(w, /or\b/g,  tag('AO', 'R'));
  w = applyToUntagged(w, /ur\b/g,  tag('ER'));
  w = applyToUntagged(w, /are\b/g, tag('EH', 'R'));
  w = applyToUntagged(w, /er/g,    tag('ER'));
  w = applyToUntagged(w, /ir/g,    tag('ER'));
  w = applyToUntagged(w, /ur/g,    tag('ER'));

  // ── Step 5: Vowel digraphs & diphthongs ──────────────────────
  w = applyToUntagged(w, /ee/g,  tag('IY'));
  w = applyToUntagged(w, /ea/g,  tag('IY'));    // beat, mean (most common)
  w = applyToUntagged(w, /oo/g,  tag('UW'));
  w = applyToUntagged(w, /oa/g,  tag('OW'));
  w = applyToUntagged(w, /ai/g,  tag('EY'));
  w = applyToUntagged(w, /ay/g,  tag('EY'));
  w = applyToUntagged(w, /oy/g,  tag('OY'));
  w = applyToUntagged(w, /oi/g,  tag('OY'));
  w = applyToUntagged(w, /aw/g,  tag('AO'));
  w = applyToUntagged(w, /au/g,  tag('AO'));
  w = applyToUntagged(w, /ow/g,  tag('OW'));
  w = applyToUntagged(w, /ou/g,  tag('AW'));
  w = applyToUntagged(w, /ew/g,  tag('UW'));
  w = applyToUntagged(w, /ui/g,  tag('UW'));
  w = applyToUntagged(w, /ie\b/g, tag('IY'));

  // ── Step 6: Silent-E / Long Vowel VCe at word boundary ───────
  // Must run BEFORE single-vowel rules; the trailing -e is consumed.
  w = applyToUntagged(w, /a([bcdfghjklmnprstvwz])e\b/g,
    (_, c) => tag('EY') + tag(c.toUpperCase()));
  w = applyToUntagged(w, /i([bcdfghjklmnprstvwz])e\b/g,
    (_, c) => tag('AY') + tag(c.toUpperCase()));
  w = applyToUntagged(w, /o([bcdfghjklmnprstvwz])e\b/g,
    (_, c) => tag('OW') + tag(c.toUpperCase()));
  w = applyToUntagged(w, /u([bcdfghjklmnprstvwz])e\b/g,
    (_, c) => tag('UW') + tag(c.toUpperCase()));
  w = applyToUntagged(w, /e([bcdfghjklmnprstvwz])e\b/g,
    (_, c) => tag('IY') + tag(c.toUpperCase()));

  // Final -e alone (silent) → mark as silent so we can drop it later
  w = applyToUntagged(w, /e\b/g, tag('__SILENT_E__'));

  // ── Step 7: Special consonant spellings ──────────────────────
  w = applyToUntagged(w, /c(?=[eiy])/g, tag('S'));  // cent, city
  w = applyToUntagged(w, /c/g,          tag('K'));  // cat, cola
  w = applyToUntagged(w, /j/g,          tag('JH')); // Standard English /dʒ/
  w = applyToUntagged(w, /v/g,          tag('V'));
  w = applyToUntagged(w, /z/g,          tag('Z'));
  w = applyToUntagged(w, /q/g,          tag('K'));

  // ── Step 8: Y – context-dependent ────────────────────────────
  // Word-initial or after consonant before vowel → consonant [Y]
  // Otherwise (end of word / syllable-final) → vowel [IY]
  w = applyToUntagged(w, /\by(?=[aeiou])/g, tag('Y'));
  w = applyToUntagged(w, /(?<=[bcdfghjklmnpqrstvwxz])y(?=[aeiou])/g, tag('Y'));
  w = applyToUntagged(w, /y\b/g, tag('IY'));        // "happy", "fly"
  w = applyToUntagged(w, /y/g,   tag('IY'));        // residual

  // ── Step 9: Single-letter vowels ─────────────────────────────
  // These run after all digraphs have been bracketed.
  w = applyToUntagged(w, /a/g, tag('AE'));
  w = applyToUntagged(w, /e/g, tag('EH'));
  w = applyToUntagged(w, /i/g, tag('IH'));
  w = applyToUntagged(w, /o/g, tag('AO'));
  w = applyToUntagged(w, /u/g, tag('AH'));

  // ── Step 10: Single-letter consonants ────────────────────────
  const SINGLE_CONS = 'bdfghklmnprst w'.replace(' ', '');  // w handled below
  for (const c of SINGLE_CONS) {
    const uc = c.toUpperCase();
    w = applyToUntagged(w, new RegExp(c, 'g'), tag(uc));
  }
  w = applyToUntagged(w, /w/g, tag('W'));

  // ── Step 11: Extract and clean tokens ────────────────────────
  const parsed = w.match(/\[[A-Z_]+\]/g) || [];
  const rawPhonemes = parsed
    .map(p => p.slice(1, -1).trim())
    .filter(p => p && p !== '__SILENT_E__');

  // Deduplicate only truly adjacent identical phonemes
  const phonemes: string[] = [];
  for (let i = 0; i < rawPhonemes.length; i++) {
    if (i === 0 || rawPhonemes[i] !== rawPhonemes[i - 1]) {
      phonemes.push(rawPhonemes[i]);
    }
  }

  // Drop trailing EH (residual silent-E that slipped through)
  while (
    phonemes.length > 1 &&
    phonemes[phonemes.length - 1] === 'EH' &&
    CONSONANTS.has(phonemes[phonemes.length - 2])
  ) {
    phonemes.pop();
  }

  return phonemes.join(' ');
}

// ─── Cluster helpers ─────────────────────────────────────────

interface Cluster {
  type: 'consonant' | 'vowel';
  phonemes: string[];
}

/**
 * Group a flat phoneme list into alternating consonant/vowel clusters.
 * NG is never merged with surrounding consonants (it cannot appear in onset).
 */
function groupIntoClusters(phonemes: string[]): Cluster[] {
  const clusters: Cluster[] = [];

  const push = (type: 'consonant' | 'vowel', ph: string) => {
    const last = clusters[clusters.length - 1];
    // NG always stays solo in a consonant cluster
    if (type === 'consonant' && ph === 'NG') {
      clusters.push({ type: 'consonant', phonemes: ['NG'] });
      return;
    }
    if (last && last.type === type) {
      // Don't merge across NG boundary
      if (last.phonemes.includes('NG')) {
        clusters.push({ type, phonemes: [ph] });
      } else {
        last.phonemes.push(ph);
      }
    } else {
      clusters.push({ type, phonemes: [ph] });
    }
  };

  for (const ph of phonemes) {
    if (VOWELS.has(ph)) {
      push('vowel', ph);
    } else if (CONSONANTS.has(ph)) {
      push('consonant', ph);
    }
    // unknown phonemes are silently dropped
  }

  return clusters;
}

// ─── Onset Maximalism (Caines/Evans rules) ───────────────────

/**
 * Given a consonant cluster that sits BETWEEN two vowels, split it into
 * (coda-of-current-syllable, onset-of-next-syllable) using Onset Maximalism:
 * assign as many consonants as possible to the onset, subject to English
 * phonotactic constraints.
 */
function splitCluster(consonants: string[], why?: string[]): { coda: string[]; onset: string[] } {
  // Work with a mutable copy; we will shift items from onset into coda.
  let onset = [...consonants];
  const coda: string[] = [];

  const shiftToCoda = () => {
    if (onset.length) coda.push(onset.shift()!);
  };

  // ── Rule 1: NG can NEVER appear in onset ────────────────────
  const ngIdx = onset.indexOf('NG');
  if (ngIdx !== -1) {
    // Everything up-to-and-including NG goes to coda
    coda.push(...onset.splice(0, ngIdx + 1));
    why?.push('/NG/ can never begin an English syllable, so it (and anything before it) stays as coda');
  }

  // ── Rule 2: Affricates CH / JH may not start a complex onset ─
  // (They're fine as singleton onsets, but cannot follow another consonant.)
  ['CH', 'JH'].forEach(aff => {
    const idx = onset.indexOf(aff);
    if (idx > 0) {
      // Everything before the affricate goes to coda
      coda.push(...onset.splice(0, idx));
      why?.push(`the affricate /${aff}/ cannot follow another consonant in an onset`);
    }
  });

  // ── Rule 3: Maximum two-consonant onset ─────────────────────
  // (English allows at most C C V, e.g. /str/ which is handled below.)
  // Trim any excess from the left.
  if (onset.length > 3) {
    why?.push('English onsets allow at most three consonants — extras shifted to the coda');
    while (onset.length > 3) shiftToCoda();
  }

  // ── Rule 4: Three-consonant onset only if first is /S/ ──────
  if (onset.length === 3 && onset[0] !== 'S') {
    shiftToCoda();
    why?.push('a three-consonant onset must begin with /S/ (as in "street")');
  }

  // ── Rule 5: Two-consonant onset constraints ──────────────────
  if (onset.length === 2) {
    const [c1] = onset;

    // 5a. First must be an obstruent (or S / SH)
    const OBSTRUENTS = new Set(['P','B','T','D','K','G','F','V','S','Z','SH','ZH','TH','DH','CH','JH']);
    if (!OBSTRUENTS.has(c1)) {
      shiftToCoda();
      why?.push(`/${c1}/ cannot start a two-consonant English onset`);
    }

    // 5b. Second must be a liquid/glide (L R W Y) if first ≠ S
    // Special case: /PY/ is a valid English onset (computer, pure)
    const LIQUID_GLIDE = new Set(['L','R','W','Y']);
    if (onset.length === 2 && onset[0] !== 'S' && !LIQUID_GLIDE.has(onset[1])) {
      // Exceptional clusters that ARE valid onsets even without liquid/glide second
      const EXCEPTION_PAIRS = new Set(['PY','BY','MY','KY','GY','TY','DY','FY','VY','NY',
                                        'KW','GW','TW','DW','SW','SN','SM','SP','ST','SK','SF']);
      const [first, second] = onset;
      if (!EXCEPTION_PAIRS.has(first + second)) {
        shiftToCoda();
        why?.push(`/${first} ${second}/ is not a legal English onset pair`);
      }
    }

    // 5c. /SL/ is not a valid English onset; shift S to coda
    if (onset.length === 2 && onset[0] === 'S' && onset[1] === 'L') {
      shiftToCoda();
      why?.push('/S L/ is not treated as a valid onset here — /S/ shifted to coda');
    }
  }

  // ── Rule 6: Solo NG in onset position is illegal ─────────────
  if (onset.length === 1 && onset[0] === 'NG') {
    shiftToCoda();
    why?.push('/NG/ alone cannot begin a syllable');
  }

  return { coda, onset };
}

// ─── Syllable validator ──────────────────────────────────────

interface RawSyllable {
  onset: string[];
  nucleus: string[];
  coda: string[];
}

/**
 * If the last syllable has no nucleus, absorb its onset into the
 * previous syllable's coda.
 */
function fixOrphanSyllable(syllables: RawSyllable[], trace?: string[]): RawSyllable[] {
  if (!syllables.length) return syllables;
  const last = syllables[syllables.length - 1];
  if (last.nucleus.length === 0 && syllables.length > 1) {
    syllables.pop();
    syllables[syllables.length - 1].coda.push(...last.onset, ...last.coda);
    const absorbed = [...last.onset, ...last.coda].join(' ');
    trace?.push(`Word-final consonants [${absorbed}] had no vowel of their own — absorbed into the previous syllable's coda.`);
  }
  return syllables;
}

// ─── arpabetToStructuredPhoneticWord (main syllabifier) ──────

/**
 * Convert a flat ARPAbet phoneme string into structured ONC syllables.
 * Uses Onset Maximalism following Caines/Evans rules.
 */
export function arpabetToStructuredPhoneticWord(
  original: string,
  arpabetStr: string,
  trace?: string[],
): PhoneticWord {
  const phonemes = arpabetStr.split(/\s+/).filter(Boolean);

  if (phonemes.length === 0) {
    trace?.push('No phonemes could be derived — fell back to a single default "a" syllable.');
    return { original, syllables: [{ onset: '', nucleus: 'AH', coda: '' }] };
  }

  const clusters = groupIntoClusters(phonemes);

  // Build raw syllables
  const syllables: RawSyllable[] = [{ onset: [], nucleus: [], coda: [] }];

  for (const cluster of clusters) {
    const cur = syllables[syllables.length - 1];

    if (cluster.type === 'vowel') {
      if (cur.nucleus.length > 0) {
        // Already have a nucleus → start new syllable
        syllables.push({ onset: [], nucleus: [...cluster.phonemes], coda: [] });
      } else {
        cur.nucleus = [...cluster.phonemes];
      }
    } else {
      // Consonant cluster
      if (cur.nucleus.length === 0) {
        // Before any nucleus → all goes to onset of current syllable
        cur.onset.push(...cluster.phonemes);
      } else if (cur.coda.length === 0) {
        // After nucleus, no coda yet → apply onset-maximalism split
        const why: string[] = [];
        const { coda, onset } = splitCluster(cluster.phonemes, why);
        cur.coda.push(...coda);
        if (onset.length > 0) {
          syllables.push({ onset, nucleus: [], coda: [] });
        }
        if (cluster.phonemes.length > 1 || coda.length > 0) {
          const codaStr = coda.join(' ') || '∅';
          const onsetStr = onset.join(' ') || '∅';
          const reason = why.length > 0
            ? why.join('; ')
            : 'onset maximalism — the whole cluster is a legal English onset, so all of it starts the next syllable';
          trace?.push(`Between-vowel cluster [${cluster.phonemes.join(' ')}] split into coda [${codaStr}] + next onset [${onsetStr}]: ${reason}.`);
        }
      } else {
        // Already have a coda; everything is onset of next syllable
        syllables.push({ onset: [...cluster.phonemes], nucleus: [], coda: [] });
      }
    }
  }

  const validated = fixOrphanSyllable(syllables, trace);

  return {
    original,
    syllables: validated.map(s => ({
      onset:   s.onset.join(' '),
      nucleus: s.nucleus.join(' '),
      coda:    s.coda.join(' '),
    })),
  };
}

// ─── Public entry point ──────────────────────────────────────

/**
 * High-level function: English word → structured ONC syllables.
 * Checks the hand-crafted dictionary first, then falls back to
 * rule-based G2P + Onset-Maximalism syllabification.
 */
export function ruleSyllabifyEnglishWord(word: string): PhoneticSyllable[] {
  const clean = word.trim().toLowerCase();

  if (OFFLINE_DICTIONARY[clean]) {
    return OFFLINE_DICTIONARY[clean];
  }

  const arpabetStr = englishToArpabet(clean);
  const pw = arpabetToStructuredPhoneticWord(clean, arpabetStr);
  return pw.syllables;
}

// ─── Baybayin rendering helpers (unchanged interface) ────────

// ─── Spelling-aware vowel alignment ──────────────────────────
// Philippine English gives reduced vowels their full written value
// ("computer" → kompyuter, "psychology" → saykolodyi), so when the
// word's written vowels can be aligned 1:1 with its syllable nuclei,
// the spelling guides how reduced vowels are written. When alignment
// is ambiguous the mapping falls back to the purely phonetic rules.

/**
 * Align a word's written vowels with its `nucleusCount` syllable nuclei.
 * Returns one spelling unit per nucleus (a vowel letter or letter group),
 * or null when no confident alignment exists.
 */
export function alignNucleiToSpelling(word: string, nucleusCount: number): (string | null)[] | null {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters || nucleusCount === 0) return null;

  const isVowelAt = (i: number): boolean => {
    const ch = letters[i];
    if ('aeiou'.includes(ch)) return true;
    // y acts as a vowel except word-initially or before a vowel ("yellow", "beyond")
    const next = letters[i + 1];
    return ch === 'y' && i > 0 && !(next !== undefined && 'aeiou'.includes(next));
  };

  const groups: { text: string; end: number }[] = [];
  for (let i = 0; i < letters.length; i++) {
    if (!isVowelAt(i)) continue;
    const last = groups[groups.length - 1];
    if (last && last.end === i - 1) {
      last.text += letters[i];
      last.end = i;
    } else {
      groups.push({ text: letters[i], end: i });
    }
  }

  const unitsFrom = (gs: { text: string }[]): (string | null)[] | null => {
    if (gs.length === nucleusCount) return gs.map(g => g.text);
    // Contiguous letters may span two nuclei ("biology": i-o → AY, AA)
    const single = gs.flatMap(g => g.text.split(''));
    if (single.length === nucleusCount) return single;
    return null;
  };

  let units = unitsFrom(groups);
  if (!units && groups.length > 1) {
    // Silent final e ("exposed", "janelle"): drop a trailing e-group
    // followed only by consonants, then retry.
    const last = groups[groups.length - 1];
    if (last.text === 'e' && !/[aeiouy]/.test(letters.slice(last.end + 1))) {
      units = unitsFrom(groups.slice(0, -1));
    }
  }
  return units;
}

// A word-final stop after one of these sounds forms an "-ed"-style pile
// (zd, vd, bd, chd, …) that Baybayin cannot comfortably stack — an
// epenthetic "e" restores the syllable. Clusters Filipino respelling
// accepts (ks, st, nd, …) are deliberately NOT broken up.
const EPENTHESIS_TRIGGERS = new Set(['Z', 'ZH', 'V', 'DH', 'B', 'G', 'JH', 'CH']);
const EPENTHESIS_STOPS = new Set(['D', 'T']);

export function convertPhoneticSyllableToLatinSyllable(
  s: PhoneticSyllable & { stress?: string },
  mapNotes?: Set<string>,
  spellingHint?: string | null,
): string {
  // Stress digits (CMU '0'/'1'/'2') do not affect the Baybayin rendering.
  const stripStress = (p: string) => p.replace(/[0-9]/g, '');
  const onsetPhonemes = s.onset.trim().toUpperCase().split(/\s+/).filter(Boolean).map(stripStress);
  const mappedOnset = onsetPhonemes.map(p => ONSET_MAP[p] ?? p.toLowerCase()).join('');

  const nucleusPhoneme = stripStress(s.nucleus.trim().toUpperCase());
  const nucInfo = NUCLEUS_MAP[nucleusPhoneme] ?? { vowel: 'a' };
  let mappedNucleus = nucInfo.vowel;

  // Spelling-aware override for reduced/ambiguous vowels. The schwa and
  // /ʌ/ (AH) do not exist in Filipino, so the written vowel wins
  // ("kompyuter", "kolor"); /ɑ/ (AA) spelled "o" is said [o] in
  // Philippine English ("doktor", "saykolodyi"); unstressed IH spelled
  // "e" reads as "e" ("ekspows", "rowses").
  let spellingOverride: string | null = null;
  if (spellingHint) {
    // Multi-letter spellings: "au" reads [o] ("because" → bekos); other
    // groups take their final letter ("io" → o for "-syon", "ou" → u).
    const hintVowel =
      spellingHint.length === 1 ? spellingHint
      : spellingHint === 'au' ? 'o'
      : spellingHint[spellingHint.length - 1];
    const unstressed = !s.stress || s.stress === '0';
    const overridable =
      nucleusPhoneme === 'AA' ||
      nucleusPhoneme === 'AH' ||
      (nucleusPhoneme === 'IH' && unstressed && spellingHint === 'e') ||
      // /ɛ/ spelled "a" reads as written in Philippine English —
      // the KWF's own example is "maraton" for marathon (§6.5)
      (nucleusPhoneme === 'EH' && spellingHint === 'a') ||
      // r-colored vowel spelled -or/-ar: Filipino standardizes these as
      // written ("doktor", "propesor", "dolar", "kolor")
      (nucleusPhoneme === 'ER' && (spellingHint === 'o' || spellingHint === 'a'));
    if (overridable && 'aeiou'.includes(hintVowel)) {
      if (hintVowel !== mappedNucleus) spellingOverride = hintVowel;
      mappedNucleus = hintVowel;
    }
  }

  const codaPhonemes = s.coda.trim().toUpperCase().split(/\s+/).filter(Boolean).map(stripStress);
  const codaList = [...codaPhonemes];
  if (nucInfo.appendCoda) codaList.unshift(nucInfo.appendCoda.toUpperCase());

  // /oʊ/ keeps its glide when the syllable is closed ("spow-", "gowl"),
  // but relaxes to plain "o" syllable-finally ("yelo", "halo").
  const owClosed = nucleusPhoneme === 'OW' && codaPhonemes.length > 0;
  if (owClosed) codaList.unshift('W');

  // KWF §6.2: T next to K in the same syllable is not sounded — Filipino
  // respelling keeps SK and ST codas but never KT ("aspek", "korék").
  let ktDropped = false;
  for (let i = codaList.length - 1; i > 0; i--) {
    if (codaList[i] === 'T' && codaList[i - 1] === 'K') {
      codaList.splice(i, 1);
      ktDropped = true;
    }
  }

  const mappedCodaParts = codaList.map(p => CODA_MAP[p] ?? p.toLowerCase());

  // Epenthetic "e" before a final stop that follows a voiced obstruent
  // or affricate: "exposed" → spow.sed, "loved" → la.bed.
  const lastCoda = codaPhonemes[codaPhonemes.length - 1];
  const prevCoda = codaPhonemes[codaPhonemes.length - 2];
  const epenthesis = codaPhonemes.length >= 2 && EPENTHESIS_STOPS.has(lastCoda) && EPENTHESIS_TRIGGERS.has(prevCoda);
  if (epenthesis) mappedCodaParts.splice(mappedCodaParts.length - 1, 0, 'e');

  const mappedCoda = mappedCodaParts.join('');

  if (mapNotes) {
    for (const p of onsetPhonemes) {
      if (CONSONANT_MAP_NOTES[p]) mapNotes.add(CONSONANT_MAP_NOTES[p]);
    }
    for (const p of codaPhonemes) {
      const note = CODA_MAP_NOTES[p] ?? CONSONANT_MAP_NOTES[p];
      if (note) mapNotes.add(note);
    }
    if (spellingOverride) {
      mapNotes.add(`Spelling-aware vowel: /${nucleusPhoneme}/ would default to "${nucInfo.vowel}", but the word spells this syllable with "${spellingHint}", so it is written "${spellingOverride}" — Philippine English gives vowels their full written value (as in "kompyuter", "kolor", "doktor").`);
    } else if (nucleusPhoneme === 'OW') {
      mapNotes.add(
        owClosed
          ? 'The diphthong /oʊ/ (as in "go") keeps its "w" glide before a coda consonant ("ow").'
          : 'The diphthong /oʊ/ (as in "go") simplifies to "o" at the end of a syllable, following Filipino respelling practice.',
      );
    } else if (NUCLEUS_MAP_NOTES[nucleusPhoneme]) {
      mapNotes.add(NUCLEUS_MAP_NOTES[nucleusPhoneme]);
    }
    if (nucleusPhoneme && !NUCLEUS_MAP[nucleusPhoneme]) {
      mapNotes.add(`Unrecognized vowel phoneme /${nucleusPhoneme}/ defaulted to "a".`);
    }
    if (epenthesis) {
      mapNotes.add(`Epenthetic "e" inserted before the final consonant: /${prevCoda} ${lastCoda}/ cannot be stacked as bare vowel-killed consonants in a syllabic script, and the extra vowel restores the "-ed"-style syllable.`);
    }
    if (ktDropped) {
      mapNotes.add('The "t" after "k" in the syllable coda is dropped — the KWF Manwal sa Masinop na Pagsulat (§6.2) accepts SK and ST codas but not KT: "aspect" → "aspek", "correct" → "korek".');
    }
  }

  return mappedOnset + mappedNucleus + mappedCoda;
}

export function convertPhoneticWordToLatinWord(pw: PhoneticWord): string {
  if (!pw.syllables || pw.syllables.length === 0) return pw.original;
  return pw.syllables.map(s => convertPhoneticSyllableToLatinSyllable(s)).join('');
}

export function analyzeEnglishWord(word: string, reading?: WordReading): EnglishWordAnalysis {
  const considerations: Consideration[] = [];
  // Keep apostrophes for the CMU lookup ("don't" is a dictionary entry),
  // strip them for everything downstream.
  const lookupForm = word.trim().toLowerCase().replace(/[^a-z']/g, '');
  const normalized = lookupForm.replace(/'/g, '');

  if (normalized !== word.trim()) {
    considerations.push({
      stage: 'normalize',
      detail: `"${word.trim()}" normalized to "${normalized}" (lowercased, letters only — Baybayin has no capitalization or apostrophes).`,
    });
  }

  const allPronunciations = lookupForm ? cmuLookupAll(lookupForm) : [];

  // "As spelled" reading: skip the phonetic pipeline entirely and read
  // the word at its written face value, the way Filipino names are read
  // ("eli" → e·li rather than CMU's ee·lie).
  if (reading?.asSpelled) {
    considerations.push({
      stage: 'pronounce',
      detail: `Read as spelled (chosen in the reading switch): every written vowel keeps its face value, the way Filipino reads names — the English pronunciation${allPronunciations.length ? ` (${allPronunciations[0].join(' ')})` : ''} is set aside.`,
    });
    considerations.push({
      stage: 'syllabify',
      detail: 'Syllables come directly from the spelling (onset–nucleus–coda over the written letters).',
    });
    const syllables = syllabifyWord(normalized)
      .filter((t): t is Extract<SyllableToken, { type: 'syllable' }> => t.type === 'syllable')
      .map(t => ({ onset: t.onset, nucleus: t.nucleus, coda: t.coda, latin: t.original }));
    return {
      original: word,
      normalized,
      arpabet: '',
      latin: normalized,
      source: 'spelled',
      syllables,
      considerations,
      alternates: allPronunciations.length,
    };
  }

  const pronunciationIndex = Math.min(reading?.pronunciationIndex ?? 0, Math.max(allPronunciations.length - 1, 0));
  const cmuPhonemes = allPronunciations[pronunciationIndex] ?? null;
  const curatedMatch = cmuPhonemes ? undefined : OFFLINE_DICTIONARY[normalized];

  let source: PronunciationSource;
  let arpabet: string;
  let baseSyllables: (PhoneticSyllable & { stress?: string })[];
  const syllableTrace: string[] = [];

  if (cmuPhonemes) {
    source = 'cmu';
    arpabet = cmuPhonemes.join(' ');
    baseSyllables = syllabifyCmuPhonemes(cmuPhonemes, syllableTrace).map(s => ({
      onset: s.onset.join(' '),
      nucleus: s.nucleus,
      coda: s.coda.join(' '),
      stress: s.stress,
    }));
    considerations.push({
      stage: 'pronounce',
      detail: pronunciationIndex > 0
        ? `Using CMU alternate pronunciation ${pronunciationIndex + 1} of ${allPronunciations.length} for "${normalized}" (chosen in the reading switch). Digits on vowels mark stress: 1 = primary, 2 = secondary, 0 = unstressed.`
        : `"${normalized}" was found in the CMU Pronouncing Dictionary (v0.7a, ~123,000 words)${allPronunciations.length > 1 ? ` — it lists ${allPronunciations.length} pronunciations; the reading switch selects among them` : ''}. Digits on vowels mark stress: 1 = primary, 2 = secondary, 0 = unstressed.`,
    });
    considerations.push({
      stage: 'syllabify',
      detail: 'Phonemes were grouped into syllables by onset maximalism: each consonant cluster between vowels is pushed as far into the next syllable\'s onset as English sound patterns allow.',
    });
  } else if (curatedMatch) {
    source = 'dictionary';
    arpabet = curatedMatch.flatMap(s => [s.onset, s.nucleus, s.coda]).join(' ').replace(/\s+/g, ' ').trim();
    baseSyllables = curatedMatch;
    considerations.push({
      stage: 'pronounce',
      detail: `"${normalized}" is not in the CMU dictionary but was found in the app's small curated dictionary — its hand-checked phonemes and syllable boundaries were used.`,
    });
    considerations.push({
      stage: 'syllabify',
      detail: 'Syllable boundaries (onset–nucleus–coda) come directly from the curated dictionary entry.',
    });
  } else {
    source = 'rules';
    arpabet = englishToArpabet(normalized);
    baseSyllables = arpabetToStructuredPhoneticWord(normalized, arpabet, syllableTrace).syllables;
    considerations.push({
      stage: 'pronounce',
      detail: `"${normalized}" is not in the CMU Pronouncing Dictionary — its pronunciation was derived by letter-to-sound (G2P) rules, so it is an approximation of how the word sounds.`,
    });
    considerations.push({
      stage: 'syllabify',
      detail: 'Phonemes were grouped into syllables by onset maximalism: each consonant cluster between vowels is pushed as far into the next syllable\'s onset as English sound patterns allow.',
    });
  }

  for (const t of syllableTrace) {
    considerations.push({ stage: 'syllabify', detail: t });
  }

  // KWF §7.2 / §4.7: English words beginning with S + consonant take a
  // prothetic "i" in Filipino respelling ("iskul", "istayl", "ismart").
  const firstOnset = (baseSyllables[0]?.onset ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  const prothetic = firstOnset.length >= 2 && firstOnset[0] === 'S';
  if (prothetic) {
    baseSyllables = [{ onset: '', nucleus: 'IH', coda: '' }, ...baseSyllables];
    considerations.push({
      stage: 'map',
      detail: `A prothetic "i" syllable is added before the initial /S ${firstOnset[1]}/ cluster — Filipino respells English words beginning with S + consonant with a leading i ("iskul" for school, "istayl" for style; KWF Manwal sa Masinop na Pagsulat §7.2, §4.7).`,
    });
  }

  const mapNotes = new Set<string>();
  // The prothetic syllable is not part of the written word, so it takes no
  // spelling unit when aligning nuclei to the word's written vowels.
  const nucleusCount = baseSyllables.filter(s => s.nucleus.trim() !== '').length - (prothetic ? 1 : 0);
  const spellingUnits = alignNucleiToSpelling(normalized, nucleusCount);
  const overrides = reading?.nucleusOverrides ?? {};
  let nucleusIndex = 0;
  const syllables = baseSyllables.map((s, index) => {
    // Spelling alignment consumes a unit per nucleus regardless of override,
    // so later syllables stay aligned with their written vowels. The
    // prothetic "i" (index 0) has no written vowel and consumes none.
    let hint = s.nucleus.trim() !== '' && !(prothetic && index === 0)
      ? spellingUnits?.[nucleusIndex++] ?? null
      : null;
    let syllable = s;
    const override = overrides[index];
    if (override && s.nucleus.trim() !== '') {
      syllable = { ...s, nucleus: override };
      hint = null; // a manual choice outranks the spelling-aware rules
      const choice = NUCLEUS_CHOICES.find(c => c.value === override);
      considerations.push({
        stage: 'map',
        detail: `Syllable ${index + 1} vowel set manually to "${choice?.latin ?? override.toLowerCase()}"${choice ? ` — a ${choice.kind} vowel, ${choice.hint}` : ''} (chosen in the syllable editor).`,
      });
    }
    return {
      ...syllable,
      latin: convertPhoneticSyllableToLatinSyllable(syllable, mapNotes, hint),
    };
  });
  for (const note of mapNotes) {
    considerations.push({ stage: 'map', detail: note });
  }

  return {
    original: word,
    normalized,
    arpabet,
    latin: syllables.map(s => s.latin).join(''),
    source,
    syllables,
    considerations,
    alternates: allPronunciations.length,
  };
}
