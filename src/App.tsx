import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  RotateCcw,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  BAYBAYIN_CHART_DATA,
  DICTIONARY,
  KUDLIT_ABOVE,
  KUDLIT_BELOW,
  VIRAMA_UNICODE,
  analyzeWordGlyphs,
  syllabifyWord,
  translateLatinToBaybayin,
} from './baybayinEngine';
import {
  EnglishWordAnalysis,
  NUCLEUS_CHOICES,
  PronunciationSource,
  VOWELS as ARPA_VOWELS,
  WordReading,
  analyzeEnglishWord,
} from './baybayinPhonetic';
import { CmuDictStatus, cmuDictSize, cmuDictStatus, loadCmuDict } from './cmudict';
import { detectWordLanguage, stripAccents } from './languageDetect';
import { SpanishWordAnalysis, analyzeSpanishWord } from './spanishRespeller';
import { Consideration, WordGlyphAnalysis, WordLang } from './types';

type Tab = 'translate' | 'display' | 'details' | 'chart' | 'history' | 'about';

interface HistoryItem {
  id: string;
  input: string;
  output: string;
  createdAt: string;
}

interface EngineSettings {
  useRa: boolean;
  dropFinalConsonants: boolean;
  useDictionary: boolean;
}

const SOURCE_LABELS: Record<PronunciationSource, string> = {
  cmu: 'CMU dictionary',
  dictionary: 'curated',
  rules: 'G2P rules',
  spelled: 'as spelled',
};

const LANG_LABELS: Record<WordLang, string> = {
  filipino: 'Filipino',
  english: 'English',
  spanish: 'Spanish',
};

// Per-word reading choices, keyed by the word's letters:
// 'cmu:0' (default pronunciation), 'cmu:1'… (alternates), 'spelled'.
type Readings = Record<string, string>;
// Per-word, per-syllable manual vowel choices (ARPAbet vowel per index).
type NucleusEdits = Record<string, Record<number, string>>;
// Per-word manual language choice, outranking auto-detection.
type LangOverrides = Record<string, WordLang>;

// The "w:" prefix namespaces the key: without it a word like "constructor"
// or "__proto__" would read an Object.prototype member back out of these
// plain-object state maps instead of undefined.
function readingKey(word: string): string {
  return 'w:' + stripAccents(word.toLowerCase()).replace(/ñ/g, 'n').replace(/[^a-z]/g, '');
}

function parseReading(value?: string): WordReading | undefined {
  if (!value || value === 'cmu:0') return undefined;
  if (value === 'spelled') return { asSpelled: true };
  return { pronunciationIndex: Number(value.split(':')[1] ?? 0) };
}

function composeReading(readings: Readings, edits: NucleusEdits, word: string): WordReading | undefined {
  const key = readingKey(word);
  const base = parseReading(readings[key]);
  const nucleusOverrides = edits[key];
  if (!nucleusOverrides || Object.keys(nucleusOverrides).length === 0) return base;
  return { ...base, nucleusOverrides };
}

// Word tokens include accented letters and ñ so Spanish input
// ("corazón", "niño") stays whole.
const WORD_CHAR = /[A-Za-zÀ-ɏ]/;

function splitInput(text: string) {
  return text.match(/[A-Za-zÀ-ɏ']+|[^A-Za-zÀ-ɏ']+/g) ?? [];
}

/** One input word routed through its detected (or overridden) pipeline. */
interface BridgeWord {
  original: string;
  /** Language the word is actually routed through. */
  lang: WordLang;
  /** What auto-detection said, regardless of any override. */
  autoLang: WordLang;
  reason: string;
  overridden: boolean;
  /** Baybayin-safe respelling fed to the renderer. */
  latin: string;
  english?: EnglishWordAnalysis;
  spanish?: SpanishWordAnalysis;
}

function computeBridgeWord(token: string, readings: Readings, edits: NucleusEdits, langOverrides: LangOverrides): BridgeWord {
  const detection = detectWordLanguage(token);
  const override = langOverrides[readingKey(token)];
  const lang = override ?? detection.lang;
  const base = {
    original: token,
    lang,
    autoLang: detection.lang,
    reason: override
      ? `Language set to ${LANG_LABELS[override]} manually — auto-detection said ${LANG_LABELS[detection.lang]}.`
      : detection.reason,
    overridden: Boolean(override),
  };

  if (lang === 'english') {
    const analysis = analyzeEnglishWord(token, composeReading(readings, edits, token));
    return { ...base, latin: analysis.latin, english: analysis };
  }
  if (lang === 'spanish') {
    const analysis = analyzeSpanishWord(token);
    return { ...base, latin: analysis.latin, spanish: analysis };
  }
  // Filipino needs no bridge — the engine's own preprocessing
  // (loan letters, KWF glide spelling) handles it downstream.
  return { ...base, latin: stripAccents(token).replace(/ñ/gi, 'ny') };
}

// Analysis is a pure function of (word, its overrides, dictionary state), and
// the same words recur constantly — across keystrokes, across the Translate /
// Display / Details tabs, and within one text. Memoizing it turns a keystroke
// into work on the edited word only, and the stable object identity lets the
// word cards below skip re-rendering entirely.
const ANALYSIS_CACHE_LIMIT = 2000;
const bridgeWordCache = new Map<string, BridgeWord>();
const glyphCache = new Map<string, WordGlyphAnalysis>();

function cached<T>(store: Map<string, T>, key: string, compute: () => T): T {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  // Cheap bound: a long editing session drops the whole cache rather than
  // tracking recency for what is only a recomputation cost.
  if (store.size >= ANALYSIS_CACHE_LIMIT) store.clear();
  store.set(key, value);
  return value;
}

function analyzeBridgeWord(token: string, readings: Readings, edits: NucleusEdits, langOverrides: LangOverrides): BridgeWord {
  const key = readingKey(token);
  const wordEdits = edits[key];
  const cacheKey = `${cmuDictStatus()}|${token}|${readings[key] ?? ''}|${langOverrides[key] ?? ''}|${
    wordEdits ? JSON.stringify(wordEdits) : ''
  }`;
  return cached(bridgeWordCache, cacheKey, () => computeBridgeWord(token, readings, edits, langOverrides));
}

/** Memoized `analyzeWordGlyphs` — same reasoning as `analyzeBridgeWord`. */
function analyzeGlyphs(latin: string, useRa: boolean, dropFinalConsonants: boolean, useDictionary: boolean): WordGlyphAnalysis {
  return cached(glyphCache, `${latin}|${useRa}|${dropFinalConsonants}|${useDictionary}`, () =>
    analyzeWordGlyphs(latin, { useRa, dropFinalConsonants, useDictionary, viramaChar: VIRAMA_UNICODE }),
  );
}

/** Shared empty maps, so a word with no overrides keeps a stable prop identity. */
const NO_EDITS: Record<number, string> = {};

function buildBridge(text: string, readings: Readings, edits: NucleusEdits, langOverrides: LangOverrides) {
  const words: BridgeWord[] = [];
  const mappedText = splitInput(text)
    .map(token => {
      if (!WORD_CHAR.test(token)) return token;
      const word = analyzeBridgeWord(token, readings, edits, langOverrides);
      words.push(word);
      return word.latin;
    })
    .join('');

  return { mappedText, words };
}

