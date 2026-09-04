// ============================================================
// spanishRespeller.ts — Spanish → Filipino respelling per the
// KWF Manwal sa Masinop na Pagsulat (2014).
//
// Spanish orthography is near-phonemic, so unlike the English
// path no pronunciation dictionary is needed: ordered grapheme
// rules (each citing its KWF section) turn the Spanish spelling
// into the Filipino form the manual prescribes, and the existing
// engine then renders that form in Baybayin. A small curated list
// covers lexicalized old loans (§4.3) the rules cannot derive.
// ============================================================

import { Consideration, SyllableToken } from './types';
import { syllabifyWord } from './baybayinEngine';
import { stripAccents } from './languageDetect';

export interface SpanishWordAnalysis {
  original: string;
  normalized: string;
  /** Final Filipino respelling — the Latin bridge fed to the renderer. */
  latin: string;
  source: 'curated' | 'rules';
  syllables: { onset: string; nucleus: string; coda: string; latin: string }[];
  considerations: Consideration[];
}

// ─── Curated lexicalized forms (KWF §4.3) ────────────────────
// Old Spanish loans whose established abakada spelling the manual
// treats as fixed and which the grapheme rules cannot derive
// (vowel shifts, metathesis, dropped letters).

// Null prototype: looked up with raw user input, so a plain object literal
// would answer "constructor"/"__proto__" with inherited members.
const CURATED_FORMS: Record<string, { latin: string; note: string }> =
  Object.assign(Object.create(null), {
    caballo:     { latin: 'kabayo',     note: 'Old loan (KWF §4.3): "caballo" was assimilated as "kabayo" — the LL became Y in this early borrowing, unlike the later LL → LY pattern.' },
    cebolla:     { latin: 'sibuyas',    note: 'Old loan (KWF §4.3): "cebolla(+s)" was assimilated as "sibuyas", with the plural S fused into the word.' },
    cebollas:    { latin: 'sibuyas',    note: 'Old loan (KWF §4.3): "cebolla(+s)" was assimilated as "sibuyas", with the plural S fused into the word.' },
    celaje:      { latin: 'silahis',    note: 'Old loan (KWF §4.3): "celaje(+s)" was assimilated as "silahis".' },
    celajes:     { latin: 'silahis',    note: 'Old loan (KWF §4.3): "celaje(+s)" was assimilated as "silahis".' },
    candela:     { latin: 'kandila',    note: 'Old loan (KWF §4.3): "candela" was assimilated as "kandila", with E shifting to I.' },
    ventana:     { latin: 'bintana',    note: 'Old loan (KWF §4.2): "ventana" was assimilated as "bintanà", with E shifting to I.' },
    confesar:    { latin: 'kumpisal',   note: 'Old loan (KWF §7.3): "confesar" was assimilated as "kumpisal" — CON- became KUM- before P, and the vowels shifted.' },
    prejuicio:   { latin: 'perwisyo',   note: 'Old loan (KWF §5.3): "prejuicio" was assimilated as "perwisyo", with the weak H of the J sound vanishing entirely.' },
    septiembre:  { latin: 'setyembre',  note: 'Old loan (KWF §5.4): "septiembre" is written "Setyembre" — the P before T is not sounded.' },
    chineguelas: { latin: 'sinigwelas', note: 'Old loan (KWF §5): "chineguelas" was assimilated as "sinigwelas", with CH softening to S.' },
    chismes:     { latin: 'tsismis',    note: 'Old loan (KWF §6.3): "chismes" was assimilated as "tsismis", with the E closing to I.' },
    toalla:      { latin: 'tuwalya',    note: 'Old loan (KWF §5.1): "toalla" is written "tuwalya" — the O weakened to U and takes the W glide.' },
    baul:        { latin: 'baul',       note: 'KWF §5.5: "baúl" keeps its two vowel syllables (ba·ul) because the stress falls on the U — the AU → AW contraction only applies when the first vowel is stressed.' },
    economia:    { latin: 'ekonomiya',  note: 'KWF §5.4: word-final stressed -ÍA keeps both vowels with a Y glide — "ekonomiya" names the discipline; the contracted "ekonomya" drifted to mean thriftiness.' },
    filosofia:   { latin: 'pilosopiya', note: 'KWF §5.4: word-final stressed -ÍA keeps both vowels with a Y glide — "pilosopiya" names the discipline; "pilosopya" drifted to mean sophistry.' },
    geografia:   { latin: 'heograpiya', note: 'KWF §5.4: word-final stressed -ÍA keeps both vowels with a Y glide ("heograpiya").' },
    poesia:      { latin: 'poesiya',    note: 'KWF §5.5: "poesía" is written "poesiya" — the stressed final -ÍA keeps both vowels with a Y glide.' },
  });

