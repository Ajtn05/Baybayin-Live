// ============================================================
// cmuSyllabifier.ts — TypeScript port of cainesap/syllabify
// (syllable3.py, Anthony Evans / Andrew Caines).
//
// Faithful to the reference implementation, including its quirky
// "index computed on the original cluster, slice applied to the
// current cluster" semantics in onset rule 6, which the reference
// relies on for words like "heartbreak".
//
// Two reference bugs are deliberately fixed (both verified against
// the Python original on 2026-07-09):
//   1. Crash (AttributeError) when a consonant cluster follows a
//      syllable that has an onset but no nucleus yet, e.g.
//      "ungrateful" (N G split by the NG-substring cluster rule).
//      Here the trailing cluster is appended to that onset instead.
//   2. Duplicate syllables: check_last_syllable pushes the previous
//      syllable once per absorbed phoneme, so "text" prints its one
//      syllable twice and "angst" three times. Here it is kept once.
// ============================================================

export interface CmuSyllable {
  onset: string[];   // consonant phonemes, no stress digits
  nucleus: string;   // vowel phoneme, no stress digit
  stress: string;    // '0' | '1' | '2' | ''
  coda: string[];    // consonant phonemes, no stress digits
}

export const CMU_VOWELS = new Set([
  'AO', 'UW', 'EH', 'AH', 'AA', 'IY', 'IH', 'UH',
  'AE', 'AW', 'AY', 'ER', 'EY', 'OW', 'OY',
]);

export const CMU_CONSONANTS = new Set([
  'CH', 'DH', 'HH', 'JH', 'NG', 'SH', 'TH', 'ZH',
  'Z', 'S', 'P', 'R', 'K', 'L', 'M', 'N',
  'F', 'G', 'D', 'B', 'T', 'V', 'W', 'Y',
]);

interface ClassifiedPhoneme {
  phoneme: string;          // stress digit stripped
  stress: string;           // '' for consonants
  isVowel: boolean;
}

function classify(raw: string): ClassifiedPhoneme | null {
  const match = raw.match(/^([A-Z]+)([012])?$/);
  if (!match) return null;
  const [, phoneme, stress] = match;
  if (CMU_VOWELS.has(phoneme)) return { phoneme, stress: stress ?? '', isVowel: true };
  if (CMU_CONSONANTS.has(phoneme)) return { phoneme, stress: '', isVowel: false };
  return null;
}

// ─── Cluster grouping (cluster_fact) ─────────────────────────
// Consonants merge into one cluster; vowels always stand alone.
// Reference quirk kept: once the running cluster's concatenated
// string contains "NG" (either the NG phoneme or an adjacent
// N + G pair), the next consonant starts a fresh cluster.

interface PhonemeCluster {
  isVowel: boolean;
  phonemes: ClassifiedPhoneme[];
}

function groupClusters(phonemes: ClassifiedPhoneme[]): PhonemeCluster[] {
  const clusters: PhonemeCluster[] = [];
  for (const ph of phonemes) {
    const last = clusters[clusters.length - 1];
    const canMerge =
      last &&
      !last.isVowel &&
      !ph.isVowel &&
      !last.phonemes.map(p => p.phoneme).join('').includes('NG');
    if (canMerge) {
      last.phonemes.push(ph);
    } else {
      clusters.push({ isVowel: ph.isVowel, phonemes: [ph] });
    }
  }
  return clusters;
}

// ─── Onset rules (onset_rules) ───────────────────────────────

const RULE3_FIRST = new Set(['B', 'D', 'G', 'K', 'P', 'T', 'DH', 'F', 'S', 'SH', 'TH', 'V', 'ZH', 'M', 'N']);
const RULE4_SECOND = new Set(['B', 'M', 'V', 'D', 'N', 'Z', 'ZH', 'R', 'Y']);
const RULE5_SECOND = new Set(['L', 'R', 'W', 'Y']);

/**
 * Split an intervocalic consonant cluster into (coda, onset) exactly
 * the way the reference does. `trace` receives one line per rule fired.
 */
