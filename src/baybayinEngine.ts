import { TranslationOptions, TranslationResult, BaybayinCharacter, SyllableToken, GlyphPart, GlyphSyllable, WordGlyphAnalysis } from './types';

export const CONSONANTS: Record<string, string> = {
  k: '\u1703', g: '\u1704', ng: '\u1705', t: '\u1706', d: '\u1707',
  n: '\u1708', p: '\u1709', b: '\u170A', m: '\u170B', y: '\u170C',
  r: '\u170D', l: '\u170E', w: '\u170F', s: '\u1710', h: '\u1711'
};

export const VOWEL_INDEPENDENT: Record<string, string> = {
  a: '\u1700', i: '\u1701', e: '\u1701', u: '\u1702', o: '\u1702'
};

export const KUDLIT_ABOVE = '\u1712';
export const KUDLIT_BELOW = '\u1713';
export const VIRAMA_UNICODE = '\u1714';
export const DANDA_SINGLE = '\u1735';
export const DANDA_DOUBLE = '\u1736';

export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// Word lookups are keyed by raw user input, so these tables are given a
// null prototype: a plain object literal would return Object.prototype
// members for inputs like "constructor" or "__proto__" and crash the
// pipeline downstream.
export const DICTIONARY: Record<string, { standard: string; meaning: string }> =
  Object.assign(Object.create(null), {
    'lalaki': { standard: 'lalaki', meaning: 'Man / Male (Correct traditional spelling pattern)' },
    'babae': { standard: 'babae', meaning: 'Woman / Female (Correct traditional spelling pattern)' },
    'totoo': { standard: 'totoo', meaning: 'True / Truth (Uses hiatus glides natively)' },
    'puno': { standard: 'puno', meaning: 'Tree / Full' },
    'punong': { standard: 'punong', meaning: 'Tree / Full (with linking nasal)' },
  });

// Map of standard characters for the educational chart
export const BAYBAYIN_CHART_DATA: BaybayinCharacter[] = [
  // Independent Vowels
  { latin: 'A', unicode: '\u1700', type: 'vowel', description: 'Independent vowel marker for initial "A" sound' },
  { latin: 'I / E', unicode: '\u1701', type: 'vowel', description: 'Independent vowel marker for initial "I" or "E" sound' },
  { latin: 'U / O', unicode: '\u1702', type: 'vowel', description: 'Independent vowel marker for initial "U" or "O" sound' },
  // Consonants (Defaults to -A sound)
  { latin: 'Ka', unicode: '\u1703', type: 'consonant', description: 'Consonant character for the "K" syllable family' },
  { latin: 'Ga', unicode: '\u1704', type: 'consonant', description: 'Consonant character for the "G" syllable family' },
  { latin: 'Nga', unicode: '\u1705', type: 'consonant', description: 'Velar nasal consonant character for the "NG" sound' },
  { latin: 'Ta', unicode: '\u1706', type: 'consonant', description: 'Consonant character for the "T" syllable family' },
  { latin: 'Da / Ra', unicode: '\u1707', type: 'consonant', description: 'Traditional joint consonant character for both "D" and "R"' },
  { latin: 'Na', unicode: '\u1708', type: 'consonant', description: 'Consonant character for the "N" syllable family' },
  { latin: 'Pa', unicode: '\u1709', type: 'consonant', description: 'Consonant character for the "P" syllable family' },
  { latin: 'Ba', unicode: '\u170A', type: 'consonant', description: 'Consonant character for the "B" syllable family' },
  { latin: 'Ma', unicode: '\u170B', type: 'consonant', description: 'Consonant character for the "M" syllable family' },
  { latin: 'Ya', unicode: '\u170C', type: 'consonant', description: 'Consonant character for the "Y" syllable family' },
  { latin: 'Ra (Modern)', unicode: '\u170D', type: 'consonant', description: 'Modern distinct "R" syllable family introduced for Spanish/English loanwords' },
  { latin: 'La', unicode: '\u170E', type: 'consonant', description: 'Consonant character for the "L" syllable family' },
  { latin: 'Wa', unicode: '\u170F', type: 'consonant', description: 'Consonant character for the "W" syllable family' },
  { latin: 'Sa', unicode: '\u1710', type: 'consonant', description: 'Consonant character for the "S" syllable family' },
  { latin: 'Ha', unicode: '\u1711', type: 'consonant', description: 'Consonant character for the "H" syllable family' },
  // Kudlits & Markings
  { latin: 'i/e Kudlit', unicode: '\u1712', type: 'kudlit', description: 'Placed ABOVE a consonant to change its vowel sound to "/i/" or "/e/"' },
  { latin: 'u/o Kudlit', unicode: '\u1713', type: 'kudlit', description: 'Placed BELOW a consonant to change its vowel sound to "/u/" or "/o/"' },
  { latin: 'Krus-Kudlit (Virama)', unicode: '\u1714', type: 'kudlit', description: 'Placed BELOW a consonant to cancel or "kill" its trailing "-a" vowel sound' },
  // Punctuation
  { latin: 'Single Danda (᜵)', unicode: '\u1735', type: 'punctuation', description: 'Traditional phrase divider, similar to a comma (,)' },
  { latin: 'Double Danda (᜶)', unicode: '\u1736', type: 'punctuation', description: 'Traditional sentence ending or paragraph divider, similar to a period (.)' }
];