export default function App() {
  const [inputText, setInputText] = useState('kumusta, computer, corazón');
  // The textarea stays on `inputText` so typing is never held up; every
  // derived analysis reads `sourceInput`, which React re-computes at a lower
  // priority. On a long paragraph this is the difference between a laggy
  // caret and a smooth one.
  const sourceInput = useDeferredValue(inputText);
  const [activeTab, setActiveTab] = useState<Tab>('translate');
  const [useRa, setUseRa] = useState(true);
  const [nativePunctuation, setNativePunctuation] = useState(true);
  const [useDictionary, setUseDictionary] = useState(true);
  const [dropFinalConsonants, setDropFinalConsonants] = useState(false);
  const [fontSize, setFontSize] = useState(52);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cmuStatus, setCmuStatus] = useState<CmuDictStatus>('loading');
  const [readings, setReadings] = useState<Readings>({});
  const [nucleusEdits, setNucleusEdits] = useState<NucleusEdits>({});
  const [langOverrides, setLangOverrides] = useState<LangOverrides>({});

  const chooseLang = useCallback((word: string, lang: WordLang, autoLang: WordLang) =>
    setLangOverrides(current => {
      const key = readingKey(word);
      const next = { ...current };
      // Picking the auto-detected language again clears the override.
      if (lang === autoLang) delete next[key];
      else next[key] = lang;
      return next;
    }), []);

  const chooseReading = useCallback((word: string, value: string) => {
    setReadings(current => ({ ...current, [readingKey(word)]: value }));
    // A different reading changes the syllable layout, so its manual
    // vowel edits no longer line up — drop them.
    setNucleusEdits(current => {
      const next = { ...current };
      delete next[readingKey(word)];
      return next;
    });
  }, []);

  const editNucleus = useCallback((word: string, syllableIndex: number, vowel: string | null) =>
    setNucleusEdits(current => {
      const key = readingKey(word);
      const forWord = { ...(current[key] ?? {}) };
      if (vowel === null) delete forWord[syllableIndex];
      else forWord[syllableIndex] = vowel;
      return { ...current, [key]: forWord };
    }), []);

  useEffect(() => {
    loadCmuDict()
      .then(() => setCmuStatus('ready'))
      .catch(() => setCmuStatus('error'));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('baybayin_history_v2');
    if (!saved) return;
    try {
      setHistory(JSON.parse(saved));
    } catch {
      localStorage.removeItem('baybayin_history_v2');
    }
  }, []);

  // cmuStatus is a dependency so detection and English analyses re-run
  // once the CMU Pronouncing Dictionary finishes loading.
  const bridge = useMemo(
    () => buildBridge(sourceInput, readings, nucleusEdits, langOverrides),
    [sourceInput, cmuStatus, readings, nucleusEdits, langOverrides],
  );
  const sourceText = bridge.mappedText;

  const translationResult = useMemo(() => {
    const result = translateLatinToBaybayin(sourceText, {
      useRa,
      nativePunctuation,
      useDictionary,
      dropFinalConsonants,
      viramaChar: VIRAMA_UNICODE,
    });

    const detected = bridge.words.filter(w => w.lang !== 'filipino');
    if (detected.length > 0 && sourceInput.trim()) {
      return {
        ...result,
        notes: [
          `Each word's language is detected automatically (${bridge.words.map(w => `${w.original}: ${LANG_LABELS[w.lang]}`).join(', ')}) — English and Spanish words are respelled into a Baybayin-safe Latin bridge first.`,
          `Baybayin-safe Latin bridge: ${sourceText || 'none'}`,
          ...result.notes,
        ],
      };
    }

    return result;
  }, [bridge.words, dropFinalConsonants, sourceInput, nativePunctuation, sourceText, useDictionary, useRa]);

  const oncRows = useMemo(
    () =>
      bridge.words.flatMap(word => {
        if (word.english) {
          return word.english.syllables.map(s => ({
            source: word.original,
            onset: s.onset || '-',
            nucleus: s.nucleus || '-',
            coda: s.coda || '-',
            latin: s.latin,
          }));
        }
        const lower = word.latin.toLowerCase();
        const normalized = useDictionary && DICTIONARY[lower] ? DICTIONARY[lower].standard : lower;
        const syllables = word.spanish
          ? word.spanish.syllables
          : syllabifyWord(normalized).flatMap(s =>
              s.type === 'syllable' ? [{ onset: s.onset, nucleus: s.nucleus, coda: s.coda, latin: s.original }] : [],
            );
        return syllables.map(s => ({
          source: word.original,
          onset: s.onset || '-',
          nucleus: s.nucleus || '-',
          coda: s.coda || '-',
          latin: s.latin,
        }));
      }),
    [bridge.words, useDictionary],
  );

  useEffect(() => {
    if (!sourceInput.trim() || !translationResult.text.trim()) return;
    const timer = window.setTimeout(() => {
      setHistory(current => {
        if (current[0]?.input === sourceInput.trim()) return current;
        const next = [
          {
            id: crypto.randomUUID(),
            input: sourceInput.trim(),
            output: translationResult.text,
            createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
          ...current,
        ].slice(0, 12);
        localStorage.setItem('baybayin_history_v2', JSON.stringify(next));
        return next;
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [sourceInput, translationResult.text]);

  // One stable object per settings change, so the Display and Details tabs'
  // memoized work is not invalidated by every unrelated re-render.
  const settings = useMemo<EngineSettings>(
    () => ({ useRa, dropFinalConsonants, useDictionary }),
    [useRa, dropFinalConsonants, useDictionary],
  );

  const copyOutput = async () => {
    await navigator.clipboard.writeText(translationResult.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadSvg = () => {
    const safeInput = sourceInput.replace(/[<>&]/g, '');
    const safeOutput = translationResult.text.replace(/[<>&]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <rect width="1200" height="720" fill="#ffffff"/>
  <rect x="72" y="72" width="1056" height="576" fill="#ffffff" stroke="#d9d9d9"/>
  <text x="112" y="148" fill="#1a1a1a" font-family="Georgia, serif" font-size="28" font-style="italic">Baybayin Live</text>
  <text x="600" y="360" fill="#1a1a1a" font-family="'Noto Sans Tagalog', sans-serif" font-size="92" text-anchor="middle">${safeOutput}</text>
  <text x="600" y="470" fill="#7e7e7e" font-family="Arial, sans-serif" font-size="26" letter-spacing="4" text-anchor="middle">${safeInput}</text>
</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'baybayin-transliteration.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('baybayin_history_v2');
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-2xl font-normal tracking-tight sm:text-[1.7rem]">Baybayin Live</h1>
            <span className="font-baybayin text-xl text-gray">ᜊᜌ᜔ᜊᜌᜒᜈ᜔</span>
          </div>

          <nav className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {(['translate', 'display', 'details', 'chart', 'history', 'about'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-1 text-[11px] font-normal uppercase tracking-[0.3em] transition ${
                  activeTab === tab ? 'border-b border-ink text-ink' : 'border-b border-transparent text-gray hover:text-ink'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {activeTab === 'translate' && (
          <div className="space-y-6">
            <section className="overflow-hidden border border-line bg-paper shadow-sm">
              <div className="grid lg:grid-cols-2">
                <div className="flex min-w-0 flex-col p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="pb-1 text-[11px] font-normal uppercase tracking-[0.3em] text-gray">
                      Filipino / English / Spanish — detected per word
                    </span>
                    <button
                      onClick={() => setInputText('')}
                      className="inline-flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-[0.3em] text-gray transition hover:text-ink"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  </div>

                  <textarea
                    value={inputText}
                    onChange={event => setInputText(event.target.value)}
                    spellCheck={false}
                    placeholder="Type Filipino, English, or Spanish — mix freely…"
                    className="min-h-52 w-full min-w-0 grow resize-none bg-transparent text-lg leading-8 text-ink outline-none placeholder:text-gray/60"
                  />

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-gray">
                    <span>{inputText.length} characters</span>
                    <span>
                      {cmuStatus === 'ready' && `CMU dictionary · ${cmuDictSize().toLocaleString()} words`}
                      {cmuStatus === 'loading' && 'Loading CMU dictionary…'}
                      {cmuStatus === 'error' && 'CMU dictionary unavailable — rule-based fallback'}
                    </span>
                  </div>
                </div>

                <div className="relative flex min-w-0 flex-col bg-ink p-5 text-paper sm:p-6">
                  <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 select-none font-baybayin text-[11rem] leading-none text-paper/5">
                    ᜊ
                  </span>

                  <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-[11px] font-normal uppercase tracking-[0.3em] text-paper/60">Baybayin</h2>
                    <label className="flex items-center gap-2 text-xs text-paper/60">
                      Size
                      <input
                        type="range"
                        min="32"
                        max="82"
                        value={fontSize}
                        onChange={event => setFontSize(Number(event.target.value))}
                        className="h-1 w-24 accent-paper"
                      />
                    </label>
                  </div>

                  <div className="relative flex min-h-52 grow items-center justify-center py-2 text-center">
                    <div className="max-w-full break-words font-baybayin leading-relaxed tracking-wide [overflow-wrap:anywhere]" style={{ fontSize }}>
                      {translationResult.text || <span className="font-sans text-base text-paper/40">Your Baybayin appears here.</span>}
                    </div>
                  </div>

                  <div className="relative mt-4 flex flex-wrap gap-2 border-t border-ink-soft pt-4">
                    <button
                      onClick={copyOutput}
                      disabled={!translationResult.text}
                      className="inline-flex flex-1 items-center justify-center gap-2 bg-paper px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.25em] text-ink transition hover:bg-line disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={downloadSvg}
                      disabled={!translationResult.text}
                      className="inline-flex flex-1 items-center justify-center gap-2 border border-ink-soft px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.25em] text-paper/90 transition hover:border-paper/50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      SVG
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Try</span>
              {[
                'mabuhay',
                'psychology',
                'corazón',
                'kwento',
                'hacienda',
                'mag-aral',
                'banyo',
                'salamat sa lahat, my friend',
              ].map(example => (
                <button
                  key={example}
                  onClick={() => setInputText(example)}
                  className="border border-line bg-paper px-3.5 py-1.5 text-sm font-medium text-ink/80 transition hover:border-ink hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>

            <section className="border border-line bg-paper p-5">
              <div className="mb-4 flex items-center gap-2">
                <Settings className="h-4 w-4 text-ink" />
                <h2 className="text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Settings</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Toggle label="Modern Ra" detail="Use ᜍ for R instead of traditional Da/Ra sharing." checked={useRa} onChange={setUseRa} />
                <Toggle label="Native punctuation" detail="Map commas and periods to ᜵ and ᜶." checked={nativePunctuation} onChange={setNativePunctuation} />
                <Toggle label="Dictionary cleanup" detail="Normalize known Filipino forms before rendering." checked={useDictionary} onChange={setUseDictionary} />
                <Toggle label="Drop final codas" detail="Use pre-colonial-style omitted final consonants." checked={dropFinalConsonants} onChange={setDropFinalConsonants} />
              </div>
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <section className="min-w-0 border border-line bg-paper p-5">
                <h2 className="mb-4 text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Word Bridge</h2>
                <div className="space-y-3">
                  {bridge.words.length === 0 && (
                    <p className="text-sm text-gray">Type a word to see its detected language and respelling.</p>
                  )}
                  {bridge.words.map((word, index) => (
                    <BridgeWordCard
                      key={`${word.original}-${index}`}
                      word={word}
                      reading={readings[readingKey(word.original)] ?? 'cmu:0'}
                      edits={nucleusEdits[readingKey(word.original)] ?? NO_EDITS}
                      onChooseLang={chooseLang}
                      onChooseReading={chooseReading}
                      onEditNucleus={editNucleus}
                    />
                  ))}
                </div>
              </section>

              <div className="min-w-0">
                <TracePanel
                  rows={oncRows}
                  notes={translationResult.notes}
                  syllables={translationResult.syllables}
                  onShowDetails={() => setActiveTab('details')}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'display' && (
          <DisplayTab
            inputText={sourceInput}
            settings={settings}
            nativePunctuation={nativePunctuation}
            cmuStatus={cmuStatus}
            readings={readings}
            nucleusEdits={nucleusEdits}
            langOverrides={langOverrides}
          />
        )}

        {activeTab === 'details' && (
          <DetailsTab
            inputText={sourceInput}
            settings={settings}
            cmuStatus={cmuStatus}
            readings={readings}
            nucleusEdits={nucleusEdits}
            langOverrides={langOverrides}
            onShowAbout={() => setActiveTab('about')}
          />
        )}

        {activeTab === 'chart' && <ChartTab useRa={useRa} />}

        {activeTab === 'about' && <AboutTab />}

        {activeTab === 'history' && (
          <section className="border border-line bg-paper p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Recent Transliterations</h2>
              <button onClick={clearHistory} className="inline-flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-[0.25em] text-gray transition hover:text-ink">
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {history.length === 0 && <p className="text-sm text-gray">No saved history yet.</p>}
              {history.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setInputText(item.input);
                    setActiveTab('translate');
                  }}
                  className="border border-line bg-paper p-4 text-left transition hover:border-ink hover:bg-ghost"
                >
                  <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-gray">
                    <span>{item.createdAt}</span>
                  </div>
                  <div className="mt-2 font-semibold">{item.input}</div>
                  <div className="mt-2 break-words font-baybayin text-3xl text-ink [overflow-wrap:anywhere]">{item.output}</div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <p className="border-t border-line pt-4 text-xs leading-5 text-gray">
          Deterministic Baybayin transliteration (or an attempt at it anyways) · English pronunciation from the CMU Pronouncing Dictionary,
          syllabified after Caines &amp; Evans (thank you to a random forum poster who linked this), respelled the way Filipino borrows English words.
        </p>
      </footer>
    </div>
  );
}

/**
 * Per-word reading switch. Each option is labeled by how it actually
 * sounds (its syllabified respelling, e.g. "i·lay" vs "e·li"), with a
 * small tag naming where it comes from.
 */
function ReadingSwitch({
  word,
  value,
  onChange,
}: {
  word: EnglishWordAnalysis;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => {
    const preview = (reading?: WordReading) => {
      const syllables = analyzeEnglishWord(word.original, reading).syllables;
      return syllables.map(s => s.latin).filter(Boolean).join('·');
    };
    const list = Array.from({ length: Math.max(word.alternates, 1) }, (_, i) => ({
      value: `cmu:${i}`,
      label: preview(i === 0 ? undefined : { pronunciationIndex: i }),
      tag: i === 0 ? (word.alternates > 0 ? 'english' : 'rules') : `alt ${i + 1}`,
    }));
    const spelled = { value: 'spelled', label: preview({ asSpelled: true }), tag: 'spelled' };
    // Skip the as-spelled option only if it duplicates an existing reading.
    if (!list.some(o => o.label === spelled.label)) list.push(spelled);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.original, word.alternates]);

  return (
    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-2.5">
      <span className="text-[10px] uppercase tracking-[0.2em] text-gray/70">Reading</span>
      {options.map((option, index) => (
        <React.Fragment key={option.value}>
          {index > 0 && <span className="text-xs text-line">/</span>}
          <button
            onClick={() => onChange(option.value)}
            className={`pb-0.5 font-mono text-xs transition ${
              value === option.value ? 'border-b border-ink text-ink' : 'border-b border-transparent text-gray hover:text-ink'
            }`}
          >
            {option.label}
            <span className="ml-1.5 font-sans text-[9px] uppercase tracking-[0.15em] text-gray/70">{option.tag}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Per-word language switch: the auto-detected language is tagged
 * "auto"; clicking another language overrides detection for every
 * occurrence of the word, and clicking the auto one restores it.
 */
function LangSwitch({ word, onChange }: { word: BridgeWord; onChange: (lang: WordLang) => void }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-2.5">
      <span className="text-[10px] uppercase tracking-[0.2em] text-gray/70">Language</span>
      {(['filipino', 'english', 'spanish'] as WordLang[]).map((lang, index) => (
        <React.Fragment key={lang}>
          {index > 0 && <span className="text-xs text-line">/</span>}
          <button
            onClick={() => onChange(lang)}
            title={lang === word.lang ? word.reason : `Read "${word.original}" as ${LANG_LABELS[lang]}`}
            className={`pb-0.5 text-xs transition ${
              word.lang === lang ? 'border-b border-ink text-ink' : 'border-b border-transparent text-gray hover:text-ink'
            }`}
          >
            {LANG_LABELS[lang]}
            {lang === word.autoLang && (
              <span className="ml-1.5 font-sans text-[9px] uppercase tracking-[0.15em] text-gray/70">auto</span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * One Word Bridge card: the word, its detected language, its
 * respelling, and — for English — the reading switch plus a
 * per-syllable vowel editor; for Spanish, the KWF rules that fired.
 */
const BridgeWordCard = React.memo(function BridgeWordCard({
  word,
  reading,
  edits,
  onChooseLang,
  onChooseReading,
  onEditNucleus,
}: {
  word: BridgeWord;
  reading: string;
  edits: Record<number, string>;
  onChooseLang: (word: string, lang: WordLang, autoLang: WordLang) => void;
  onChooseReading: (word: string, value: string) => void;
  onEditNucleus: (word: string, syllableIndex: number, vowel: string | null) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const english = word.english;
  const spanishRules = word.spanish?.considerations.filter(c => c.stage === 'map') ?? [];
  const adaptedCount = english
    ? english.considerations.filter(c => c.stage === 'map').length
    : spanishRules.length;
  const editable = english !== undefined && english.source !== 'spelled';
  const selectedEdit = selected !== null ? edits[selected] : undefined;

  return (
    <div className="border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{word.original}</strong>
        <ArrowRight className="h-4 w-4 text-gray/60" />
        <span className="font-mono font-semibold text-ink">{word.latin}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <AdaptedBadge count={adaptedCount} />
          {english && (
            <span className="bg-ghost px-2.5 py-1 text-[10px] font-normal uppercase tracking-[0.2em] text-gray">{SOURCE_LABELS[english.source]}</span>
          )}
          {word.spanish && (
            <span className="bg-ghost px-2.5 py-1 text-[10px] font-normal uppercase tracking-[0.2em] text-gray">
              {word.spanish.source === 'curated' ? 'old loan' : 'KWF rules'}
            </span>
          )}
        </span>
      </div>
      {english && english.source !== 'spelled' && (
        <p className="mt-2 break-words font-mono text-xs text-gray">{english.arpabet || 'No phoneme parse'}</p>
      )}
      <p className="mt-2 text-xs leading-5 text-gray">{word.reason}</p>

      <LangSwitch word={word} onChange={lang => { setSelected(null); onChooseLang(word.original, lang, word.autoLang); }} />

      {english && (
        <ReadingSwitch word={english} value={reading} onChange={value => { setSelected(null); onChooseReading(word.original, value); }} />
      )}

      {word.spanish && spanishRules.length > 0 && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          <span className="text-[10px] uppercase tracking-[0.2em] text-gray/70">KWF respelling rules</span>
          <ul className="mt-1.5 space-y-1">
            {spanishRules.map((rule, index) => (
              <li key={index} className="flex gap-2 text-xs leading-5 text-gray">
                <span className="shrink-0 font-bold text-ink">≈</span>
                <span>{rule.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {word.lang === 'filipino' && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-xs leading-5 text-gray">
          Filipino already fits Baybayin's sound system — the engine applies the KWF glide spelling (kuwento, siya) directly. Details on the Details tab.
        </p>
      )}

      {english && editable && english.syllables.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-2.5">
          <span className="text-[10px] uppercase tracking-[0.2em] text-gray/70">Syllables</span>
          {english.syllables.map((syllable, index) => (
            <button
              key={index}
              onClick={() => setSelected(selected === index ? null : index)}
              className={`pb-0.5 font-mono text-xs transition ${
                selected === index
                  ? 'border-b border-ink text-ink'
                  : edits[index]
                    ? 'border-b border-dotted border-gray text-ink'
                    : 'border-b border-transparent text-gray hover:text-ink'
              }`}
            >
              {syllable.latin || '·'}
              {edits[index] && <span className="ml-0.5 text-gray">*</span>}
            </button>
          ))}
        </div>
      )}

      {english && editable && selected !== null && (
        <div className="mt-2 space-y-1.5 bg-ghost p-2.5">
          {(['short', 'long'] as const).map(kind => (
            <div key={kind} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="w-10 text-[9px] uppercase tracking-[0.2em] text-gray/70">{kind}</span>
              {NUCLEUS_CHOICES.filter(choice => choice.kind === kind).map(choice => (
                <button
                  key={choice.value}
                  title={choice.hint}
                  onClick={() => onEditNucleus(word.original, selected, selectedEdit === choice.value ? null : choice.value)}
                  className={`pb-0.5 font-mono text-xs transition ${
                    selectedEdit === choice.value ? 'border-b border-ink text-ink' : 'border-b border-transparent text-gray hover:text-ink'
                  }`}
                >
                  {choice.latin}
                </button>
              ))}
            </div>
          ))}
          <p className="pt-0.5 text-[10px] leading-4 text-gray">
            Vowel for syllable {selected + 1} of "{word.original}"
            {selectedEdit
              ? ` — set to "${NUCLEUS_CHOICES.find(c => c.value === selectedEdit)?.latin}", ${NUCLEUS_CHOICES.find(c => c.value === selectedEdit)?.hint}. Click it again to reset.`
              : ' — pick a short or long vowel to override this syllable.'}
          </p>
        </div>
      )}
    </div>
  );
});

/**
 * Small badge shown wherever the engine had to adapt a word because
 * Filipino/Baybayin cannot write it faithfully (missing sounds, vowel
 * collapse, inserted vowels, glide respellings). The full list appears
 * in the Adaptations section of the word's Details card.
 */
function AdaptedBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="bg-ghost px-2.5 py-1 text-[10px] font-normal uppercase tracking-[0.2em] text-ink">
      ≈ {count} adapted
    </span>
  );
}

function Toggle({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex gap-3  border p-3 transition ${checked ? 'border-ink/30 bg-ghost' : 'border-line bg-paper'} ${disabled ? 'opacity-45' : 'cursor-pointer hover:border-ink/30'}`}>
      <input className="sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-ink' : 'bg-line'}`}>
        <span className={`h-4 w-4 rounded-full bg-paper transition ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-gray">{detail}</span>
      </span>
    </label>
  );
}

function TracePanel({
  rows,
  notes,
  syllables,
  onShowDetails,
}: {
  rows: { source: string; onset: string; nucleus: string; coda: string; latin: string }[];
  notes: string[];
  syllables: string[];
  onShowDetails: () => void;
}) {
  return (
    <div className="border border-line bg-paper p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Syllable Trace</h2>
        <button
          onClick={onShowDetails}
          className="inline-flex items-center gap-1 text-[11px] font-normal uppercase tracking-[0.25em] text-ink transition hover:text-gray"
        >
          Full details
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {syllables.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {syllables.map((item, index) => (
            <span key={`${item}-${index}`} className="bg-ghost px-2 py-1 font-mono text-xs font-semibold text-ink/70">
              {item}
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-ghost text-[11px] font-normal uppercase tracking-[0.2em] text-gray">
            <tr>
              <th className="px-3 py-2 font-normal">Word</th>
              <th className="px-3 py-2 font-normal">Onset</th>
              <th className="px-3 py-2 font-normal">Nucleus</th>
              <th className="px-3 py-2 font-normal">Coda</th>
              <th className="px-3 py-2 font-normal">Latin bridge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-gray" colSpan={5}>No syllables yet.</td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr key={`${row.source}-${row.latin}-${index}`}>
                <td className="px-3 py-2 font-semibold">{row.source}</td>
                <td className="px-3 py-2 font-mono text-ink">{row.onset}</td>
                <td className="px-3 py-2 font-mono text-ink font-medium">{row.nucleus}</td>
                <td className="px-3 py-2 font-mono text-gray">{row.coda}</td>
                <td className="px-3 py-2 font-mono font-semibold text-ink">{row.latin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {notes.map((note, index) => (
            <p key={`${note}-${index}`} className="bg-ghost px-3 py-2 text-xs leading-5 text-gray">{note}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Display tab: the whole text as an interlinear specimen ───

type DisplayItem =
  | { type: 'word'; word: BridgeWord; glyphs: WordGlyphAnalysis }
  | { type: 'mark'; text: string }
  | { type: 'break' };

function DisplayTab({
  inputText,
  settings,
  nativePunctuation,
  cmuStatus,
  readings,
  nucleusEdits,
  langOverrides,
}: {
  inputText: string;
  settings: EngineSettings;
  nativePunctuation: boolean;
  cmuStatus: CmuDictStatus;
  readings: Readings;
  nucleusEdits: NucleusEdits;
  langOverrides: LangOverrides;
}) {
  const [scale, setScale] = useState(48);

  // cmuStatus is a dependency so English words re-analyze once the
  // CMU Pronouncing Dictionary finishes loading.
  const items = useMemo<DisplayItem[]>(
    () =>
      splitInput(inputText).flatMap<DisplayItem>(token => {
        if (WORD_CHAR.test(token)) {
          const word = analyzeBridgeWord(token, readings, nucleusEdits, langOverrides);
          const glyphs = analyzeGlyphs(
            word.latin,
            settings.useRa,
            settings.dropFinalConsonants,
            word.lang === 'filipino' && settings.useDictionary,
          );
          return [{ type: 'word' as const, word, glyphs }];
        }
        const result: DisplayItem[] = [];
        const marks = token.replace(/\s+/g, '');
        if (marks) result.push({ type: 'mark', text: marks });
        if (token.includes('\n')) result.push({ type: 'break' });
        return result;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputText, settings, cmuStatus, readings, nucleusEdits, langOverrides],
  );

  const wordCount = items.filter(item => item.type === 'word').length;

  if (wordCount === 0) {
    return (
      <section className="border border-line bg-paper p-10 text-center text-sm text-gray">
        Type something in the Translate tab to see it laid out word by word here.
      </section>
    );
  }

  return (
    <section className="border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8">
        <h2 className="text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Interlinear Display</h2>
        <label className="flex items-center gap-2 text-xs text-gray">
          Size
          <input
            type="range"
            min="34"
            max="80"
            value={scale}
            onChange={event => setScale(Number(event.target.value))}
            className="h-1 w-24 accent-ink"
          />
        </label>
      </div>

      <div className="px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-12 sm:gap-x-12">
          {items.map((item, index) => {
            if (item.type === 'break') return <div key={index} className="h-0 basis-full" />;
            if (item.type === 'mark') {
              const text = nativePunctuation
                ? item.text.replace(/[.!?]/g, '᜶').replace(/[,;:]/g, '᜵')
                : item.text;
              return (
                <span key={index} className="-ml-5 font-baybayin leading-none text-gray sm:-ml-8" style={{ fontSize: scale * 0.72 }}>
                  {text}
                </span>
              );
            }
            return <WordSpecimen key={index} word={item.word} glyphs={item.glyphs} scale={scale} />;
          })}
        </div>
      </div>

      <div className="border-t border-line px-5 py-3 sm:px-8">
        <p className="text-[11px] leading-5 text-gray">
          Each word reads top down: the input as typed, its Baybayin-safe Latin bridge, then every syllable above the glyphs
          that write it — so the bottom line is the full Baybayin output. Bridges that changed from the original spelling are
          shown in full ink.
        </p>
      </div>
    </section>
  );
}

/** One word of the interlinear specimen: input, bridge, syllable-over-glyph columns. */
const WordSpecimen = React.memo(function WordSpecimen({ word, glyphs, scale }: { word: BridgeWord; glyphs: WordGlyphAnalysis; scale: number }) {
  const bridged = glyphs.processed;
  const changed = bridged !== word.original.toLowerCase();

  return (
    <div className="flex flex-col" title={`${LANG_LABELS[word.lang]} — ${word.reason}`}>
      <span className="font-serif text-base leading-tight text-ink">{word.original}</span>
      <span className={`mt-1 font-mono text-xs leading-tight ${changed ? 'font-semibold text-ink' : 'text-gray/60'}`}>
        {bridged}
      </span>
      <div className="mt-3.5 flex items-end">
        {glyphs.syllables.map((syllable, index) => (
          <div
            key={index}
            className={`flex flex-col items-center gap-2 px-2 first:pl-0 last:pr-0 ${index > 0 ? 'border-l border-line' : ''}`}
          >
            <span className="font-mono text-[11px] text-gray">{syllable.latin || '·'}</span>
            <span className="font-baybayin leading-none text-ink" style={{ fontSize: scale }}>
              {syllable.script}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

function ChartTab({ useRa }: { useRa: boolean }) {
  const [selected, setSelected] = useState(BAYBAYIN_CHART_DATA[3]);
  const [mark, setMark] = useState<'a' | 'i' | 'u' | 'virama'>('a');
  const base = selected.latin.includes('Ra') && !useRa ? 'ᜇ' : selected.unicode;
  const rendered = selected.type === 'consonant'
    ? base + (mark === 'i' ? KUDLIT_ABOVE : mark === 'u' ? KUDLIT_BELOW : mark === 'virama' ? VIRAMA_UNICODE : '')
    : base;

  return (
    <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="border border-line bg-paper p-5">
        <h2 className="mb-5 text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Baybayin Chart</h2>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
          {BAYBAYIN_CHART_DATA.map(char => (
            <button
              key={char.latin}
              onClick={() => {
                setSelected(char);
                setMark('a');
              }}
              className={` border p-3 text-center transition ${selected.latin === char.latin ? 'border-ink bg-ghost' : 'border-line bg-paper hover:border-ink'}`}
            >
              <span className={`block font-baybayin text-4xl ${selected.latin === char.latin ? 'text-ink' : 'text-ink'}`}>{char.latin.includes('Ra') && !useRa ? 'ᜇ' : char.unicode}</span>
              <span className="mt-2 block text-xs font-bold text-gray">{char.latin}</span>
            </button>
          ))}
        </div>
      </div>
      <aside className="border border-line bg-paper p-5">
        <h2 className="text-[11px] font-normal uppercase tracking-[0.3em] text-gray">Tester</h2>
        <div className="my-5 flex h-40 items-center justify-center bg-ink">
          <span className="font-baybayin text-7xl text-paper">{rendered}</span>
        </div>
        <p className="mb-4 text-sm leading-6 text-gray">{selected.description}</p>
        {selected.type === 'consonant' && (
          <div className="grid grid-cols-2 gap-2">
            {[
              ['a', '-a'],
              ['i', '-i / -e'],
              ['u', '-u / -o'],
              ['virama', 'final consonant'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setMark(value as 'a' | 'i' | 'u' | 'virama')}
                className={`border px-3 py-2 text-sm font-semibold transition ${mark === value ? 'border-ink bg-ghost text-ink' : 'border-line text-ink/70 hover:border-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </aside>
    </section>
  );
}

// ─── Details tab: full per-word transliteration considerations ─

const STAGE_LABELS: Record<Consideration['stage'], string> = {
  detect: 'Language detection',
  normalize: 'Normalization',
  pronounce: 'Pronunciation',
  syllabify: 'Syllabification',
  map: 'Sound mapping',
  render: 'Glyph rendering',
};

function extractWords(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/\s+/)
    .map(token => token.replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ]+$/g, ''))
    .filter(word => {
      const key = word.toLowerCase();
      if (!word || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function DetailsTab({ inputText, settings, cmuStatus, readings, nucleusEdits, langOverrides, onShowAbout }: { inputText: string; settings: EngineSettings; cmuStatus: CmuDictStatus; readings: Readings; nucleusEdits: NucleusEdits; langOverrides: LangOverrides; onShowAbout: () => void }) {
  const words = useMemo(() => extractWords(inputText), [inputText]);

  return (
    <div className="space-y-6">
      <section className="border border-line bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-normal">Word-by-word breakdown</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray">
              One card per word showing every decision made on its way from spelling to Baybayin, in order — starting with which language the word was detected as.
            </p>
          </div>
          <button
            onClick={onShowAbout}
            className="inline-flex items-center gap-1 text-[11px] font-normal uppercase tracking-[0.25em] text-ink transition hover:text-gray"
          >
            Full method &amp; sources
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {words.length === 0 && (
        <section className="border border-line bg-paper p-10 text-center text-sm text-gray">
          Type something in the Translate tab to see a word-by-word breakdown here.
        </section>
      )}

      {words.map(word => (
        <WordDetailCard key={word} word={word} settings={settings} cmuStatus={cmuStatus} reading={readings[readingKey(word)]} edits={nucleusEdits[readingKey(word)]} langOverrides={langOverrides} />
      ))}
    </div>
  );
}

const WordDetailCard = React.memo(function WordDetailCard({ word, settings, cmuStatus, reading, edits, langOverrides }: { word: string; settings: EngineSettings; cmuStatus: CmuDictStatus; reading?: string; edits?: Record<number, string>; langOverrides: LangOverrides }) {
  const detail = useMemo(() => {
    const detection = detectWordLanguage(word);
    const override = langOverrides[readingKey(word)];
    const lang = override ?? detection.lang;
    const reason = override
      ? `Language set to ${LANG_LABELS[override]} manually on the Translate tab — auto-detection said ${LANG_LABELS[detection.lang]}.`
      : detection.reason;
    const base = parseReading(reading);
    const composed = edits && Object.keys(edits).length > 0 ? { ...base, nucleusOverrides: edits } : base;
    const english = lang === 'english' ? analyzeEnglishWord(word, composed) : null;
    const spanish = lang === 'spanish' ? analyzeSpanishWord(word) : null;
    const bridgeWord = english ? english.latin : spanish ? spanish.latin : stripAccents(word.toLowerCase()).replace(/ñ/g, 'ny');
    const glyphs = analyzeWordGlyphs(bridgeWord, {
      useRa: settings.useRa,
      dropFinalConsonants: settings.dropFinalConsonants,
      useDictionary: lang === 'filipino' && settings.useDictionary,
      viramaChar: VIRAMA_UNICODE,
    });
    return { lang, reason, english, spanish, bridgeWord, glyphs };
    // cmuStatus: re-analyze once the CMU dictionary loads
  }, [settings, word, cmuStatus, reading, edits, langOverrides]);

  const { lang, reason, english, spanish, bridgeWord, glyphs } = detail;
  const considerationsFor = (stage: Consideration['stage']) =>
    (english?.considerations ?? spanish?.considerations ?? []).filter(item => item.stage === stage);

  // Everything this word had to bend to fit Filipino's sound system and
  // Baybayin's script: sound-mapping compromises plus glide respellings.
  const adaptations = [
    ...considerationsFor('map').map(c => c.detail),
    ...glyphs.preprocessNotes,
  ];

  let step = 0;
  const nextStep = () => ++step;

  return (
    <section className="border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4">
        <span className="font-serif text-2xl font-normal">{word}</span>
        <ArrowRight className="h-4 w-4 text-gray/60" />
        <span className="font-baybayin text-4xl text-ink">{glyphs.script}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <AdaptedBadge count={adaptations.length} />
          <span className="bg-ghost px-3 py-1 text-[10px] font-normal uppercase tracking-[0.2em] text-gray">
            {LANG_LABELS[lang]}
          </span>
          {english && (
            <span className="bg-ghost px-3 py-1 text-[10px] font-normal uppercase tracking-[0.2em] text-gray">
              pronunciation: {SOURCE_LABELS[english.source]}
            </span>
          )}
          {spanish && (
            <span className="bg-ghost px-3 py-1 text-[10px] font-normal uppercase tracking-[0.2em] text-gray">
              {spanish.source === 'curated' ? 'old loan' : 'KWF rules'}
            </span>
          )}
        </span>
      </div>

      <div className="mt-5 space-y-5">
        <StageSection step={nextStep()} title={STAGE_LABELS.detect}>
          <p className="text-xs leading-5 text-gray">
            Routed through the <span className="font-semibold text-ink">{LANG_LABELS[lang]}</span> pipeline. {reason}
          </p>
        </StageSection>

        {english && (
          <>
            <StageSection step={nextStep()} title={STAGE_LABELS.normalize}>
              {english.normalized !== word.toLowerCase() || considerationsFor('normalize').length > 0 ? (
                <ConsiderationList items={considerationsFor('normalize').map(c => c.detail)} />
              ) : (
                <p className="text-xs leading-5 text-gray">
                  "{word}" only needed lowercasing — Baybayin has no capital letters.
                </p>
              )}
            </StageSection>

            <StageSection step={nextStep()} title={english.source === 'spelled' ? STAGE_LABELS.pronounce : `${STAGE_LABELS.pronounce} (ARPAbet)`}>
              {english.source !== 'spelled' && <PhonemeChips arpabet={english.arpabet} />}
              <ConsiderationList items={considerationsFor('pronounce').map(c => c.detail)} />
            </StageSection>

            <StageSection step={nextStep()} title={`${STAGE_LABELS.syllabify} (onset–nucleus–coda)`}>
              <SyllableTable
                rows={english.syllables.map(s => ({
                  onset: s.onset,
                  nucleus: s.nucleus,
                  coda: s.coda,
                  stress: s.stress,
                  result: s.latin,
                }))}
                resultHeader="Latin bridge"
              />
              <ConsiderationList items={considerationsFor('syllabify').map(c => c.detail)} />
            </StageSection>

            <StageSection step={nextStep()} title={STAGE_LABELS.map}>
              <p className="text-sm">
                Baybayin-safe respelling:{' '}
                <span className="font-mono font-semibold text-ink">{bridgeWord}</span>
              </p>
              {considerationsFor('map').length > 0 ? (
                <ConsiderationList items={considerationsFor('map').map(c => c.detail)} />
              ) : (
                <p className="text-xs leading-5 text-gray">
                  Every sound in this word has a direct Baybayin equivalent — no substitutions were needed.
                </p>
              )}
            </StageSection>
          </>
        )}

        {spanish && (
          <>
            <StageSection step={nextStep()} title={`${STAGE_LABELS.map} (KWF respelling)`}>
              <p className="text-sm">
                Filipino respelling per the KWF Manwal sa Masinop na Pagsulat:{' '}
                <span className="font-mono font-semibold text-ink">{bridgeWord}</span>
              </p>
              {considerationsFor('map').length > 0 ? (
                <ConsiderationList items={considerationsFor('map').map(c => c.detail)} />
              ) : (
                <p className="text-xs leading-5 text-gray">
                  This word's Spanish spelling already matches its Filipino form — no respelling rules needed to fire.
                </p>
              )}
            </StageSection>

            <StageSection step={nextStep()} title={`${STAGE_LABELS.syllabify} (onset–nucleus–coda)`}>
              <SyllableTable
                rows={spanish.syllables.map(s => ({
                  onset: s.onset,
                  nucleus: s.nucleus,
                  coda: s.coda,
                  result: s.latin,
                }))}
                resultHeader="Syllable"
              />
            </StageSection>
          </>
        )}

        {!english && !spanish && (
          <StageSection step={nextStep()} title="Normalization & preprocessing">
            {glyphs.preprocessNotes.length > 0 ? (
              <ConsiderationList items={glyphs.preprocessNotes} />
            ) : (
              <p className="text-xs leading-5 text-gray">
                "{word}" already fits Baybayin's sound inventory — no respelling was needed.
              </p>
            )}
            {glyphs.processed !== word.toLowerCase() && (
              <p className="mt-2 text-sm">
                Processed form: <span className="font-mono font-semibold text-ink">{glyphs.processed}</span>
              </p>
            )}
          </StageSection>
        )}

        {!english && !spanish && (
          <StageSection step={nextStep()} title={`${STAGE_LABELS.syllabify} (onset–nucleus–coda)`}>
            <SyllableTable
              rows={glyphs.onc.map(s => ({
                onset: s.onset,
                nucleus: s.nucleus,
                coda: s.coda,
                result: s.original,
              }))}
              resultHeader="Syllable"
            />
          </StageSection>
        )}

        <StageSection step={nextStep()} title={STAGE_LABELS.render}>
          {(english || spanish) && glyphs.preprocessNotes.length > 0 && <ConsiderationList items={glyphs.preprocessNotes} />}
          <div className="grid gap-3 sm:grid-cols-2">
            {glyphs.syllables.map((syllable, index) => (
              <div key={`${syllable.latin}-${index}`} className="border border-line bg-paper p-3">
                <div className="flex items-baseline gap-3 border-b border-line pb-2">
                  <span className="font-baybayin text-3xl text-ink">{syllable.script}</span>
                  <span className="font-mono text-sm font-semibold text-ink/70">{syllable.latin}</span>
                </div>
                <div className="mt-2.5 space-y-2">
                  {syllable.parts.map((part, partIndex) => (
                    <div key={partIndex} className="flex gap-3">
                      <span className="w-10 shrink-0 text-center font-baybayin text-xl leading-6 text-ink">{part.glyph}</span>
                      <p className="text-xs leading-5 text-gray">
                        <span className="font-semibold text-ink">{part.label}</span> — {part.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </StageSection>
      </div>

      {adaptations.length > 0 && (
        <div className="mt-5 border border-line bg-ghost p-4">
          <h3 className="text-sm font-bold text-ink">≈ Adaptations ({adaptations.length})</h3>
          <p className="mt-1 text-xs leading-5 text-gray">
            Everywhere this word had to bend to fit Filipino's sound system and Baybayin's script.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {adaptations.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs leading-5 text-ink/80">
                <span className="shrink-0 font-bold text-ink">≈</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
});

function StageSection({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="w-7 shrink-0 pt-px text-right font-serif text-base font-normal text-gray">
        {String(step).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1 space-y-2 border-l border-line pl-4">
        <h3 className="text-sm font-medium">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ConsiderationList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="bg-ghost px-3 py-2 text-xs leading-5 text-gray">
          {item}
        </li>
      ))}
    </ul>
  );
}

function PhonemeChips({ arpabet }: { arpabet: string }) {
  const phonemes = arpabet.split(/\s+/).filter(Boolean);
  if (phonemes.length === 0) {
    return <p className="text-xs text-gray">No phonemes could be derived for this word.</p>;
  }
  const hasStress = phonemes.some(p => /\d/.test(p));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {phonemes.map((phoneme, index) => (
          <span
            key={`${phoneme}-${index}`}
            className={`px-2 py-1 font-mono text-xs ${
              ARPA_VOWELS.has(phoneme.replace(/\d/g, '')) ? 'bg-ink text-paper' : 'border border-line bg-paper text-ink'
            }`}
          >
            {phoneme}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-gray/80">
        <span className="font-semibold text-ink">filled</span> = vowel,{' '}
        <span className="font-semibold text-ink">outlined</span> = consonant (CMU ARPAbet phoneme classes)
        {hasStress && '; vowel digits mark stress (1 primary, 2 secondary, 0 unstressed)'}
      </p>
    </div>
  );
}

const STRESS_MARKS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²' };

function SyllableTable({
  rows,
  resultHeader,
}: {
  rows: { onset: string; nucleus: string; coda: string; stress?: string; result: string }[];
  resultHeader: string;
}) {
  const hasStress = rows.some(row => row.stress);
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[380px] text-left text-sm">
        <thead className="bg-ghost text-[11px] font-normal uppercase tracking-[0.2em] text-gray">
          <tr>
            <th className="px-3 py-2 font-normal">#</th>
            <th className="px-3 py-2 font-normal">Onset</th>
            <th className="px-3 py-2 font-normal">Nucleus{hasStress ? ' (stress)' : ''}</th>
            <th className="px-3 py-2 font-normal">Coda</th>
            <th className="px-3 py-2 font-normal">{resultHeader}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="px-3 py-2 text-gray/70">{index + 1}</td>
              <td className="px-3 py-2 font-mono text-ink">{row.onset || '∅'}</td>
              <td className="px-3 py-2 font-mono text-ink font-medium">
                {row.nucleus || '∅'}
                {row.stress && <span className="text-gray/70">{STRESS_MARKS[row.stress] ?? ''}</span>}
              </td>
              <td className="px-3 py-2 font-mono text-gray">{row.coda || '∅'}</td>
              <td className="px-3 py-2 font-mono font-semibold text-ink">{row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ─── About tab: the full method and its sources ───────────────

function AboutTab() {
  return (
    <div className="space-y-6">
      <section className="border border-line bg-paper p-6 sm:p-8">
        <h2 className="font-serif text-2xl font-normal">How Baybayin Live works</h2>
        <p className="mt-3 max-w-full text-sm leading-6 text-gray">
          Baybayin Live is fully deterministic. Every rule that fires is inspectable word by word on the Details tab. There is no language toggle: each word's
          language — Filipino, English, or Spanish — is detected automatically, so Taglish and mixed text just work. Instead of spelling out English words
          letter by letter, they are converted the way Filipino usually borrows English words in practice by
          pronunciation first; Spanish words follow the KWF's own loanword respelling rules. These new 'sound-first' words are then respelled into sounds Baybayin can write.
        </p>
        <p className="mt-3 max-w-full text-sm leading-6 text-gray">
          In full honestly, this was made after reading a twitter thread on Baybayin use that included a very incorrect usage. I noticed
          this came as a result of attempting to write English using Baybayin and so I thought it would be good if we could have a standardized
          way of making use of Baybayin in the modern age. Before anyone says "errr imperial manila smh, baybayin is tagalog-centric..." yes that
          is true and I recognize it and of course I'd want other local scripts to be more known, I think that work has to be done when it comes to
          standardization and the education of said standards. Ideally, we'll all soon be able to embrace our pre-colonial scripts and make use of them,
          but before any of that, let's figure out how to properly adapt an Abugida script into daily use (especcially with our taglish/english tendencies),
          using the most-well known script of the country, and then we can make moves to do the same for other scripts.
        </p>
        <p className="mt-3 max-w-full text-sm leading-6 text-gray">
          In the mean time, we have this. The goal is for people to test it out, see what works best, inform me if any words are converted incorrectly, or if there are 
          any actual experts in Filipino (PLEASE) who can help out with conversion rules, that would be great. Alsooo, name suggstions? Baybayin Live kinda basic im ngl.
          Read more below to see what processes I felt worked best for transliteration, feel free to let me know I'm wrong because I kinda balled it. I'm open to the idea 
          that this is futile and that old scripts are completely unusable beyond traditional Tagalog but hey, knowing why something does not work is still a contribution 
          to our collective body of knowledge.
        </p>
      </section>

      <section className="border border-line bg-paper p-6 sm:p-8">
        <h2 className="mb-5 font-serif text-xl font-normal">One box, three languages: how detection works</h2>
        <p className="mb-5 max-w-3xl text-sm leading-6 text-gray">
          Every word runs through the same ordered, deterministic checks — no statistics, no guessing you can't inspect. The first check that
          matches decides, and the word's card on the Translate tab shows which one it was. When detection gets a word wrong, the card's
          language switch overrides it.
        </p>
        <div className="space-y-5">
          <StageSection step={1} title="Curated Filipino vocabulary">
            <p className="text-sm leading-6 text-gray">
              A few hundred function words and everyday Filipino words are recognized outright. This list runs first because many common
              Filipino words ("at", "ay", "may", "para", "ate") are also English dictionary entries and would otherwise be misread.
            </p>
          </StageSection>
          <StageSection step={2} title="Curated Spanish vocabulary and ñ / accents">
            <p className="text-sm leading-6 text-gray">
              Recognized Spanish words route to the KWF Spanish rules — including every Spanish example the KWF manual itself uses, and
              Spanish words English also borrowed ("hacienda", "fiesta"), which the English dictionary would otherwise claim. A word containing
              ñ or an accented vowel is Spanish outright: English never spells with them.
            </p>
          </StageSection>
          <StageSection step={3} title="English pronouncing dictionary">
            <p className="text-sm leading-6 text-gray">
              A hit in the CMU Pronouncing Dictionary (~123,000 words) routes the word through the English pronunciation-first pipeline.
            </p>
          </StageSection>
          <StageSection step={4} title="Spanish-shaped spelling">
            <p className="text-sm leading-6 text-gray">
              A word the English dictionary doesn't know, containing a letter abakada never uses (c, f, j, q, v, x, z) or the digraphs ll/rr,
              with a Spanish-style ending (a vowel or n, s, r, l, d), is treated as Spanish.
            </p>
          </StageSection>
          <StageSection step={5} title="Fallback: read as Filipino">
            <p className="text-sm leading-6 text-gray">
              Anything left is read as spelled — exactly how Filipino treats unfamiliar words. Names and coinages come out the way a Filipino
              reader would say them.
            </p>
          </StageSection>
        </div>
      </section>

      <section className="border border-line bg-paper p-6 sm:p-8">
        <h2 className="mb-5 font-serif text-xl font-normal">English → Baybayin, in five stages</h2>
        <div className="space-y-5">
          <StageSection step={1} title="Normalize">
            <p className="text-sm leading-6 text-gray">
              The word is lowercased and stripped to letters. Baybayin has no capital letters or punctuation
              inside words. This app keeps apostrophes long enough to look up words like "don't" in the
              pronunciation dictionary.
            </p>
          </StageSection>
          <StageSection step={2} title="Pronounce">
            <p className="text-sm leading-6 text-gray">
              The word is looked up in the CMU Pronouncing Dictionary (~123,000 words), which gives its
              American English pronunciation as ARPAbet phonemes with stress marks. For example, "psychology" becomes
              S&nbsp;AY0&nbsp;K&nbsp;AA1&nbsp;L&nbsp;AH0&nbsp;JH&nbsp;IY0. Words the dictionary does not know fall back to a small
              curated list, then to letter-to-sound rules (flagged as approximations on the Details tab). Words with several valid readings can be switched per word on the English Bridge panel between the dictionary pronunciation, its CMU alternates ("data", "either", "tomato"), and an as-spelled Filipino-style reading ("Eli" as E·li rather than E·lie). Each option is labeled by how it sounds, and individual syllables can be refined further in the syllable editor, choosing among the short and long vowel classes the syllabifier itself uses.
            </p>
          </StageSection>
          <StageSection step={3} title="Syllabify">
            <p className="text-sm leading-6 text-gray">
              Phonemes are grouped into onset–nucleus–coda syllables by onset maximalism: every consonant
              cluster between two vowels is pushed as far into the next syllable's onset as English sound
              patterns allow. The rules include: /ng/ can never begin a syllable; affricates like /ch/ and /j/
              cannot follow another consonant in an onset; three-consonant onsets must begin with /s/ (as in
              "street"); and compound-like clusters split at their natural boundary ("heart·break",
              "hand·bag"). This implementation is a modified port of the Caines/Evans syllabifier, verified against the
              original over all 123,652 dictionary pronunciations.
            </p>
          </StageSection>
          <StageSection step={4} title="Map sounds">
            <p className="text-sm leading-6 text-gray">
              Each phoneme is respelled into Baybayin-writable sounds, following the Komisyon ng Wikang Filipino (KWF)'s Manwal sa Masinop
              na Pagsulat (2014) — the national orthography manual — as the primary rulebook. Consonants
              Baybayin lacks are substituted (f→p, v→b, z→s, th→t, j→dy, ch→ts, sh→sy); diphthongs split
              into vowel + glide (/aɪ/ → "ay"); English's many vowels collapse into Baybayin's three
              (a, i/e, u/o) — but reduced vowels take their written value the way Philippine English
              pronounces them ("kompyuter", "kolor", "doktor", "-syon"). Words that begin with s + consonant
              take the manual's prothetic i ("school" → "iskul", "style" → "istayl"); a final t next to k is
              dropped ("correct" → "korek", "aspect" → "aspek") since the manual accepts sk and st codas but
              not kt; and an extra "e" rescues unwritable word-final piles like "-zed" ("exposed" →
              "ekspowsed"). The result is the Latin bridge — a Filipino-style respelling of the English word.
              Whenever a word needed any such adaptation, an "≈ adapted" badge appears next to it, and its
              Details card lists every adaptation in a dedicated section.
            </p>
          </StageSection>
          <StageSection step={5} title="Render glyphs">
            <p className="text-sm leading-6 text-gray">
              Each syllable becomes glyphs: a consonant character carries the inherent "a" vowel; a kudlit
              above shifts it to i/e, below to u/o; bare vowels use the stand-alone vowel characters. Final
              consonants take the krus-kudlit (virama), the vowel-cancelling mark introduced in 1620, or are
              omitted entirely in the pre-colonial setting, as early writers did. Glide syllables are written
              in full where the KWF manual spells them out ("kuwento", not "kwento"; "leksiyon", not
              "leksyon") and kept compact where it doesn't ("kompanya", "dyip"), rendered there as virama
              clusters.
            </p>
          </StageSection>
        </div>
      </section>

      <section className="border border-line bg-paper p-6 sm:p-8">
        <h2 className="mb-5 font-serif text-xl font-normal">Filipino → Baybayin, in three stages</h2>
        <div className="space-y-5">
          <StageSection step={1} title="Normalize">
            <p className="text-sm leading-6 text-gray">
              Filipino already fits Baybayin's sound system, so only spelling is adjusted: loan letters are
              resolved (c→k, f→p, j→dy, ñ→ny, …) and glide syllables are written in full exactly as per the
              KWF Manwal sa Masinop na Pagsulat. Those in a word's first syllable ("kwento" →
              "kuwento", "sya" → "siya"), after a consonant cluster ("leksyon" → "leksiyon"), or after h.
              While mid-word glides stay compact as the manual writes them ("kompanya", "banyo", "dyip").
            </p>
          </StageSection>
          <StageSection step={2} title="Syllabify">
            <p className="text-sm leading-6 text-gray">
              Words split into onset–nucleus–coda syllables directly from the spelling, with a smoothing glide
              written between adjacent vowels ("Maria" → "Mariya") the way Baybayin was traditionally written.
            </p>
          </StageSection>
          <StageSection step={3} title="Render glyphs">
            <p className="text-sm leading-6 text-gray">
              Identical to English stage 5, all three languages converge on the same glyph renderer, so the same
              settings (Modern Ra, native punctuation, pre-colonial codas) apply throughout.
            </p>
          </StageSection>
        </div>
      </section>

      <section className="border border-line bg-paper p-6 sm:p-8">
        <h2 className="mb-5 font-serif text-xl font-normal">Spanish → Baybayin, in three stages</h2>
        <p className="mb-5 max-w-3xl text-sm leading-6 text-gray">
          The KWF Manwal sa Masinop na Pagsulat devotes real space to Spanish — the manual itself recommends reaching for the Spanish form
          before the English one (§4.8, "Espanyol Muna, Bago Ingles") because Spanish spelling sits far closer to Filipino. Spanish needs no
          pronunciation dictionary: its spelling is nearly phonemic, so ordered respelling rules cover it.
        </p>
        <div className="space-y-5">
          <StageSection step={1} title="Respell per KWF">
            <p className="text-sm leading-6 text-gray">
              Each Spanish grapheme is rewritten to its Filipino value, every rule citing its KWF section: CH → TS ("letson", §6.3); the silent
              H drops ("hacienda" → "asyenda", §4.12) except in the humano/historia families; J → H ("husto", "huwes", §4.13); G before E/I → H
              ("rehiyon", "kolehiyo"); C → S or K by position ("siyudad", "kotse", §4.5); LL → LY ("kalye", "brilyante"); Ñ → NY ("banyo", §4.5);
              V → B, Z → S, F → P (§4.2); QU → K ("keso"); the silent U of GUE/GUI drops ("gitara"); CON- → KUM- before B/P ("kumbento", §7.3);
              and AU → AW ("bawtismo", §5.5). A short curated list covers lexicalized old loans the rules can't derive — "kabayo" (caballo),
              "sibuyas" (cebollas), "tuwalya" (toalla) — per §4.3's deference to long-established forms.
            </p>
          </StageSection>
          <StageSection step={2} title="Resolve diphthongs (kambal-patinig)">
            <p className="text-sm leading-6 text-gray">
              KWF chapter 5's rules apply in full: mid-word, a weak vowel (I/U) before a strong vowel becomes its glide ("estasyon", "tenyente",
              "agwador"), but it is kept — with the glide written in — in the word's first syllable (§5.1 "piyano"), after a consonant cluster
              (§5.2 "aksiyon", "impiyerno"), after H (§5.3 "kolehiyo"), and word-finally under stress (§5.4 "ekonomiya"). Strong-vowel pairs
              take no glide at all (§5.5 "teatro", "leon").
            </p>
          </StageSection>
          <StageSection step={3} title="Render glyphs">
            <p className="text-sm leading-6 text-gray">
              The respelled word goes through the same syllabifier and glyph renderer as Filipino and English. One happy accident of the script:
              the manual's whole E/I and O/U chapter (§7) mostly needs no rules here, because Baybayin writes E and I with one kudlit and O and
              U with another — "estilo" (Spanish) and "istayl" (English) begin with the very same glyph ᜁ.
            </p>
          </StageSection>
        </div>
      </section>

      <section className="border border-line bg-paper p-6 sm:p-8">
        <h2 className="mb-2 font-serif text-xl font-normal">Sources, and how we used them</h2>
        <p className="mb-5 max-w-3xl text-sm leading-6 text-gray">
          This app makes use of a combination of sources to figure out the most appropriate transliteration. Each stage leans on a published source, listed with the exact role it
          plays in the app.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SourceCard title="CMU Pronouncing Dictionary (v0.7a)" href="http://www.speech.cs.cmu.edu/cgi-bin/cmudict" linkLabel="speech.cs.cmu.edu">
            Provides every English pronunciation (stage 2). This app makes use of the exact v0.7a file and use each word's
            first listed pronunciation, keeping its stress digits, which the Details tab shows as superscripts.
          </SourceCard>
          <SourceCard title="cainesap/syllabify — Caines & Evans" href="https://github.com/cainesap/syllabify" linkLabel="github.com/cainesap/syllabify">
            The syllabification algorithm (stage 3). This app makes use of its onset-maximalism rules to run in the
            browser and verified the port against the original Python over all 123,652 dictionary
            pronunciations; excluding crashes or duplicated syllables in the original.
          </SourceCard>
          <SourceCard title="OED — Philippine English pronunciation" href="https://www.oed.com/information/understanding-entries/pronunciation/world-englishes/philippine-english/" linkLabel="oed.com › Philippine English">
            The basis for spelling-aware vowels (stage 4): Philippine English gives reduced vowels their full
            written value ("computer" is said /kompyúter/), so when a word's written vowels align with its
            syllables, the spelling decides how ambiguous vowels are written.
          </SourceCard>
          <SourceCard title="KWF Ortograpiyang Pambansa (2013)" href="https://kwf.gov.ph/wp-content/uploads/Ortograpiyang_Pambansa_1.pdf" linkLabel="kwf.gov.ph (PDF)">
            The national orthography guides the respelling conventions (stages 4–5): glide syllables written
            in full ("siya", "kuwento", "diyamante"), loan-letter substitutions, and the attested loanword
            forms our vowel rules reproduce ("doktor", "propesor", "dolar").
          </SourceCard>
          <SourceCard title="KWF Manwal sa Masinop na Pagsulat (2014)" href="https://kwf.gov.ph/wp-content/uploads/MMP_Full.pdf" linkLabel="kwf.gov.ph (PDF)">
            Complements the Ortograpiyang Pambansa with detailed spelling and syllabication conventions
            (stages 4–5): guidance on hyphenation, prefix and enclitic attachment, and the treatment of
            borrowed words that shapes how respelled syllables are broken and joined. Its Spanish loanword
            rules (§4.3–4.13, ch. 5, §7.3) are the entire rulebook behind the Spanish pipeline.
          </SourceCard>
          <SourceCard title="Unicode Tagalog block (U+1700–171F)" href="https://www.unicode.org/charts/PDF/U1700.pdf" linkLabel="unicode.org (PDF)">
            The glyphs themselves (stage 5): base characters, the kudlit vowel marks, the krus-kudlit virama
            (U+1714) introduced in 1620 for final consonants, and the single and double danda punctuation the
            "native punctuation" setting uses.
          </SourceCard>
          <SourceCard title="Where it can be wrong" href="" linkLabel="">
            Language detection is deterministic, not omniscient — a word like "para" (Filipino, Spanish, and
            English) routes by the fixed precedence and may need the per-word language switch. Letter-to-sound
            fallbacks are approximations; spelling-aware vowels stand down to pure phonetics when a word's
            spelling can't be aligned with its syllables; and where Philippine English respelling and Taglish
            phoneticization disagree ("kolor" vs "kaler"), we follow the spelling. The Details tab flags every
            one of these judgment calls per word.
          </SourceCard>
        </div>
      </section>
    </div>
  );
}

function SourceCard({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <div className="border border-line bg-paper p-4">
      <h3 className="text-sm font-bold">{title}</h3>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-block break-all text-xs font-semibold text-ink transition hover:text-gray"
        >
          {linkLabel}
        </a>
      )}
      <p className="mt-2 text-xs leading-5 text-gray">{children}</p>
    </div>
  );
}