export function splitIntervocalicCluster(
  clusterPhonemes: string[],
  trace?: string[],
): { coda: string[]; onset: string[] } {
  // `original` mirrors the reference's list_of_phonemes default binding:
  // rule indexes are looked up here, never in the mutated cluster.
  const original = [...clusterPhonemes];
  let current = [...clusterPhonemes];   // cluster.phoneme_list
  let view = [...clusterPhonemes];      // the reassigned list_of_phonemes name
  const coda: string[] = [];

  // _split_and_update: index from `original`, slice applied to `current`
  const splitAndUpdate = (phoneme: string) => {
    const index = original.indexOf(phoneme);
    coda.push(...current.slice(0, index));
    current = current.slice(index);
    view = original.slice(index);
  };

  // _remove_and_update: first of `current` to coda; view resets to original[1:]
  const removeAndUpdate = () => {
    if (current.length) coda.push(current[0]);
    current = current.slice(1);
    view = original.slice(1);
  };

  // Rule 1 — /NG/ can never sit in an onset.
  // Reference quirk kept: this moves the FIRST phoneme of the cluster to
  // the coda and then skips every later rule (its phoneme list variable
  // degenerates to a 1-character string).
  if (current.includes('NG')) {
    removeAndUpdate();
    trace?.push('/NG/ can never begin a syllable — moved to the coda of the previous syllable (rule 1).');
    return { coda, onset: current };
  }

  // Rules 2a/2b — affricates cannot follow another consonant in an onset.
  if (view.includes('CH')) {
    const before = current.slice(0, original.indexOf('CH'));
    splitAndUpdate('CH');
    if (before.length) trace?.push(`[${before.join(' ')}] moved to coda: the affricate /CH/ cannot follow another consonant in an onset (rule 2a).`);
  }
  if (view.includes('JH')) {
    const before = current.slice(0, original.indexOf('JH'));
    splitAndUpdate('JH');
    if (before.length) trace?.push(`[${before.join(' ')}] moved to coda: the affricate /JH/ cannot follow another consonant in an onset (rule 2b).`);
  }

  // Rule 3 — first consonant of a complex onset must be an obstruent or nasal.
  if (view.length > 1 && !RULE3_FIRST.has(view[0])) {
    trace?.push(`/${view[0]}/ moved to coda: the first consonant of a complex onset must be an obstruent or nasal (rule 3).`);
    removeAndUpdate();
  }

  // Rule 4 — unless the cluster starts with /S/, the second consonant
  // must be a voiced obstruent, nasal, /R/ or /Y/.
  if (view.length > 1 && view[0] !== 'S' && !RULE4_SECOND.has(view[1])) {
    trace?.push(`/${view[0]}/ moved to coda: in a non-/S/ onset the second consonant must be a voiced obstruent, nasal, /R/ or /Y/ — /${view[1]}/ is not (rule 4).`);
    removeAndUpdate();
  }

  // Rule 5 — in a two-consonant non-/S/ onset the second consonant
  // must be a liquid or glide.
  if (view.length > 1 && view[0] !== 'S' && !RULE5_SECOND.has(view[1]) && view.length < 3) {
    trace?.push(`/${view[0]}/ moved to coda: in a two-consonant non-/S/ onset the second consonant must be a liquid or glide — /${view[1]}/ is not (rule 5).`);
    removeAndUpdate();
  }

  // Rule 6 — compound-friendly splits for N|D..., T|B..., TH|B... clusters
  // (endless, undress, heartbreak, grandmother, toothbrush, handbag).
  if (view.length > 2 && ['N', 'T', 'TH'].includes(view[0]) && ['D', 'B'].includes(view[1])) {
    if (['R', 'T'].includes(view[0]) && view[1] === 'B' && view[2] === 'R') {
      trace?.push(`Cluster split before /${view[0]}/: compound boundary pattern like "heartbreak" (rule 6).`);
      splitAndUpdate(view[0]);
    } else if (view[0] === 'TH') {
      trace?.push(`Cluster split before /${view[1]}/: compound boundary pattern like "toothbrush" (rule 6).`);
      splitAndUpdate(view[1]);
    } else if (view[0] === 'N' || ['L', 'M'].includes(view[2])) {
      if (view[1] === 'D' && view[2] === 'R') {
        trace?.push(`Cluster split before /${view[1]}/: compound boundary pattern like "undress" (rule 6).`);
        splitAndUpdate(view[1]);
      } else {
        trace?.push(`Cluster split before /${view[2]}/: compound boundary pattern like "endless" or "handbag" (rule 6).`);
        splitAndUpdate(view[2]);
      }
    }
  }

  return { coda, onset: current };
}

