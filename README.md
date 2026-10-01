# Baybayin Live

Baybayin Live deterministically converts Latin text into Baybayin script using known language rules and present-day Filipino practices. Users can type Filipino, English, and Spanish words from the same input box. Upon conversion, it lists every rule it applies, word by word, allowing users to see how words are converted, and learn more about Baybayin and its rules.

<img width="1692" height="1059" alt="Screenshot 2026-09-04 at 15 36 15" src="https://github.com/user-attachments/assets/8e746baf-ce16-4d6b-83c8-c84d396f6dbb" />

## What it does

The app detects the language of each word. It then sends the word through one of three pipelines:

- **Filipino** words keep their spelling. The app applies the KWF glide rules to them.
- **English** words go by pronunciation, not by spelling. The app looks the word up in the CMU Pronouncing Dictionary. It then respells the sounds into a Filipino-style form.
- **Spanish** words follow the loanword respelling rules of the KWF *Manwal sa Masinop na Pagsulat* (2014).

All three pipelines end in the same syllabifier and the same glyph renderer. Mixed Taglish text needs no language switch.

## Language detection

Every word runs through five ordered checks. The first check that matches decides the language. The word card in the UI names the check that fired.

1. **Curated Filipino vocabulary.** A few hundred function words and common words match here. This list runs first because words such as `at`, `ay`, `may`, `para`, and `ate` are also English dictionary entries.
2. **Curated Spanish vocabulary, ñ, and accents.** A word with `ñ` or an accented vowel is Spanish. English does not spell with them.
3. **CMU Pronouncing Dictionary.** A hit routes the word to the English pipeline.
4. **Spanish-shaped spelling.** Three conditions must hold together. The English dictionary does not know the word. The word contains a letter outside the abakada (`c`, `f`, `j`, `q`, `v`, `x`, `z`), or the digraph `ll` or `rr`. The word ends in a vowel, or in `n`, `s`, `r`, `l`, or `d`.
5. **Fallback.** The app reads anything left as Filipino spelling.

A per-word language switch in the UI overrides the result of these checks.

## English pipeline

1. **Normalize.** Lowercase the word and keep the letters. Apostrophes stay long enough for a dictionary lookup of forms such as `don't`.
2. **Pronounce.** Look the word up in the CMU Pronouncing Dictionary (about 123,000 words). The result is ARPAbet phonemes with stress digits. Unknown words use a small curated list, then letter-to-sound rules. The Details tab marks those results as approximations. The English Bridge panel offers the CMU alternates and an as-spelled reading per word.
3. **Syllabify.** Group the phonemes into onset, nucleus, and coda by onset maximalism. `src/cmuSyllabifier.ts` is a TypeScript port of `cainesap/syllabify`, verified against the Python original over all 123,652 dictionary pronunciations. The port fixes two crashes or duplicate-syllable defects in the reference. The top of that file documents both fixes.
4. **Map sounds.** Respell each phoneme into a sound Baybayin can write. Examples: `f→p`, `v→b`, `z→s`, `th→t`, `j→dy`, `ch→ts`, `sh→sy`. Diphthongs become vowel plus glide. The three vowel classes are `a`, `i/e`, and `u/o`. Reduced vowels take their written value, the way Philippine English says them (`kompyuter`, `kolor`, `doktor`). Words that start with `s` plus a consonant take the prothetic `i` (`school → iskul`). The result is the Latin bridge form.
5. **Render glyphs.** Each syllable becomes glyphs. A consonant character carries the inherent `a`. A kudlit above shifts the vowel to `i/e`, and a kudlit below shifts it to `u/o`. Bare vowels use the independent vowel characters. Final consonants take the krus-kudlit (virama, U+1714).

## Spanish pipeline

