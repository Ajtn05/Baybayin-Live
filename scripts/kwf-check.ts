// ============================================================
// kwf-check.ts — KWF Manwal sa Masinop na Pagsulat adherence
// checks across all three pipelines, plus language detection.
// Run with:  npx tsx scripts/kwf-check.ts
// ============================================================

import { readFileSync } from 'fs';
import { parseCmuDict, installCmuDict } from '../src/cmudict';
import { detectWordLanguage } from '../src/languageDetect';
import { analyzeSpanishWord } from '../src/spanishRespeller';
import { analyzeEnglishWord } from '../src/baybayinPhonetic';
import { analyzeWordGlyphs } from '../src/baybayinEngine';

installCmuDict(parseCmuDict(readFileSync(new URL('../public/cmudict-0.7a.txt', import.meta.url), 'utf8')));

let failures = 0;
function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} ${actual.padEnd(16)}${ok ? '' : ` (expected ${expected})`}`);
}

// ── Filipino path: KWF ch. 5 kambal-patinig ──────────────────
console.log('\n=== FILIPINO PATH (glide spelling, KWF ch. 5) ===');
const filipinoCases: [string, string][] = [
  ['kwento', 'kuwento'],     // §5.1 first syllable spelled in full
  ['sya', 'siya'],           // §5.1
  ['leksyon', 'leksiyon'],   // §5.2 after cluster
  ['kolehyo', 'kolehiyo'],   // §5.3 after H
  ['kompanya', 'kompanya'],  // §5 general rule: compact stays
  ['akasya', 'akasya'],      // §5 general rule
  ['banyo', 'banyo'],        // §5 general rule
  ['dyip', 'dyip'],          // §4.13 digraph dy stays compact
  ['teatro', 'teatro'],      // §5.5 strong vowels take no glide
  ['leon', 'leon'],          // §5.5
  ['maria', 'mariya'],       // §5.5 weak-vowel hiatus glide
];
for (const [input, expected] of filipinoCases) {
  check(`filipino ${input}`, analyzeWordGlyphs(input, {}).processed, expected);
}

// ── English path: KWF §§4.7, 6.1–6.3, 7.2 ───────────────────
console.log('\n=== ENGLISH PATH (respelling, KWF §4.7/§6/§7.2) ===');
const englishCases: [string, string][] = [
  ['school', 'iskul'],       // §7.2/§4.7 prothetic i
  ['style', 'istayl'],       // §7.2/§4.7
  ['smart', 'ismart'],       // §7.2/§4.7
  ['aspect', 'aspek'],       // §6.2 no KT coda
  ['correct', 'korek'],      // §6.2
  ['desk', 'desk'],          // §6.1 SK coda allowed
  ['test', 'test'],          // §6.1 ST coda allowed
  ['jeep', 'dyip'],          // §4.13
  ['teacher', 'titser'],     // §6.3 ch → ts
  ['marathon', 'maraton'],   // §6.5 th → t
];
for (const [input, expected] of englishCases) {
  check(`english ${input}`, analyzeEnglishWord(input).latin, expected);
}

// ── Spanish path: KWF §§4.3–4.13, ch. 5, §6.3, §7.3 ──────────
console.log('\n=== SPANISH PATH (respelling, KWF §4/§5/§7.3) ===');
const spanishCases: [string, string][] = [
  ['cuento', 'kuwento'],         // §4.5 c→k + §5.1
  ['queso', 'keso'],             // §4.5 qu→k
  ['ciudad', 'siyudad'],         // §4.5 c→s + §5.1
  ['lechon', 'letson'],          // §6.3 ch→ts
  ['chismes', 'tsismis'],        // §6.3 curated (e→i is lexical)
  ['hacienda', 'asyenda'],       // §4.12 silent H + §5 general
  ['hora', 'ora'],               // §4.12
  ['hielo', 'yelo'],             // §4.12 + word-initial glide
  ['humano', 'humano'],          // §4.12 H retained
  ['historia', 'historya'],      // §4.12 H retained + §5 general
  ['justo', 'husto'],            // §4.13 j→h
  ['juez', 'huwes'],             // §4.13 + §5.1
  ['zapatos', 'sapatos'],        // §4.2 z→s
  ['guitarra', 'gitara'],        // silent u + rr→r
  ['guerra', 'gera'],            // silent u + rr→r
  ['barrio', 'baryo'],           // rr→r + §5 general
  ['caballo', 'kabayo'],         // §4.3 curated old loan
  ['cebollas', 'sibuyas'],       // §4.3 curated old loan
  ['accion', 'aksiyon'],         // §5.2 after cluster
  ['leccion', 'leksiyon'],       // §5.2
  ['estacion', 'estasyon'],      // §5 general rule
  ['teniente', 'tenyente'],      // §5 general rule
  ['beneficio', 'benepisyo'],    // §5 general rule
  ['aguador', 'agwador'],        // §5 general rule
  ['individual', 'indibidwal'],  // §5 general rule
  ['piano', 'piyano'],           // §5.1
  ['fuerza', 'puwersa'],         // §5.1 + f→p, z→s
  ['viuda', 'biyuda'],           // §5.1 + v→b
  ['buitre', 'buwitre'],         // §5.1
  ['hostia', 'ostiya'],          // §4.12 + §5.2
  ['infierno', 'impiyerno'],     // §7.3 n→m + §5.2
  ['influencia', 'impluwensiya'],// §7.3 + §5.2 twice
  ['encuentro', 'engkuwentro'],  // nasal ng + §5.2
  ['colegio', 'kolehiyo'],       // g→h + §5.3
  ['region', 'rehiyon'],         // g→h + §5.3
  ['magia', 'mahiya'],           // g→h + §5.3
  ['economia', 'ekonomiya'],     // §5.4 curated
  ['familia', 'pamilya'],        // §5 general (unstressed final ia)
  ['comedia', 'komedya'],        // §5 general
  ['cristiano', 'kristiyano'],   // §5.2
  ['sentencia', 'sentensiya'],   // §5.2
  ['zarzuela', 'sarsuwela'],     // §5.2
  ['pasion', 'pasyon'],          // §5 general
  ['calvario', 'kalbaryo'],      // §5 general
  ['bautismo', 'bawtismo'],      // §5.5 au→aw
  ['auditorio', 'awditoryo'],    // §5.5
  ['caudillo', 'kawdilyo'],      // §5.5 + ll→ly
  ['baul', 'baul'],              // §5.5 stress on U — no contraction (curated)
  ['veinte', 'beynte'],          // §4.11 falling diphthong
  ['treinta', 'treynta'],        // §4.11
  ['convento', 'kumbento'],      // §7.3 con→kum
  ['convencion', 'kumbensiyon'], // §7.3 + §5.2
  ['confeti', 'kumpeti'],        // §7.3
  ['compañia', 'kompanya'],      // §5 general (ñ carries the glide)
  ['señora', 'senyora'],         // §4.5 ñ→ny
  ['baño', 'banyo'],             // §4.5
  ['brillante', 'brilyante'],    // ll→ly
  ['estrella', 'estrelya'],      // ll→ly
  ['calle', 'kalye'],            // §4.2
  ['toalla', 'tuwalya'],         // §5.1 curated
  ['escuela', 'eskuwela'],       // §7.2 Spanish keeps initial E + §5.2
  ['virtud', 'birtud'],          // §4.8
  ['extra', 'ekstra'],           // §4.5 x→ks
  ['septiembre', 'setyembre'],   // §5.4 curated (silent p)
  ['jamon', 'hamon'],            // §4.2
  ['cheque', 'tseke'],           // §4.2
  ['gracias', 'grasyas'],        // c→s + §5 general
];
for (const [input, expected] of spanishCases) {
  check(`spanish ${input}`, analyzeSpanishWord(input).latin, expected);
}

// ── Language detection ───────────────────────────────────────
console.log('\n=== LANGUAGE DETECTION ===');
const detectCases: [string, string][] = [
  ['ang', 'filipino'], ['para', 'filipino'], ['may', 'filipino'],
  ['at', 'filipino'], ['ate', 'filipino'], ['kumusta', 'filipino'],
  ['mabuhay', 'filipino'], ['kaibigan', 'filipino'], ['maganda', 'filipino'],
  ['computer', 'english'], ['psychology', 'english'], ['school', 'english'],
  ['friend', 'english'], ['doctor', 'english'],
  ['corazon', 'spanish'], ['corazón', 'spanish'], ['niño', 'spanish'],
  ['lechuga', 'spanish'], ['cuento', 'spanish'], ['quiero', 'spanish'],
  ['hacienda', 'spanish'], ['fiesta', 'spanish'],
  ['florecita', 'spanish'],       // shape rule: c + Spanish ending, not in CMU
  ['takdanglaw', 'filipino'],     // unknown abakada-only word → as-spelled fallback
];
for (const [input, expected] of detectCases) {
  const d = detectWordLanguage(input);
  check(`detect ${input}`, d.lang, expected);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
