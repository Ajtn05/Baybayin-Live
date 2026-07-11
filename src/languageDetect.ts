// ============================================================
// languageDetect.ts — deterministic per-word language routing
//
// Decides, word by word, whether input is Filipino, Spanish, or
// English so the right respelling pipeline runs before Baybayin
// rendering. The checks run in a fixed order and every decision
// carries a human-readable reason, so detection is as inspectable
// as the rest of the app. A per-word override in the UI outranks
// everything here.
// ============================================================

import { LangDetection } from './types';
import { cmuLookupAll, cmuDictStatus } from './cmudict';

// ─── Curated Filipino words ──────────────────────────────────
// Function words, pronouns, and high-frequency vocabulary. This
// list runs FIRST because several everyday Filipino words are also
// English dictionary entries ("at", "ay", "may", "para", "ate") —
// without this list they would misroute through the English path.

const FILIPINO_WORDS = new Set([
  // markers, linkers, particles
  'ang', 'mga', 'ng', 'nang', 'sa', 'si', 'ni', 'kay', 'kina', 'sina', 'nina',
  'ay', 'at', 'o', 'kung', 'kapag', 'pag', 'dahil', 'kasi', 'para', 'pero',
  'ngunit', 'subalit', 'upang', 'na', 'pa', 'ba', 'daw', 'raw', 'din', 'rin',
  'lang', 'lamang', 'naman', 'nga', 'pala', 'kaya', 'sana', 'muna', 'yata',
  'po', 'opo', 'ho', 'oho', 'hindi', 'huwag', 'wag', 'wala', 'walang', 'may',
  'mayroon', 'meron', 'oo', 'hindi', 'eh', 'ha', 'ito', 'iyan', 'iyon',
  // pronouns and demonstratives
  'ako', 'ko', 'akin', 'ikaw', 'ka', 'mo', 'iyo', 'siya', 'niya', 'kanya',
  'kami', 'namin', 'amin', 'tayo', 'natin', 'atin', 'kayo', 'ninyo', 'inyo',
  'sila', 'nila', 'kanila', 'nito', 'dito', 'rito', 'niyan', 'diyan', 'riyan',
  'niyon', 'noon', 'doon', 'roon', 'yun', 'yan', 'yung',
  // question words
  'sino', 'ano', 'alin', 'saan', 'nasaan', 'kailan', 'bakit', 'paano', 'ilan',
  'magkano', 'kanino', 'kumusta', 'kamusta', 'musta',
  // common verbs (roots and everyday conjugations)
  'kain', 'kumain', 'kakain', 'kumakain', 'inom', 'uminom', 'tulog', 'matulog',
  'natutulog', 'gising', 'punta', 'pumunta', 'alis', 'umalis', 'dating',
  'dumating', 'uwi', 'umuwi', 'lakad', 'maglakad', 'takbo', 'tumakbo', 'bili',
  'bumili', 'bilhin', 'gawa', 'gumawa', 'gagawin', 'ginawa', 'tingin',
  'tumingin', 'kita', 'nakita', 'makita', 'sabi', 'sinabi', 'sabihin',
  'salita', 'magsalita', 'tanong', 'magtanong', 'sagot', 'sumagot', 'alam',
  'malaman', 'isip', 'mahal', 'mahalin', 'gusto', 'ayaw', 'kailangan',
  'pwede', 'puwede', 'maaari', 'dapat', 'tulong', 'tumulong', 'hintay',
  'maghintay', 'hanap', 'hanapin', 'laro', 'maglaro', 'aral', 'turo',
  'magturo', 'basa', 'bumasa', 'sulat', 'sumulat', 'bigay', 'ibigay', 'kuha',
  'kunin', 'dala', 'dalhin', 'upo', 'umupo', 'tawa', 'tumawa', 'iyak',
  'umiyak', 'ngiti', 'ngumiti', 'kanta', 'kumanta', 'sayaw', 'sumayaw',
  'ligo', 'maligo', 'linis', 'maglinis', 'luto', 'magluto', 'nood', 'manood',
  'tara', 'halika', 'sige', 'salamat', 'pasensya', 'paumanhin', 'mabuhay',
  // time
  'araw', 'gabi', 'umaga', 'tanghali', 'hapon', 'oras', 'panahon', 'taon',
  'linggo', 'ngayon', 'kanina', 'mamaya', 'bukas', 'kahapon', 'palagi',
  'lagi', 'minsan', 'madalas', 'bihira', 'agad', 'muli', 'ulit', 'tapos',
  'pagkatapos', 'habang', 'bago', 'simula', 'hanggang', 'kasama',
  // people and family
  'tao', 'babae', 'lalaki', 'bata', 'matanda', 'pamilya', 'magulang', 'ama',
  'ina', 'tatay', 'nanay', 'anak', 'kapatid', 'kuya', 'ate', 'lolo', 'lola',
  'tito', 'tita', 'pinsan', 'asawa', 'kaibigan', 'kapitbahay', 'kasama',
  // body
  'ulo', 'mata', 'ilong', 'bibig', 'tenga', 'kamay', 'paa', 'puso', 'katawan',
  'buhok', 'ngipin', 'dila', 'balat', 'dugo', 'mukha',
  // everyday nouns
  'bahay', 'pinto', 'bintana', 'kwarto', 'kuwarto', 'kusina', 'banyo', 'kama',
  'pagkain', 'tubig', 'kanin', 'ulam', 'isda', 'manok', 'baboy', 'baka',
  'gulay', 'prutas', 'saging', 'mangga', 'bigas', 'asin', 'asukal', 'gatas',
  'itlog', 'tinapay', 'kape', 'tsaa', 'pera', 'trabaho', 'paaralan', 'guro',
  'aklat', 'libro', 'papel', 'lapis', 'kotse', 'dyip', 'dyipni', 'daan',
  'kalsada', 'lungsod', 'bayan', 'bundok', 'dagat', 'ilog', 'ulan', 'hangin',
  'apoy', 'lupa', 'langit', 'bituin', 'buwan', 'damit', 'sapatos', 'tsinelas',
  'salamin', 'payong', 'susi', 'gamit', 'laruan', 'regalo', 'pangalan',
  'wika', 'kwento', 'kuwento', 'awit', 'tula', 'larawan', 'kulay', 'baybayin',
  // colors and numbers
  'pula', 'puti', 'itim', 'asul', 'berde', 'dilaw', 'kayumanggi', 'rosas',
  'isa', 'dalawa', 'tatlo', 'apat', 'lima', 'anim', 'pito', 'walo', 'siyam',
  'sampu', 'daang', 'libo', 'una', 'huli', 'gitna',
  // adjectives
  'maganda', 'gwapo', 'guwapo', 'pangit', 'mabuti', 'masama', 'mabait',
  'masipag', 'tamad', 'malaki', 'maliit', 'mahaba', 'maikli', 'mataas',
  'mababa', 'mabigat', 'magaan', 'mainit', 'malamig', 'masarap', 'matamis',
  'maasim', 'maalat', 'mapait', 'maanghang', 'luma', 'mabilis', 'mabagal',
  'malakas', 'mahina', 'mayaman', 'mahirap', 'masaya', 'malungkot', 'galit',
  'takot', 'pagod', 'gutom', 'uhaw', 'busog', 'puno', 'tama', 'mali', 'totoo',
  'sigurado', 'mahalaga', 'libre', 'abala', 'malinis', 'marumi', 'tuyo',
  'buhay', 'patay', 'buo', 'sira', 'sarado', 'maingay', 'tahimik', 'madali',
  'iba', 'pareho', 'lahat', 'ilang', 'marami', 'konti', 'kaunti', 'sobra',
  'kulang', 'husto', 'sakto', 'magandang', 'maayos', 'ayos', 'importante',
  // location and direction
  'itaas', 'ibaba', 'loob', 'labas', 'harap', 'likod', 'tabi', 'malapit',
  'malayo', 'kanan', 'kaliwa', 'gitna', 'tapat', 'ilalim', 'ibabaw',
  // interjections and adverbs
  'naku', 'grabe', 'talaga', 'sobrang', 'medyo', 'parang', 'mismo', 'lalo',
  'halos', 'mahigit', 'ayon', 'ayun', 'heto', 'hayan', 'ganito', 'ganyan',
  'ganoon', 'ganun', 'kahit', 'baka', 'siguro', 'syempre', 'siyempre',
]);