// ─── §4.12: Spanish H is silent — except in these families ───
// humano and historia (and their derivatives) keep the H so they
// are not mistaken for look-alike words ("umano", "istorya").

const H_RETAINED = /^(human|histor)/;

// Consonants for diphthong-context checks. Excludes Y and W (they
// are already glides) but includes ñ, which is a consonant.

const SPANISH_CONSONANT = /[b-df-hj-np-tvzñ]/;

/**
 * KWF ch. 5 kambal-patinig: a weak vowel (I/U) before a strong
 * vowel is replaced by its glide (Y/W) — "estacion" → "estasyon" —
 * EXCEPT in four contexts where the vowel is kept and the glide
 * inserted instead: the word's first syllable (§5.1 "piyano"),
 * after a consonant cluster (§5.2 "aksiyon"), after H (§5.3
 * "kolehiyo"), and word-finally when the weak vowel is stressed
 * (§5.4 "ekonomiya", handled via the accent mark).
 */
function resolveDiphthongs(word: string, notes: Consideration[]): string {
  const push = (detail: string) => notes.push({ stage: 'map', detail });

  const resolve = (w: string, weakRe: RegExp, glide: string): string =>
    w.replace(weakRe, (match, c: string, weak: string, strong: string, offset: number, str: string) => {
      const stressed = weak === 'í' || weak === 'ú';
      const atEnd = offset + match.length === str.length;
      const afterCluster = SPANISH_CONSONANT.test(str[offset - 1] ?? '');
      const isFirstSyllable = offset === 0;
      const afterH = c.toLowerCase() === 'h';

      if (isFirstSyllable || afterCluster || afterH || (stressed && atEnd)) {
        const why = isFirstSyllable
          ? 'the diphthong is in the word\'s first syllable (KWF §5.1: "piyano", "tiya")'
          : afterH
            ? 'the diphthong follows H, which would vanish without its own vowel (KWF §5.3: "kolehiyo", "rehiyon")'
            : afterCluster
              ? 'the diphthong follows a consonant cluster (KWF §5.2: "aksiyon", "impiyerno")'
              : 'the weak vowel is stressed at the end of the word (KWF §5.4: "ekonomiya")';
        push(`Diphthong kept whole: "${c}${weak}${strong}" becomes "${c}${weak}${glide}${strong}" — ${why}.`);
        return `${c}${weak}${glide}${strong}`;
      }

      push(`Diphthong contracted: "${c}${weak}${strong}" becomes "${c}${glide}${strong}" — mid-word the weak vowel ${weak.toUpperCase()} is replaced by its glide (KWF §5 general rule: "estasyon", "tenyente", "agwador").`);
      return `${c}${glide}${strong}`;
    });

  let w = word;
  // Word-initial weak vowel + strong vowel: the glide replaces it
  // outright ("hielo" → (h dropped) "ielo" → "yelo", KWF §4.12).
  w = w.replace(/^([ií])([aeouáéóú])/, (_, weak, strong) => {
    push(`Word-initial "${weak}${strong}" becomes "y${strong}" — with no consonant to lean on, the weak vowel turns into its glide (KWF §4.12: "hielo" → "yelo").`);
    return `y${strong}`;
  });
  w = w.replace(/^([uú])([aeiáéí])/, (_, weak, strong) => {
    push(`Word-initial "${weak}${strong}" becomes "w${strong}" — with no consonant to lean on, the weak vowel turns into its glide.`);
    return `w${strong}`;
  });
  // I before another vowel, then U before another vowel. Two passes
  // so sequences like "iu" ("ciudad" → "siyudad") resolve too.
  w = resolve(w, /([b-df-hj-np-tvzñ])([ií])([aeouáéóú])/g, 'y');
  w = resolve(w, /([b-df-hj-np-tvzñ])([uú])([aeiáéí])/g, 'w');
  return w;
}

