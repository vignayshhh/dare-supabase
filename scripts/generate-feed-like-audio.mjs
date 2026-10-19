// Original synthesized UI sounds; run with `node scripts/generate-feed-like-audio.mjs`.
import { mkdirSync, writeFileSync } from "node:fs";

const directory = new URL("../public/audio/likes/", import.meta.url);
mkdirSync(directory, { recursive: true });
const sampleRate = 44100;

function tone(time, frequency, duration) {
  if (time < 0 || time >= duration) return 0;
  // A rounded, falling-pitch bubble: fast tactile onset, warm body, no ringing
  // treble tail. Short enough to remain distinct during repeated likes.
  const envelope = Math.min(1, time / 0.003) * Math.exp(-time * 34)
    * Math.min(1, (duration - time) / 0.018);
  const glide = 0.018;
  const phase = 2 * Math.PI * frequency * (time + 0.85 * glide * (1 - Math.exp(-time / glide)));
  const body = Math.sin(phase) + 0.16 * Math.sin(2 * phase) * Math.exp(-time * 50);
  const tick = 0.045 * Math.sin(2 * Math.PI * 1900 * time) * Math.exp(-time * 180);
  return envelope * (body + tick);
}

function write(name, duration, notes, synth = tone) {
  const samples = Array.from({ length: Math.round(sampleRate * duration) }, (_, index) =>
    notes.reduce((sum, [delay, frequency, length, amplitude]) =>
      sum + synth(index / sampleRate - delay, frequency, length) * amplitude, 0));
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // Mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => wav.writeInt16LE(Math.round(sample / peak * 0.72 * 32767), 44 + index * 2));
  writeFileSync(new URL(name, directory), wav);
}

[0, 1, 2, 3, 4, 5, 6, 7].forEach((semitone, step) => {
  write(`pop-${step}.wav`, 0.115, [[0, 520 * 2 ** (semitone / 12), 0.115, 1]]);
});
write("celebrate.wav", 0.26, [[0, 650, 0.115, 1], [0.09, 865, 0.17, 0.9]]);
// Integer-frequency partials and modulation complete whole cycles in 2 seconds,
// matching value and slope at the seam. The player handles attack/release.
write("flow.wav", 2, [[0, 330, 2, 1]], (time, frequency) => {
  const shimmer = 0.22 * Math.sin(2 * Math.PI * 2 * time);
  const body = Math.sin(2 * Math.PI * frequency * time + shimmer);
  const warmth = 0.28 * Math.sin(2 * Math.PI * frequency * 1.5 * time);
  const air = 0.12 * Math.sin(2 * Math.PI * frequency * 2 * time - shimmer);
  return (body + warmth + air) * (0.92 + 0.08 * Math.cos(2 * Math.PI * time));
});
console.log("Generated feed-like audio, including the seamless continuous loop.");