export const PRESET_EXAMPLES = [
  { latin: 'mabuhay', translation: 'ᜋᜊᜓᜑᜌ᜔', meaning: 'Welcome / Long Live' },
  { latin: 'salamat', translation: 'ᜐᜎᜋᜆ᜔', meaning: 'Thank you' },
  { latin: 'mag-aral', translation: 'ᜋᜄ᜔-ᜀᜍᜎ᜔', meaning: 'To study (hyphen boundary test)' },
  { latin: 'kwento', translation: 'ᜃᜓᜏᜒᜈ᜔ᜆᜓ', meaning: 'Story (consonant cluster test)' },
  { latin: 'banyo', translation: 'ᜊᜈ᜔ᜌᜓ', meaning: 'Bathroom (nasal cluster test)' },
  { latin: 'maria', translation: 'ᜋᜍᜒᜌ', meaning: 'Maria (vowel hiatus test)' },
  { latin: 'kalayaan', translation: 'ᜃᜎᜌᜀᜈ᜔', meaning: 'Freedom' },
  { latin: 'kaibigan', translation: 'ᜃᜁᜊᜒᜄᜈ᜔', meaning: 'Friend' }
];

// Abbreviated function words are written the way they are *said*: Baybayin
// encodes sound, not spelling, so an abbreviation has to be restored to the
// syllables it stands for before it can be rendered. These two are among the
// most frequent words in Tagalog, and both are abbreviations — "ng" is a
// contraction of "nang", and "mga" of "manga".
const ABBREVIATED_WORDS: Record<string, { full: string; note: string }> =
  Object.assign(Object.create(null), {
    ng: {
      full: 'nang',
      note: 'Abbreviation spelled out: the marker "ng" is pronounced /naŋ/ ("nang"), so it is written ᜈᜅ᜔ — not the single character ᜅ, which reads "nga".',
    },
    mga: {
      full: 'manga',
      note: 'Abbreviation spelled out: the plural marker "mga" is pronounced /ma·ŋa/ ("manga"), so it is written ᜋᜅ — Baybayin has no way to write the silent letters of an abbreviation.',
    },
  });

/**
 * Replace abbreviated function words with the pronunciation they stand for.
 * Matches whole alphabetic runs only, so "ngayon" and "mag-aral" are left
 * alone while "ng," and "mga." keep their punctuation.
 */
function expandAbbreviations(word: string, notes: Set<string>): string {
  return word.replace(/[a-z]+/g, run => {
    const entry = ABBREVIATED_WORDS[run];
    if (!entry) return run;
    notes.add(entry.note);
    return entry.full;
  });
}