// ─── Syllable assembly (syllable_fact + check_last_syllable) ──

interface BuildingSyllable {
  onset: ClassifiedPhoneme[];
  nucleus: ClassifiedPhoneme | null;
  coda: ClassifiedPhoneme[];
}

/**
 * Syllabify a CMU/ARPAbet phoneme sequence (stress digits allowed)
 * into onset–nucleus–coda syllables, following cainesap/syllabify.
 * Unknown phonemes are ignored. `trace` collects human-readable
 * decisions for the Details page.
 */
export function syllabifyCmuPhonemes(rawPhonemes: string[], trace?: string[]): CmuSyllable[] {
  const phonemes = rawPhonemes
    .map(classify)
    .filter((p): p is ClassifiedPhoneme => p !== null);

  if (phonemes.length === 0) return [];

  const clusters = groupClusters(phonemes);
  const syllables: BuildingSyllable[] = [{ onset: [], nucleus: null, coda: [] }];

  for (const cluster of clusters) {
    const cur = syllables[syllables.length - 1];

    if (cluster.isVowel) {
      const vowel = cluster.phonemes[0];
      if (cur.nucleus) {
        syllables.push({ onset: [], nucleus: vowel, coda: [] });
      } else {
        cur.nucleus = vowel;
      }
      continue;
    }

    // Consonant cluster
    if (!cur.nucleus) {
      // Before any vowel: everything joins the pending onset.
      // (Reference crashes when cur already has an onset here — e.g.
      // "ungrateful" — appending instead is the deliberate fix.)
      if (cur.onset.length > 0 && trace) {
        trace.push(`[${cluster.phonemes.map(p => p.phoneme).join(' ')}] appended to the pending onset (the reference implementation crashes on this pattern).`);
      }
      cur.onset.push(...cluster.phonemes);
      continue;
    }

    if (cur.coda.length > 0) {
      syllables.push({ onset: [...cluster.phonemes], nucleus: null, coda: [] });
      continue;
    }

    const names = cluster.phonemes.map(p => p.phoneme);
    const { coda, onset } = splitIntervocalicCluster(names, trace);
    if (names.length > 1 && trace) {
      trace.push(`Between-vowel cluster [${names.join(' ')}] → coda [${coda.join(' ') || '∅'}] + next onset [${onset.join(' ') || '∅'}] (onset maximalism).`);
    }
    // The rules always move a (possibly empty) prefix of the cluster to
    // the coda and leave the suffix as the next onset.
    cur.coda = cluster.phonemes.slice(0, coda.length);
    syllables.push({ onset: cluster.phonemes.slice(coda.length), nucleus: null, coda: [] });
  }

  // check_last_syllable: absorb a nucleus-less trailing syllable into the
  // previous syllable's coda. (Fixed: the reference pushes the previous
  // syllable once per absorbed phoneme, duplicating whole syllables.)
  const last = syllables[syllables.length - 1];
  if (!last.nucleus && syllables.length > 1) {
    syllables.pop();
    const prev = syllables[syllables.length - 1];
    if (last.onset.length > 0 || last.coda.length > 0) {
      prev.coda.push(...last.onset, ...last.coda);
      trace?.push(`Word-final consonants [${[...last.onset, ...last.coda].map(p => p.phoneme).join(' ')}] had no vowel of their own — absorbed into the previous syllable's coda.`);
    }
  }

  return syllables
    .filter(s => s.nucleus || s.onset.length > 0 || s.coda.length > 0)
    .map(s => ({
      onset: s.onset.map(p => p.phoneme),
      nucleus: s.nucleus?.phoneme ?? '',
      stress: s.nucleus?.stress ?? '',
      coda: s.coda.map(p => p.phoneme),
    }));
}
