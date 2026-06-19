// Generate the exercise voice cues with Google Gemini TTS (AI Studio API).
//
// Gemini returns raw 16-bit PCM; we pipe it through ffmpeg to MP3 (HTMLAudioElement needs a
// container format). Requires ffmpeg on PATH.
//
// Usage:
//   GEMINI_API_KEY=... node scripts/gen-voice-gemini.mjs
// Optional:
//   GEMINI_VOICE=Kore        (prebuilt voice; e.g. Kore, Puck, Charon, Aoede, Zephyr, Leda)
//   GEMINI_MODEL=gemini-2.5-flash-preview-tts
//
// Writes public/audio/<name>.mp3 — keep names in sync with cue.ts and GuidedExerciseScreen.
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY = process.env.GEMINI_API_KEY;
const VOICE = process.env.GEMINI_VOICE ?? "Kore";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-tts-preview";

if (!KEY) {
  console.error("Set GEMINI_API_KEY (from Google AI Studio).");
  process.exit(1);
}

// Spanish cardinals for the "Serie N" clips. Must match numberToWords() in speech.ts.
const SERIES_WORDS = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis",
  "siete", "ocho", "nueve", "diez", "once", "doce",
];
const MAX_SERIES = 12;

// name → spoken text. Generate the whole set so one voice is used everywhere.
const PHRASES = {
  comienza: "Comienza",
  descanso: "Descanso",
  completado: "Completado",
  aguanta: "Aguanta",
  ...Object.fromEntries(
    Array.from({ length: MAX_SERIES }, (_, i) => [
      `serie-${i + 1}`,
      `Serie ${SERIES_WORDS[i + 1]}. Prepárate.`,
    ]),
  ),
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
await mkdir(outDir, { recursive: true });

const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function synth(text) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`no audio in response: ${JSON.stringify(data).slice(0, 300)}`);
  const rate = part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] ?? "24000";
  return { pcm: Buffer.from(part.inlineData.data, "base64"), rate };
}

for (const [name, text] of Object.entries(PHRASES)) {
  const { pcm, rate } = await synth(text);
  const out = join(outDir, `${name}.mp3`);
  // Raw signed 16-bit little-endian mono PCM → MP3.
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "s16le", "-ar", rate, "-ac", "1", "-i", "pipe:0",
    "-codec:a", "libmp3lame", "-q:a", "4", out,
  ], { input: pcm });
  console.log(`✓ ${name}.mp3 (${pcm.length} B pcm @ ${rate}Hz)`);
}

console.log("Done → public/audio/");