1. **Respell by KWF rules.** Ordered grapheme rules turn the Spanish spelling into the Filipino form. Each rule cites its KWF section. A curated list covers lexicalized old loans under §4.3, such as `sibuyas` and `tuwalya`. This pipeline uses no pronunciation dictionary, because Spanish orthography is close to phonemic.
2. **Resolve diphthongs (kambal-patinig).** KWF chapter 5 applies in full. Mid-word, a weak vowel before a strong vowel becomes its glide (`estasyon`). The full glide spelling stays in the first syllable (§5.1), after a consonant cluster (§5.2), after `h` (§5.3), and word-finally under stress (§5.4). Strong-vowel pairs take no glide (§5.5).
3. **Render glyphs.** The respelled word uses the same syllabifier and renderer as the other pipelines.

## Settings

| Setting | Effect |
|---|---|
| Modern Ra | Use ᜍ for `r`. When off, `d` and `r` share the traditional ᜇ. |
| Dictionary cleanup | Normalize known Filipino forms before rendering. |
| Drop final codas | Pre-colonial style. Omit final consonants instead of marking them with a virama. |
| Native punctuation | Write the single danda ᜵ and the double danda ᜶ in place of comma and period. |

## Tabs

- **Translate** — input, output, and a card per word with its language, notes, and adaptations.
- **Display** — the output on its own, for reading or for a screenshot.
- **Details** — every stage of every word, including each rule that fired.
- **Chart** — the character chart, with a description per glyph.
- **History** — earlier translations from this session.
- **About** — the method, the sources, and the known limits.

## Project layout

| Path | Contents |
|---|---|
| `src/App.tsx` | The whole UI. Tabs, settings, word cards, and the English Bridge panel. |
| `src/baybayinEngine.ts` | Filipino syllabifier, glyph tables, and the renderer. |
| `src/baybayinPhonetic.ts` | English pipeline. ARPAbet to Latin bridge mapping, with a note per lossy substitution. |
| `src/cmuSyllabifier.ts` | Port of the Caines/Evans onset-maximalism syllabifier. |
| `src/cmudict.ts` | Loader and parser for the CMU dictionary. |
| `src/languageDetect.ts` | The five ordered detection checks. |
| `src/spanishRespeller.ts` | KWF Spanish respelling rules. |
| `src/types.ts` | Shared types, including the trace types the Details tab reads. |
| `server.ts` | Express server. Vite middleware in development, static files in production. |
| `scripts/kwf-check.ts` | KWF adherence checks. |
| `public/cmudict-0.7a.txt` | The CMU Pronouncing Dictionary, v0.7a. About 3.7 MB. |

The dictionary is the largest asset, and every English word waits for it. `index.html` preloads it, and the server compresses it with gzip.

## Sources

- [CMU Pronouncing Dictionary v0.7a](http://www.speech.cs.cmu.edu/cgi-bin/cmudict) — English pronunciations.
- [cainesap/syllabify](https://github.com/cainesap/syllabify) — the syllabification algorithm, by Caines and Evans.
- [OED, Philippine English pronunciation](https://www.oed.com/information/understanding-entries/pronunciation/world-englishes/philippine-english/) — the basis for spelling-aware vowels.
- [KWF Ortograpiyang Pambansa (2013)](https://kwf.gov.ph/wp-content/uploads/Ortograpiyang_Pambansa_1.pdf) — respelling conventions.
- [KWF Manwal sa Masinop na Pagsulat (2014)](https://kwf.gov.ph/wp-content/uploads/MMP_Full.pdf) — the rulebook for the Spanish pipeline.
- [Unicode Tagalog block, U+1700–U+171F](https://www.unicode.org/charts/PDF/U1700.pdf) — the glyphs.

## Known limits

- Language detection is deterministic, not omniscient. A word such as `para` exists in all three languages. It routes by the fixed precedence above, and it may need the per-word switch.
- Letter-to-sound rules are approximations. The Details tab marks every word that used them.
- Spelling-aware vowels do not apply when a word's spelling cannot be aligned with its syllables. Pure phonetics decides in that case.
- Where Philippine English respelling and Taglish pronunciation disagree (`kolor` against `kaler`), the app follows the spelling.
- Baybayin is a Tagalog script. This app does not cover the other Philippine scripts.

## Contributing

Report a word that converts incorrectly, and name the expected output. Corrections to a respelling rule are the most useful contribution. Add a case to `scripts/kwf-check.ts` with every rule change.