// ─── Curated Spanish words ───────────────────────────────────
// Two kinds of entries: (1) every Spanish word the KWF Manwal sa
// Masinop na Pagsulat itself uses as an example, so the manual's
// own cases route through the Spanish rules; (2) common Spanish
// words — greetings, function words, everyday vocabulary — that
// show up in Filipino text. Words English also borrowed (hacienda,
// fiesta, plaza) must live here, or the CMU dictionary would claim
// them for the English path first.

const SPANISH_WORDS = new Set([
  // KWF manual examples (§4.2–4.13, §5, §6.3, §7.2–7.3)
  'forma', 'firma', 'ventana', 'calle', 'cheque', 'jamon', 'existencia',
  'zapatos', 'vacacion', 'caballo', 'candela', 'fuerza', 'lechon',
  'licencia', 'cebolla', 'cebollas', 'celaje', 'celajes', 'zona', 'manco',
  'queso', 'coche', 'ciudad', 'extra', 'concernido', 'aspecto', 'imagen',
  'contemporaneo', 'endoso', 'nivel', 'critica', 'critico', 'cientifico',
  'psicologo', 'estandardizacion', 'bagaje', 'virtud', 'isla', 'sofisticado',
  'graduacion', 'hielo', 'hechura', 'hacienda', 'heredero', 'hora', 'horas',
  'habilidad', 'humano', 'humanismo', 'humanista', 'humanidad',
  'humanidades', 'humanitario', 'historia', 'historiador', 'historico',
  'historicismo', 'justo', 'juez', 'compania', 'acacia', 'teniente',
  'beneficio', 'individual', 'aguador', 'chineguelas', 'prejuicio', 'tia',
  'piano', 'pieza', 'kiosco', 'viuda', 'toalla', 'buitre', 'hostia',
  'infierno', 'leccion', 'eleccion', 'lenguaje', 'encuentro', 'industria',
  'influencia', 'magia', 'estrategia', 'colegio', 'region', 'economia',
  'filosofia', 'geografia', 'junio', 'julio', 'septiembre', 'octubre',
  'noviembre', 'diciembre', 'enero', 'febrero', 'marzo', 'abril',
  'miercoles', 'jueves', 'viernes', 'lunes', 'martes', 'sabado', 'domingo',
  'cuento', 'violin', 'suerte', 'dialecto', 'accion', 'cristiano',
  'sentencia', 'zarzuela', 'pasion', 'calvario', 'comedia', 'aorta',
  'faraon', 'baul', 'teatro', 'poeta', 'poesia', 'mausoleo', 'auditorio',
  'auditivo', 'bautismo', 'caudillo', 'chismes', 'chapa', 'champaca',
  'chofer', 'lechugas', 'lechuga', 'achara', 'escandalo', 'estacion',
  'especial', 'esmarte', 'escuela', 'estandarte', 'estilo', 'escolar',
  'conferencia', 'convencion', 'confesar', 'convento', 'conforme',
  'confortable', 'confisca', 'confiscacion', 'confeti', 'completo',
  'monumento', 'contrata', 'controversia', 'consumo', 'brillante',
  'carruaje', 'barrio', 'guitarra', 'guerra', 'piña', 'doña', 'baño',
  'señor', 'señora', 'señorita', 'niño', 'niña', 'año', 'mañana', 'sueño',
  // common Spanish likely to appear in Filipino text
  'hola', 'adios', 'gracias', 'buenos', 'buenas', 'dias', 'noches', 'tardes',
  'amigo', 'amiga', 'corazon', 'familia', 'iglesia', 'fiesta', 'siesta',
  'plaza', 'armada', 'dinero', 'trabajo', 'tiempo', 'fuego', 'agua', 'cielo',
  'tierra', 'mundo', 'vida', 'muerte', 'amor', 'querido', 'querida',
  'quiero', 'quieres', 'quiere', 'puedo', 'puede', 'tengo', 'tiene',
  'gusta', 'vamos', 'bonita', 'bonito', 'hermosa', 'hermoso', 'grande',
  'pequeño', 'nuevo', 'nueva', 'viejo', 'vieja', 'bueno', 'buena', 'malo',
  'mala', 'mucho', 'mucha', 'poco', 'poca', 'todo', 'toda', 'todos',
  'nada', 'siempre', 'nunca', 'ahora', 'aqui', 'alli', 'donde', 'cuando',
  'porque', 'como', 'este', 'esta', 'ese', 'esa', 'usted', 'nosotros',
  'ellos', 'ellas', 'quien', 'bien', 'muy', 'mas', 'pues', 'entonces',
  'verdad', 'claro', 'basta', 'mismo', 'misma', 'otro', 'otra', 'cada',
  'hasta', 'desde', 'entre', 'sobre', 'contra', 'durante',
  'hueso', 'huevo', 'hijo', 'hija', 'hermano', 'hermana', 'hombre', 'mujer',
  'casa', 'cosa', 'dios', 'dia', 'silla', 'cuchara', 'cuchillo', 'cerveza',
  'leche', 'noche', 'gente', 'puerta', 'pueblo', 'estrella', 'camisa',
  'cabeza', 'carne', 'sombrero', 'veinte', 'treinta', 'cuarenta',
  'cincuenta', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
]);