function preprocessLoanLetters(word: string, notes: Set<string>): string {
  let w = word;
  const replacements: Array<[RegExp, string, string]> = [
    [/ñ/g, 'ny', 'Loan letter ñ → ny (closes phonetic match)'],
    [/j/g, 'dy', 'Loan letter j → dy (closes phonetic match)'],
    [/x/g, 'ks', 'Loan letter x → ks (closes phonetic match)'],
    [/c/g, 'k', 'Loan letter c → k (closes phonetic match)'],
    [/q/g, 'k', 'Loan letter q → k (closes phonetic match)'],
    [/f/g, 'p', 'Loan letter f → p (closes phonetic match)'],
    [/v/g, 'b', 'Loan letter v → b (closes phonetic match)'],
    [/z/g, 's', 'Loan letter z → s (closes phonetic match)']
  ];

  for (const [re, rep, note] of replacements) {
    if (re.test(w)) {
      w = w.replace(re, rep);
      notes.add(note);
    }
  }
  return w;
}

function preprocessVowelGlides(word: string, notes: Set<string>): string {
  let w = word;

  const CONSONANT_LETTER = /[b-df-hj-np-tv-z]/i;

  // KWF Manwal sa Masinop na Pagsulat (2014), kabanata 5: a consonant+glide
  // syllable is spelled in full only in the manual's exception contexts —
  // in the word's first syllable (§5.1: "kuwento", "siya"), after a consonant
  // cluster (§5.2: "leksiyon", "engkuwentro"), or after H (§5.3: "kolehiyo").
  // Elsewhere the compact glide is the standard spelling (§5 general rule:
  // "kompanya", "akasya", "agwador").
  const shouldExpand = (c: string, offset: number, str: string): boolean =>
    offset === 0 || c.toLowerCase() === 'h' || CONSONANT_LETTER.test(str[offset - 1] ?? '');

  // 1. Consonant + w glide written in full in KWF contexts (kwento -> kuwento).
  w = w.replace(/([b-df-hj-np-tv-z])w([aeiou])/gi, (m, c, v, offset: number, str: string) => {
    if (!shouldExpand(c, offset, str)) {
      notes.add(`Compact glide kept: "${c}w${v}" stays as written — mid-word after a vowel the KWF Manwal sa Masinop na Pagsulat (§5, general rule) uses the glide-only spelling ("agwador", "indibidwal").`);
      return m;
    }
    notes.add(`Glide written in full: "${c}w${v}" becomes "${c}uw${v}" — the KWF Manwal sa Masinop na Pagsulat (§5.1–5.3) spells this position out ("kuwento", not "kwento"), and Baybayin needs the vowel because every character carries one.`);
    return `${c}uw${v}`;
  });

  // 2. Consonant + y glide written in full in the same KWF contexts
  //    (syota -> siyota). "dy" is the digraph for /dʒ/ and always stays
  //    compact (KWF §4.13: "dyip", "dyáket") — it renders as a virama cluster.
  w = w.replace(/([b-df-hj-np-tv-z])y([aeiou])/gi, (m, c, v, offset: number, str: string) => {
    if (c.toLowerCase() === 'd') {
      notes.add(`Digraph "dy" kept compact — the KWF Manwal sa Masinop na Pagsulat (§4.13) writes the /dʒ/ sound as "dy" ("dyip", "dyáket"), rendered in Baybayin as a consonant cluster with virama.`);
      return m;
    }
    if (!shouldExpand(c, offset, str)) {
      notes.add(`Compact glide kept: "${c}y${v}" stays as written — mid-word after a vowel the KWF Manwal sa Masinop na Pagsulat (§5, general rule) uses the glide-only spelling ("kompanya", "akasya", "banyo").`);
      return m;
    }
    notes.add(`Glide written in full: "${c}y${v}" becomes "${c}iy${v}" — the KWF Manwal sa Masinop na Pagsulat (§5.1–5.3) spells this position out ("siya" not "sya", "leksiyon" not "leksyon"), and Baybayin needs the vowel because every character carries one. Read quickly, "${c}iy${v}" still sounds like "${c}y${v}".`);
    return `${c}iy${v}`;
  });

  // 3. Y-Glide: weak vowel i followed by another vowel (ia -> iya, io -> iyo).
  //    Strong vowels E/O take no glide (KWF §5.5: "teatro", "león", "aorta").
  w = w.replace(/(i)([aeou])/gi, (_, v1, v2) => {
    notes.add(`Hiatus resolution: a smooth "y" glide is written between the adjacent vowels "${v1}${v2}" → "${v1}y${v2}" (as "Maria" is written "Mariya"); only the weak vowels i/u take a glide (KWF §5.5).`);
    return `${v1}y${v2}`;
  });

  // 4. W-Glide: weak vowel u followed by another vowel (ua -> uwa, ue -> uwe).
  w = w.replace(/(u)([aei])/gi, (_, v1, v2) => {
    notes.add(`Hiatus resolution: a smooth "w" glide is written between the adjacent vowels "${v1}${v2}" → "${v1}w${v2}" (as "tuing" is written "tuwing"); only the weak vowels i/u take a glide (KWF §5.5).`);
    return `${v1}w${v2}`;
  });

  return w;
}

