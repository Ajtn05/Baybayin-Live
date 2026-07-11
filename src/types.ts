export interface TranslationOptions {
  useRa: boolean;
  nativePunctuation: boolean;
  useDictionary: boolean;
  viramaChar: string; // Unicode character to use for killing vowel sound
  dropFinalConsonants?: boolean; // Pre-colonial mode: drop final codas
}

export interface TranslationResult {
  text: string;
  notes: string[];
  syllables: string[];
}

export interface ONCSyllable {
  onset: string;   // 'o' onset: preceding consonant(s)
  nucleus: string; // 'n' nucleus: core vowel sound
  coda: string;    // 'c' coda: trailing consonant(s)
  original: string;// original syllable string e.g., "mat"
}

export type SyllableToken = 
  | { type: 'syllable'; onset: string; nucleus: string; coda: string; original: string }
  | { type: 'separator'; char: string }
  | { type: 'other'; char: string };

export interface DictionaryEntry {
  standard: string;
  description?: string;
}

export interface BaybayinCharacter {
  latin: string;
  unicode: string;
  type: 'vowel' | 'consonant' | 'punctuation' | 'kudlit';
  description: string;
}

// ─── Transliteration trace (Details page) ────────────────────

export type ConsiderationStage = 'detect' | 'normalize' | 'pronounce' | 'syllabify' | 'map' | 'render';

// ─── Per-word language routing ───────────────────────────────

export type WordLang = 'filipino' | 'english' | 'spanish';

export interface LangDetection {
  lang: WordLang;
  /** Human-readable reason for the choice, shown on the word's card. */
  reason: string;
}

export interface Consideration {
  stage: ConsiderationStage;
  detail: string;
}

// One visual component of a rendered syllable: a base character,
// a kudlit, a virama, or an independent vowel.
export interface GlyphPart {
  glyph: string;
  label: string;
  reason: string;
}

export interface GlyphSyllable {
  latin: string;
  script: string;
  parts: GlyphPart[];
}

export interface WordGlyphAnalysis {
  original: string;
  processed: string;
  preprocessNotes: string[];
  onc: { onset: string; nucleus: string; coda: string; original: string }[];
  syllables: GlyphSyllable[];
  script: string;
}