// Letters native Filipino (abakada) spelling never uses. Their
// presence marks a word as foreign — the question left is whether
// it is Spanish or English.
const NON_ABAKADA = /[cfjñqvxz]/;

// Unambiguously Spanish orthography: ñ and accented vowels are not
// used in English spelling at all.
const UNAMBIGUOUS_SPANISH = /[ñáéíóúü]/;

// Spanish words end in a vowel or one of n, s, r, l, d (y as in
// "muy" also occurs). Used only as a *shape* filter after stronger
// evidence (a foreign letter, ll, or rr) already fired.
const SPANISH_FINAL = /[aeiounsrldy]$/;

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-zñáéíóúü']/g, '')
    .replace(/'/g, '');
}

/** Strip accents but keep ñ (which changes a word's consonants). */
export function stripAccents(word: string): string {
  return word
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
}

/**
 * Detect a single word's language. Deterministic, ordered checks;
 * the reason strings surface on the word's card in the UI.
 */
export function detectWordLanguage(word: string): LangDetection {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return { lang: 'filipino', reason: 'No letters to analyze — passed through unchanged.' };
  }
  const unaccented = stripAccents(normalized);

  // 1. Curated Filipino vocabulary — runs first because common
  //    Filipino words ("at", "ay", "may", "para") are also English
  //    dictionary entries.
  if (FILIPINO_WORDS.has(unaccented)) {
    return { lang: 'filipino', reason: `"${unaccented}" is common Filipino vocabulary.` };
  }

  // 2. Curated Spanish vocabulary — includes every Spanish example
  //    in the KWF manual plus Spanish words English also borrowed
  //    (hacienda, fiesta), which would otherwise be claimed by the
  //    CMU dictionary.
  if (SPANISH_WORDS.has(normalized) || SPANISH_WORDS.has(unaccented)) {
    return { lang: 'spanish', reason: `"${unaccented}" is recognized Spanish vocabulary.` };
  }

  // 3. Unambiguously Spanish spelling: ñ or accented vowels never
  //    appear in English or abakada Filipino spelling.
  if (UNAMBIGUOUS_SPANISH.test(normalized)) {
    const marker = normalized.match(UNAMBIGUOUS_SPANISH)![0];
    return { lang: 'spanish', reason: `The letter "${marker}" only occurs in Spanish spelling.` };
  }

  // 4. English pronunciation dictionary. ~123k words; a hit means
  //    the English pronunciation-first pipeline can do its job.
  if (cmuDictStatus() === 'ready' && cmuLookupAll(unaccented).length > 0) {
    return { lang: 'english', reason: `"${unaccented}" is in the CMU English pronouncing dictionary.` };
  }

  // 5. Spanish-shaped foreign spelling: a letter abakada never uses
  //    (c, f, j, q, v, x, z) or the digraphs ll/rr, in a word with a
  //    Spanish ending and no CMU entry.
  const hasForeignLetter = NON_ABAKADA.test(unaccented);
  const hasSpanishDigraph = /ll|rr/.test(unaccented);
  if ((hasForeignLetter || hasSpanishDigraph) && SPANISH_FINAL.test(unaccented)) {
    const marker = hasForeignLetter ? unaccented.match(NON_ABAKADA)![0] : unaccented.match(/ll|rr/)![0];
    return {
      lang: 'spanish',
      reason: `Not in the English dictionary, and "${marker}" with a Spanish-style ending suggests Spanish spelling.`,
    };
  }

  // 6. Fallback: read as Filipino, exactly how Filipino treats an
  //    unknown word — every letter at face value.
  return {
    lang: 'filipino',
    reason: 'Not recognized as English or Spanish — read as spelled, the way Filipino reads unfamiliar words.',
  };
}