export const VALID_CLUSTERS = [
  'ts', 'pr', 'pl', 'br', 'bl', 'tr', 'dr', 'kr', 'kl', 'gr', 'gl', 'sy', 'dy', 'ny', 'ky', 'py', 'by', 'my', 'ty', 'ly', 'wy',
  'sw', 'kw', 'pw', 'gw', 'lw', 'hw'
];

// Membership set for the syllable splitter, which asks this question once per
// consonant pair in every word on every keystroke.
const VALID_CLUSTER_SET = new Set(VALID_CLUSTERS);

interface WordUnit {
  type: 'vowel' | 'consonant' | 'separator' | 'other';
  char: string;
}

export function splitConsonants(str: string): string[] {
  const result: string[] = [];
  let i = 0;
  const lowercase = str.toLowerCase();
  while (i < str.length) {
    if (lowercase[i] === 'n' && lowercase[i + 1] === 'g') {
      result.push(str.substring(i, i + 2));
      i += 2;
    } else {
      result.push(str[i]);
      i++;
    }
  }
  return result;
}

export function syllabifyWord(word: string): SyllableToken[] {
  const units: WordUnit[] = [];
  let i = 0;
  const lowercase = word.toLowerCase();
  
  while (i < word.length) {
    const origC = word[i];
    const c = lowercase[i];
    
    // Check separator / hyphen
    if (c === '-' || c === '+') {
      units.push({ type: 'separator', char: origC });
      i++;
      continue;
    }
    
    // Check vowels
    if (VOWELS.has(c)) {
      units.push({ type: 'vowel', char: origC });
      i++;
      continue;
    }
    
    // Check multichar consonant 'ng'
    if (c === 'n' && lowercase[i + 1] === 'g') {
      units.push({ type: 'consonant', char: word.substring(i, i + 2) });
      i += 2;
      continue;
    }
    
    // Check single consonants (alphas)
    if (/[a-z]/i.test(c)) {
      units.push({ type: 'consonant', char: origC });
      i++;
      continue;
    }
    
    // Other (spaces, punctuations, numbers etc)
    units.push({ type: 'other', char: origC });
    i++;
  }

  const tokens: SyllableToken[] = [];
  let currentGroup: WordUnit[] = [];

  const flushGroup = () => {
    if (currentGroup.length === 0) return;
    const oncSyllables = parseONCSyllables(currentGroup);
    tokens.push(...oncSyllables);
    currentGroup = [];
  };

  for (const unit of units) {
    if (unit.type === 'vowel' || unit.type === 'consonant') {
      currentGroup.push(unit);
    } else {
      flushGroup();
      if (unit.type === 'separator') {
        tokens.push({ type: 'separator', char: unit.char });
      } else {
        tokens.push({ type: 'other', char: unit.char });
      }
    }
  }
  flushGroup();

  return tokens;
}

