// Generate the pre-rendered exercise voice cues with ElevenLabs.
//
// Usage:
//   ELEVENLABS_API_KEY=sk_... ELEVENLABS_VOICE_ID=<voice_id> node scripts/gen-voice.mjs
//
// Writes MP3s into public/audio/ (served at /audio/*.mp3). Re-run to regenerate.
// Pick a Spanish-friendly voice in the ElevenLabs app and copy its Voice ID.
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

if (!KEY || !VOICE_ID) {
  console.error("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID env vars.");
  process.exit(1);
}

// name → spoken text. Keep in sync with CLIPS in src/react-app/utils/cue.ts.
// Spanish cardinals for the "Serie N" clips. Must match numberToWords() in
// src/react-app/utils/speech.ts so the runtime keys line up.
const SERIES_WORDS = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis",
  "siete", "ocho", "nueve", "diez", "once", "doce",
];
const MAX_SERIES = 12;

// name → spoken text. Keep the list-flow names in sync with CLIPS in cue.ts.
const PHRASES = {
  // Time-based list flow.
  comienza: "Comienza",
  descanso: "Descanso",
  completado: "Completado",
  // Guided mode: fixed phrases (free-text rep cues stay on Web Speech).
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

for (const [name, text] of Object.entries(PHRASES)) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) {
    console.error(`${name}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = join(outDir, `${name}.mp3`);
  await writeFile(file, buf);
  console.log(`✓ ${name}.mp3 (${buf.length} bytes)`);
}

console.log("Done → public/audio/");
