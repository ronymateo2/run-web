// Generate the beep MP3s (sine tones) so they can play through an HTMLAudioElement and
// survive the iOS mute switch, matching scheduleBeep() in src/react-app/utils/sound.ts.
//
// Requires ffmpeg on PATH. Usage:  node scripts/gen-beep.mjs
// Writes public/audio/beep-<freq>x<count>.mp3
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const TONE_DUR = 0.16; // seconds of tone
const GAP_DUR = 0.10;  // silence between tones
const FADE = 0.02;     // attack/decay to kill the click

// name suffix → tone settings. Keep in sync with the scheduleBeep() call sites.
const VARIANTS = [
  { freq: 880, count: 2 },
  { freq: 1320, count: 3 },
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
const tmp = mkdtempSync(join(tmpdir(), "beep-"));

function ff(args) { execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]); }

try {
  // One reusable silence segment for the gaps.
  const gap = join(tmp, "gap.wav");
  ff(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", String(GAP_DUR), gap]);

  for (const { freq, count } of VARIANTS) {
    // One tone with fades.
    const tone = join(tmp, `tone-${freq}.wav`);
    ff([
      "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${TONE_DUR}:sample_rate=44100`,
      "-af", `afade=t=in:d=${FADE},afade=t=out:st=${TONE_DUR - FADE}:d=${FADE}`,
      "-ac", "1", tone,
    ]);

    // Concat: tone (gap tone)×(count-1).
    const seq = [tone];
    for (let i = 1; i < count; i++) seq.push(gap, tone);
    const listFile = join(tmp, `list-${freq}.txt`);
    writeFileSync(listFile, seq.map((f) => `file '${f}'`).join("\n"));

    const out = join(outDir, `beep-${freq}x${count}.mp3`);
    ff(["-f", "concat", "-safe", "0", "-i", listFile, "-codec:a", "libmp3lame", "-q:a", "4", out]);
    console.log(`✓ beep-${freq}x${count}.mp3`);
  }
  console.log("Done → public/audio/");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