function getSplitIndex(betweenConsonants: WordUnit[]): number {
  const k = betweenConsonants.length;
  if (k <= 1) return 0;

  if (k === 2) {
    const c1 = betweenConsonants[0].char.toLowerCase();
    const c2 = betweenConsonants[1].char.toLowerCase();
    if (VALID_CLUSTER_SET.has(c1 + c2)) {
      return 0;
    } else {
      return 1;
    }
  }

  if (k === 3) {
    const c2 = betweenConsonants[1].char.toLowerCase();
    const c3 = betweenConsonants[2].char.toLowerCase();
    if (VALID_CLUSTER_SET.has(c2 + c3)) {
      return 1;
    } else {
      return 2;
    }
  }

  // k >= 4
  const ck_1 = betweenConsonants[k - 2].char.toLowerCase();
  const ck = betweenConsonants[k - 1].char.toLowerCase();
  if (VALID_CLUSTER_SET.has(ck_1 + ck)) {
    return k - 2;
  } else {
    return k - 1;
  }
}

function parseONCSyllables(units: WordUnit[]): SyllableToken[] {
  const n = units.length;
  const vowelIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (units[i].type === 'vowel') {
      vowelIndices.push(i);
    }
  }

  // Edge case: no vowels (e.g. "ng", "s", "pst")
  if (vowelIndices.length === 0) {
    const whole = units.map(u => u.char).join('');
    return [{
      type: 'syllable',
      onset: whole,
      nucleus: '',
      coda: '',
      original: whole
    }];
  }

  const syllables: SyllableToken[] = [];
  const numVowels = vowelIndices.length;

  for (let i = 0; i < numVowels; i++) {
    const vI = vowelIndices[i];
    const nucleus = units[vI].char;

    // 1. Determine Onset
    let onset = '';
    if (i === 0) {
      onset = units.slice(0, vI).map(u => u.char).join('');
    } else {
      const prevVI = vowelIndices[i - 1];
      const betweenConsonants = units.slice(prevVI + 1, vI);
      const splitIndex = getSplitIndex(betweenConsonants);
      onset = betweenConsonants.slice(splitIndex).map(u => u.char).join('');
    }

    // 2. Determine Coda
    let coda = '';
    if (i === numVowels - 1) {
      coda = units.slice(vI + 1).map(u => u.char).join('');
    } else {
      const nextVI = vowelIndices[i + 1];
      const betweenConsonants = units.slice(vI + 1, nextVI);
      const splitIndex = getSplitIndex(betweenConsonants);
      coda = betweenConsonants.slice(0, splitIndex).map(u => u.char).join('');
    }

    const original = (onset + nucleus + coda);
    syllables.push({
      type: 'syllable',
      onset,
      nucleus,
      coda,
      original
    });
  }

  return syllables;
}

