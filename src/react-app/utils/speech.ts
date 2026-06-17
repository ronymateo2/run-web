// Reusable Spanish text-to-speech over the Web Speech API. Used by the how-to reader and
// the voice-guided exercise player. Number-to-words lives here so both share one source.

const UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve",
];

const TWENTIES = [
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
  "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];

const TEN_NAMES = [
  "", "diez", "veinte", "treinta", "cuarenta", "cincuenta",
  "sesenta", "setenta", "ochenta", "noventa",
];

const HUNDRED_NAMES = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

export function numberToWords(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 30) return TWENTIES[n - 20];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return TEN_NAMES[ten];
    return `${TEN_NAMES[ten]} y ${UNITS[unit]}`;
  }
  if (n < 200) {
    const rest = n - 100;
    if (rest === 0) return "cien";
    return `ciento ${numberToWords(rest)}`;
  }
  if (n < 1000) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    if (rest === 0) return HUNDRED_NAMES[hundred];
    return `${HUNDRED_NAMES[hundred]} ${numberToWords(rest)}`;
  }
  if (n < 2000) {
    const rest = n - 1000;
    if (rest === 0) return "mil";
    return `mil ${numberToWords(rest)}`;
  }
  if (n < 10000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    if (rest === 0) return `${numberToWords(thousand)} mil`;
    return `${numberToWords(thousand)} mil ${numberToWords(rest)}`;
  }
  return String(n);
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Prefer es-MX, then any Spanish voice, then the first available.
function resolveEsVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("es-mx"))
    ?? voices.find((v) => v.lang.toLowerCase().startsWith("es"))
    ?? voices[0];
}

// Speak `text` once, cancelling anything already speaking. Handles the async voice list
// (Chrome/Safari load voices lazily) by retrying on `onvoiceschanged` + a short timeout.
export function speak(text: string): void {
  if (!speechSupported() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();

  const utter = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-MX";
    u.rate = 0.95;
    u.pitch = 1.1;
    const voice = resolveEsVoice();
    if (voice) u.voice = voice;
    synth.speak(u);
  };

  if (synth.getVoices().length === 0 && "onvoiceschanged" in synth) {
    const handler = () => { synth.onvoiceschanged = null; utter(); };
    synth.onvoiceschanged = handler;
    window.setTimeout(() => {
      if (synth.getVoices().length > 0) { synth.onvoiceschanged = null; utter(); }
    }, 300);
    return;
  }
  utter();
}

export function cancelSpeech(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