/**
 * Respell a Spanish word into its Filipino form per the KWF
 * Manwal sa Masinop na Pagsulat, recording every rule that fired.
 */
export function analyzeSpanishWord(word: string): SpanishWordAnalysis {
  const considerations: Consideration[] = [];
  const normalized = word.trim().toLowerCase().replace(/[^a-zñáéíóúü]/g, '');
  const lookupKey = stripAccents(normalized).replace(/ñ/g, 'n');

  if (normalized !== word.trim()) {
    considerations.push({
      stage: 'normalize',
      detail: `"${word.trim()}" normalized to "${normalized}" (lowercased, letters only — Baybayin has no capitalization).`,
    });
  }

  const finish = (latin: string, source: 'curated' | 'rules'): SpanishWordAnalysis => {
    const syllables = syllabifyWord(latin)
      .filter((t): t is Extract<SyllableToken, { type: 'syllable' }> => t.type === 'syllable')
      .map(t => ({ onset: t.onset, nucleus: t.nucleus, coda: t.coda, latin: t.original }));
    return { original: word, normalized, latin, source, syllables, considerations };
  };

  // ── Curated lexicalized old loans (§4.3) ─────────────────────
  const curated = CURATED_FORMS[lookupKey];
  if (curated) {
    considerations.push({ stage: 'map', detail: curated.note });
    return finish(curated.latin, 'curated');
  }

  let w = normalized;
  const apply = (re: RegExp, replacement: string, note: string) => {
    if (re.test(w)) {
      w = w.replace(re, replacement);
      considerations.push({ stage: 'map', detail: note });
    }
  };

  // ── Ordered grapheme rules ───────────────────────────────────
  apply(/^ps/, 's', 'Initial PS- loses its silent P, as Spanish itself pronounces it ("psicologo" → "sikologo", KWF §4.10).');
  apply(/ch/g, 'ts', 'CH is written TS, the long-standing Filipino rendering of this sound (KWF §6.3: "letson" for lechon, "tsismis" for chismes).');

  // §4.12: Spanish H is silent, so it is dropped — unless the word
  // belongs to the humano/historia families, which keep it.
  if (/h/.test(w)) {
    if (H_RETAINED.test(lookupKey)) {
      considerations.push({
        stage: 'map',
        detail: 'The H is kept even though Spanish does not sound it — KWF §4.12 retains it in the "humano" and "historia" families so they are not mistaken for look-alike words ("umano", "istorya").',
      });
    } else {
      apply(/h/g, '', 'The silent Spanish H is dropped (KWF §4.12: "hielo" → "yelo", "hora" → "oras", "hacienda" → "asyenda").');
    }
  }

  apply(/ll/g, 'ly', 'LL is written LY (KWF §4.2 "kalye" for calle; §5.5 "kawdilyo", "brilyante").');
  apply(/rr/g, 'r', 'The trilled RR is written as a single R ("barrio" → "baryo", "guitarra" → "gitara") — Filipino does not double consonants.');
  apply(/^con(?=[bfpv])/, 'kum', 'CON- before B/F/P/V becomes KUM- — the N assimilates to M and the O closes to U (KWF §7.3: "kumbento", "kumbensiyon", "kumpeti").');
  // G before E/I must be resolved before the silent U of GUE/GUI is
  // dropped, or "guitarra" would surface a false G+I and become "hitara".
  apply(/g(?=[eiéí])/g, 'h', 'G before E/I carries the Spanish /h/ sound and is written H (KWF §5.3 examples: "region" → "rehiyon", "colegio" → "kolehiyo", "magia" → "mahiya").');
  apply(/gü(?=[ei])/g, 'gw', 'GÜ before E/I is written GW — the diaeresis marks a sounded U.');
  apply(/gu(?=[ei])/g, 'g', 'The silent U of GUE/GUI is dropped (KWF §4.5 practice: "guitarra" → "gitara", "guerra" → "gera").');
  apply(/qu(?=[ei])/g, 'k', 'QU before E/I is written K (KWF §4.5: "queso" → "keso").');
  apply(/qu/g, 'kw', 'QU before A/O is written KW (KWF §4.5).');
  apply(/q/g, 'k', 'Q is written K (KWF §4.5).');
  apply(/c(?=[eiéí])/g, 's', 'C before E/I sounds as S and is written S (KWF §4.5: "ciudad" → "siyudad").');
  apply(/c/g, 'k', 'C elsewhere sounds as K and is written K (KWF §4.5: "coche" → "kotse").');
  apply(/j/g, 'h', 'The Spanish J sounds as /h/ and is written H (KWF §4.13: "justo" → "husto", "juez" → "huwes").');
  apply(/v/g, 'b', 'V is written B — Filipino has no /v/ (KWF §4.2: "bentana" practice, "birtud" for virtud).');
  apply(/z/g, 's', 'Z is written S — Filipino has no /z/ (KWF §4.2: "sapatos" for zapatos, "sona" for zona).');
  apply(/f/g, 'p', 'F is written P — the abakada practice the KWF documents (§4.2: "porma" for forma, "puwersa" for fuerza).');
  apply(/x/g, 'ks', 'X is written KS (KWF §4.5: "ekstra" for extra).');
  apply(/n(?=[bp])/g, 'm', 'N assimilates to M before B/P (KWF §7.3: "impiyerno" from infierno, "kumbento" from convento).');
  apply(/([bdgkpstmn])\1/g, '$1', 'A doubled consonant is written once — Filipino spelling does not double consonants.');
  apply(/n(?=[gk])/g, 'ng', 'N before G/K is written NG, the Filipino nasal assimilation ("engkuwentro" from encuentro, "bangko" from banco; KWF §5.2 example "lengguwahe").');

  // ── Falling diphthongs (§5.5, §4.11) ─────────────────────────
  apply(/([aeo])i(?![aeiouáéíóú])/g, '$1y', 'A falling diphthong closes with Y ("veinte" → "beynte", "treinta" → "treynta"; KWF §4.11 spells Spanish numbers this way).');
  apply(/([aeo])u(?![aeiouáéíóú])/g, '$1w', 'The AU diphthong closes with W when the first vowel carries the stress (KWF §5.5: "bawtismo", "awditoryo", "kawdilyo").');

  // Ñ already carries the /nj/ glide, so a weak I after it merges
  // into the Ñ instead of doubling the glide ("compañia" →
  // "kompanya", the KWF §5 example — not "kompanyya").
  apply(/ñ[ií](?=[aeouáéóú])/g, 'ñ', 'The weak I after Ñ merges into the Ñ, which already carries the Y glide (KWF §5: "compañia" → "kompanya").');

  // ── Rising diphthongs: KWF ch. 5 kambal-patinig rules ────────
  w = resolveDiphthongs(w, considerations);

  apply(/ñ/g, 'ny', 'Ñ is written NY (KWF §4.5: "donya" for doña, "pinya" for piña, "banyo" for baño).');

  const unaccented = stripAccents(w);
  if (unaccented !== w) {
    considerations.push({
      stage: 'map',
      detail: 'Accent marks are dropped — Baybayin does not mark stress, though the KWF recommends tuldik in Latin-script Filipino (§10).',
    });
    w = unaccented;
  }

  return finish(w, 'rules');
}