function translateSyllableTokens(tokens: SyllableToken[], opts: TranslationOptions, notes: Set<string>, syllablesOut: string[]): string {
  let out = '';
  
  for (const token of tokens) {
    if (token.type === 'separator') {
      if (token.char === '-') {
        notes.add(`Morpheme boundary: Recognized hyphen boundary (-) stabilizing syllable edges`);
      }
      out += token.char;
      continue;
    }
    
    if (token.type === 'other') {
      const c = token.char;
      if (opts.nativePunctuation) {
        if (['.', '!', '?'].includes(c)) {
          out += DANDA_DOUBLE;
          syllablesOut.push('᜶');
          continue;
        }
        if ([',', ';', ':'].includes(c)) {
          out += DANDA_SINGLE;
          syllablesOut.push('᜵');
          continue;
        }
      }
      out += c;
      continue;
    }

    // Now we have a syllable: { onset, nucleus, coda, original }
    const { onset, nucleus, coda } = token;
    
    let syllableScript = '';
    
    const normOnset = onset.toLowerCase();
    const normNucleus = nucleus.toLowerCase();
    const normCoda = coda.toLowerCase();

    // 1. Determine independent vowel or consonant base
    if (normOnset === '') {
      if (normNucleus !== '') {
        const indep = VOWEL_INDEPENDENT[normNucleus];
        if (indep) {
          syllableScript += indep;
        }
        syllablesOut.push(nucleus.toUpperCase());
      }
    } else {
      const onsetConsonants = splitConsonants(normOnset);
      
      for (let idx = 0; idx < onsetConsonants.length; idx++) {
        const cUnit = onsetConsonants[idx];
        const baseChar = (cUnit === 'r' && opts.useRa) 
          ? CONSONANTS.r 
          : (cUnit === 'r' ? CONSONANTS.d : CONSONANTS[cUnit]);
          
        if (!baseChar) {
          syllableScript += cUnit;
          continue;
        }

        const isLastInOnset = (idx === onsetConsonants.length - 1);
        
        if (!isLastInOnset) {
          syllableScript += baseChar + opts.viramaChar;
        } else {
          syllableScript += baseChar;
          
          if (normNucleus === 'i' || normNucleus === 'e') {
            syllableScript += KUDLIT_ABOVE;
          } else if (normNucleus === 'u' || normNucleus === 'o') {
            syllableScript += KUDLIT_BELOW;
          }
        }
      }

      const syllPreview = onset.toUpperCase() + (nucleus || '');
      syllablesOut.push(syllPreview);
    }

    // 2. Handle Coda
    if (normCoda !== '') {
      const codaConsonants = splitConsonants(normCoda);
      
      if (opts.dropFinalConsonants) {
        notes.add(`Pre-Colonial Rule: Omitted final trailing consonant (coda) "${coda}" in authentic traditional style`);
        syllablesOut.push(`(${coda})`);
      } else {
        for (const cUnit of codaConsonants) {
          const baseChar = (cUnit === 'r' && opts.useRa) 
            ? CONSONANTS.r 
            : (cUnit === 'r' ? CONSONANTS.d : CONSONANTS[cUnit]);
            
          if (baseChar) {
            syllableScript += baseChar + opts.viramaChar;
          } else {
            syllableScript += cUnit;
          }
          syllablesOut.push(`[${cUnit}]`);
        }
      }
    }

    out += syllableScript;
  }

  return out;
}

export function translateLatinToBaybayin(text: string, options: Partial<TranslationOptions>): TranslationResult {
  const o: TranslationOptions = {
    useRa: options.useRa ?? true,
    nativePunctuation: options.nativePunctuation ?? false,
    useDictionary: options.useDictionary ?? true,
    viramaChar: options.viramaChar ?? VIRAMA_UNICODE,
    dropFinalConsonants: options.dropFinalConsonants ?? false
  };

  const notes = new Set<string>();
  const syllables: string[] = [];

  // Split into words, preserving spaces and newlines
  const tokens = text.toLowerCase().split(/(\s+)/);
  const resultText = tokens.map(tok => {
    // If empty or whitespace, return as-is
    if (/^\s+$/.test(tok) || tok === '') {
      return tok;
    }

    let word = tok;

    // Check custom static dictionary normalization for common Tagalog grammatical alignments
    if (o.useDictionary && DICTIONARY[word]) {
      const dictMatch = DICTIONARY[word];
      if (dictMatch.standard !== word) {
        notes.add(`Dictionary correction: Aligned "${tok}" with orthographic standard (Standardized: ${dictMatch.standard})`);
      }
      word = dictMatch.standard;
    }

    // Preprocess character mapping & Glides step-by-step
    word = expandAbbreviations(word, notes);
    word = preprocessLoanLetters(word, notes);
    word = preprocessVowelGlides(word, notes);

    // Parse the word into structured SyllableTokens (utilizing ONC decomposition)
    const wordTokens = syllabifyWord(word);
    
    // Translate the structured ONC syllables deterministically!
    const wordSyllables: string[] = [];
    const translated = translateSyllableTokens(wordTokens, o, notes, wordSyllables);
    syllables.push(...wordSyllables);
    return translated;
  }).join('');

  return {
    text: resultText,
    notes: Array.from(notes),
    syllables: syllables.filter(s => s !== '')
  };
}

