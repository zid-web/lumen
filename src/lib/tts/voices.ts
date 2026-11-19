import { LANGS, type SupportedLang, type VoiceGender } from '@shared/langs';

/** Sous-ensemble de SpeechSynthesisVoice utilisé (facilite les tests). */
export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default: boolean;
}

const FEMALE_KEYWORDS = ['female', 'woman', 'femme', 'femenina', 'weiblich', 'donna', 'mulher', 'vrouw', 'kobieta', 'женский', '女'];
const MALE_KEYWORDS = ['male', ' man', 'homme', 'masculino', 'männlich', 'uomo', 'homem', 'man ', 'mężczyzna', 'мужской', '男'];

// Prénoms des voix système courantes (macOS/iOS, Windows, Android, Edge, Google).
const FEMALE_NAMES = [
  'amelie', 'amélie', 'audrey', 'aurelie', 'aurélie', 'denise', 'eloise', 'hortense', 'julie', 'marie', 'virginie', 'celine', 'céline', 'chantal', 'sylvie', 'vivienne', 'brigitte', 'coralie', 'josephine', 'yvette',
  'samantha', 'karen', 'victoria', 'zira', 'susan', 'hazel', 'jenny', 'aria', 'ava', 'allison', 'moira', 'tessa', 'fiona', 'serena', 'emma', 'libby', 'sonia', 'michelle', 'ana', 'nora', 'catherine', 'kate', 'veena',
  'monica', 'mónica', 'paulina', 'helena', 'laura', 'elvira', 'dalia', 'marisol', 'esperanza', 'lucia', 'lucía', 'sabina', 'conchita',
  'anna', 'katja', 'hedda', 'petra', 'marlene', 'vicki', 'amala', 'seraphina', 'louisa',
  'alice', 'elsa', 'federica', 'isabella', 'paola', 'carla', 'bianca', 'giorgia',
  'luciana', 'joana', 'francisca', 'fernanda', 'raquel', 'catarina', 'maria', 'vitoria', 'vitória',
  'ellen', 'claire', 'colette', 'fenna', 'xenia', 'zosia', 'zofia', 'ewa', 'agnieszka', 'paulina',
  'milena', 'svetlana', 'irina', 'katya', 'dariya', 'kyoko', 'nanami', 'haruka', 'ayumi', 'mizuki', 'o-ren',
  'ting-ting', 'tingting', 'mei-jia', 'sin-ji', 'xiaoxiao', 'huihui', 'yaoyao', 'xiaoyi', 'lili',
  'laila', 'zariyah', 'hoda', 'salma', 'mariam',
];
const MALE_NAMES = [
  'thomas', 'henri', 'nicolas', 'paul', 'claude', 'jacques', 'daniel', 'yannick', 'alain', 'jerome', 'jérôme', 'maurice', 'remy', 'rémy', 'antoine', 'fabrice', 'gerard', 'gérard', 'mathieu',
  'alex', 'fred', 'guy', 'david', 'mark', 'george', 'james', 'ryan', 'eric', 'tom', 'aaron', 'arthur', 'oliver', 'rishi', 'gordon', 'lee', 'reed', 'ralph', 'bruce', 'albert', 'junior', 'rocko', 'eddy', 'grandpa', 'brian', 'christopher', 'roger', 'steffan', 'andrew', 'davis', 'tony', 'jason',
  'jorge', 'diego', 'juan', 'pablo', 'alvaro', 'álvaro', 'raul', 'raúl', 'carlos', 'enrique', 'jose', 'josé', 'arnau',
  'markus', 'conrad', 'stefan', 'hans', 'yannick', 'viktor', 'klaus', 'ralf', 'killian', 'florian', 'christoph',
  'luca', 'cosimo', 'giuseppe', 'benigno', 'calimero', 'rinaldo', 'gianni', 'lorenzo',
  'antonio', 'rafael', 'duarte', 'felipe', 'reis', 'daniel', 'julio', 'júlio', 'humberto', 'donato',
  'xander', 'maarten', 'frank', 'arnaud', 'marek', 'krzysztof', 'adam', 'jacek',
  'yuri', 'dmitry', 'maxim', 'pavel', 'otoya', 'hattori', 'keita', 'ichiro', 'kenji', 'daichi',
  'li-mu', 'limu', 'yunxi', 'yunyang', 'kangkang', 'yunjian', 'kaiyu', 'maged', 'tarik', 'hamed', 'naayf', 'shakir',
];

const QUALITY_HINTS = ['natural', 'neural', 'online', 'premium', 'enhanced', 'google', 'siri'];

export function detectGender(v: VoiceLike): VoiceGender | null {
  const hay = ` ${v.name} ${v.voiceURI} `.toLowerCase();
  // Les mots-clés explicites priment ("female" contient "male" : on teste female d'abord).
  if (FEMALE_KEYWORDS.some((k) => hay.includes(k))) return 'female';
  if (MALE_KEYWORDS.some((k) => hay.includes(k))) return 'male';
  const tokens = hay.split(/[^\p{L}-]+/u).filter(Boolean);
  if (tokens.some((t) => FEMALE_NAMES.includes(t))) return 'female';
  if (tokens.some((t) => MALE_NAMES.includes(t))) return 'male';
  return null;
}

export function matchesLang(v: VoiceLike, lang: SupportedLang): boolean {
  return v.lang.toLowerCase().replace('_', '-').split('-')[0] === lang;
}

function score(v: VoiceLike, lang: SupportedLang, gender: VoiceGender): number {
  let s = 0;
  const locale = LANGS[lang].locale.toLowerCase();
  if (v.lang.toLowerCase().replace('_', '-') === locale) s += 4;
  const g = detectGender(v);
  if (g === gender) s += 10;
  else if (g !== null) s -= 10;
  const name = v.name.toLowerCase();
  // Voix neuronales (Edge « Natural », Siri, Google…) : nettement plus humaines.
  if (QUALITY_HINTS.some((q) => name.includes(q))) s += 6;
  if (name.includes('compact') || name.includes('espeak')) s -= 3;
  if (v.default) s += 1;
  return s;
}

export interface VoiceChoice<V extends VoiceLike = SpeechSynthesisVoice> {
  voice: V | null;
  /** Vrai si le genre demandé a été trouvé ; sinon on simule via la hauteur. */
  genderMatched: boolean;
  /** Ajustement de pitch Web Speech (multiplicateur) à appliquer pour simuler le genre. */
  pitchFactor: number;
}

export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: SupportedLang, gender: VoiceGender): VoiceChoice<V> {
  const candidates = voices.filter((v) => matchesLang(v, lang));
  if (candidates.length === 0) return { voice: null, genderMatched: false, pitchFactor: gender === 'male' ? 0.85 : 1.1 };
  const best = [...candidates].sort((a, b) => score(b, lang, gender) - score(a, lang, gender))[0] ?? null;
  const matched = best !== null && detectGender(best) === gender;
  return { voice: best, genderMatched: matched, pitchFactor: matched ? 1 : gender === 'male' ? 0.8 : 1.15 };
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Les voix se chargent de façon asynchrone sur Chrome/Android. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);
  voicesPromise ??= new Promise((resolve) => {
    const done = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) {
        window.speechSynthesis.removeEventListener('voiceschanged', done);
        resolve(v);
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(() => {
      voicesPromise = null;
      resolve(window.speechSynthesis.getVoices());
    }, 2500);
  });
  return voicesPromise;
}