// ─── Glyph-level analysis for the Details page ────────────────

const CONSONANT_NAMES: Record<string, string> = {
  k: 'Ka', g: 'Ga', ng: 'Nga', t: 'Ta', d: 'Da', n: 'Na', p: 'Pa', b: 'Ba',
  m: 'Ma', y: 'Ya', r: 'Ra', l: 'La', w: 'Wa', s: 'Sa', h: 'Ha'
};

function consonantGlyphInfo(cUnit: string, opts: TranslationOptions): { glyph: string; name: string; reason: string } | null {
  if (cUnit === 'r') {
    return opts.useRa
      ? { glyph: CONSONANTS.r, name: 'Ra (modern)', reason: 'Modern Ra is enabled: R gets its own distinct character ᜍ, an innovation for loanwords.' }
      : { glyph: CONSONANTS.d, name: 'Da/Ra (traditional)', reason: 'Modern Ra is disabled: R shares the traditional Da character ᜇ, as in pre-colonial usage.' };
  }
  const glyph = CONSONANTS[cUnit];
  if (!glyph) return null;
  return { glyph, name: CONSONANT_NAMES[cUnit] ?? cUnit, reason: `Base character ${CONSONANT_NAMES[cUnit] ?? cUnit} carries the inherent "a" vowel.` };
}

/**
 * Full per-word breakdown of how a (Baybayin-safe) Latin word becomes
 * Baybayin glyphs: preprocessing notes, ONC syllables, and every glyph
 * component (base character, kudlit, virama) with the reason it was used.
 */
export function analyzeWordGlyphs(rawWord: string, options: Partial<TranslationOptions>): WordGlyphAnalysis {
  const o: TranslationOptions = {
    useRa: options.useRa ?? true,
    nativePunctuation: options.nativePunctuation ?? false,
    useDictionary: options.useDictionary ?? true,
    viramaChar: options.viramaChar ?? VIRAMA_UNICODE,
    dropFinalConsonants: options.dropFinalConsonants ?? false
  };

  const preprocessNotes = new Set<string>();
  let word = rawWord.toLowerCase();

  if (o.useDictionary && DICTIONARY[word]) {
    const dictMatch = DICTIONARY[word];
    if (dictMatch.standard !== word) {
      preprocessNotes.add(`Dictionary correction: "${word}" standardized to "${dictMatch.standard}".`);
    }
    word = dictMatch.standard;
  }

  word = expandAbbreviations(word, preprocessNotes);
  word = preprocessLoanLetters(word, preprocessNotes);
  word = preprocessVowelGlides(word, preprocessNotes);

  const tokens = syllabifyWord(word);
  const glyphSyllables: GlyphSyllable[] = [];
  let script = '';

  for (const token of tokens) {
    if (token.type !== 'syllable') {
      script += token.char;
      continue;
    }

    const { onset, nucleus, coda, original } = token;
    const normOnset = onset.toLowerCase();
    const normNucleus = nucleus.toLowerCase();
    const normCoda = coda.toLowerCase();
    const parts: GlyphPart[] = [];
    let syllableScript = '';

    if (normOnset === '') {
      if (normNucleus !== '') {
        const indep = VOWEL_INDEPENDENT[normNucleus];
        if (indep) {
          parts.push({
            glyph: indep,
            label: `${normNucleus.toUpperCase()} — independent vowel`,
            reason: normNucleus === 'e' || normNucleus === 'o'
              ? `The syllable starts with a bare vowel, so the stand-alone vowel character is used. Baybayin does not distinguish ${normNucleus === 'e' ? 'e from i' : 'o from u'}, so they share one character.`
              : 'The syllable starts with a bare vowel, so the stand-alone vowel character is used instead of a kudlit mark.',
          });
          syllableScript += indep;
        }
      }
    } else {
      const onsetConsonants = splitConsonants(normOnset);
      onsetConsonants.forEach((cUnit, idx) => {
        const info = consonantGlyphInfo(cUnit, o);
        if (!info) {
          parts.push({ glyph: cUnit, label: `"${cUnit}" — no Baybayin equivalent`, reason: 'This letter has no matching Baybayin character and was passed through unchanged.' });
          syllableScript += cUnit;
          return;
        }

        const isLastInOnset = idx === onsetConsonants.length - 1;
        if (!isLastInOnset) {
          parts.push({
            glyph: info.glyph + o.viramaChar,
            label: `${info.name} + virama`,
            reason: `"${cUnit}" is part of a consonant cluster before the vowel — the krus-kudlit cancels its inherent "a" so it reads as a bare consonant.`,
          });
          syllableScript += info.glyph + o.viramaChar;
          return;
        }

        if (normNucleus === 'i' || normNucleus === 'e') {
          parts.push({ glyph: info.glyph, label: info.name, reason: info.reason });
          parts.push({
            glyph: info.glyph + KUDLIT_ABOVE,
            label: 'kudlit above (i/e)',
            reason: `A kudlit above shifts the vowel from "a" to "${normNucleus}" — Baybayin writes i and e with the same mark.`,
          });
          syllableScript += info.glyph + KUDLIT_ABOVE;
        } else if (normNucleus === 'u' || normNucleus === 'o') {
          parts.push({ glyph: info.glyph, label: info.name, reason: info.reason });
          parts.push({
            glyph: info.glyph + KUDLIT_BELOW,
            label: 'kudlit below (u/o)',
            reason: `A kudlit below shifts the vowel from "a" to "${normNucleus}" — Baybayin writes u and o with the same mark.`,
          });
          syllableScript += info.glyph + KUDLIT_BELOW;
        } else {
          parts.push({
            glyph: info.glyph,
            label: info.name,
            reason: cUnit === 'r'
              ? info.reason
              : `Read with its inherent "a" vowel — no mark needed for "${cUnit}a".`,
          });
          syllableScript += info.glyph;
        }
      });
    }

    if (normCoda !== '') {
      if (o.dropFinalConsonants) {
        parts.push({
          glyph: '·',
          label: `"${coda}" omitted`,
          reason: 'Pre-colonial style is enabled: syllable-final consonants were traditionally left unwritten, and readers inferred them from context.',
        });
      } else {
        for (const cUnit of splitConsonants(normCoda)) {
          const info = consonantGlyphInfo(cUnit, o);
          if (info) {
            parts.push({
              glyph: info.glyph + o.viramaChar,
              label: `${info.name} + virama`,
              reason: `Final consonant "${cUnit}": the krus-kudlit (virama), introduced by Spanish friars in 1620, cancels the inherent "a" so the syllable ends on the bare consonant.`,
            });
            syllableScript += info.glyph + o.viramaChar;
          } else {
            parts.push({ glyph: cUnit, label: `"${cUnit}" — no Baybayin equivalent`, reason: 'This letter has no matching Baybayin character and was passed through unchanged.' });
            syllableScript += cUnit;
          }
        }
      }
    }

    glyphSyllables.push({ latin: original, script: syllableScript, parts });
    script += syllableScript;
  }

  return {
    original: rawWord,
    processed: word,
    preprocessNotes: Array.from(preprocessNotes),
    onc: tokens
      .filter((t): t is Extract<SyllableToken, { type: 'syllable' }> => t.type === 'syllable')
      .map(t => ({ onset: t.onset, nucleus: t.nucleus, coda: t.coda, original: t.original })),
    syllables: glyphSyllables,
    script,
  };
}
