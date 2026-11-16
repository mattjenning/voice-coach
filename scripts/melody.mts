/**
 * Makes a melody map from a recording of one voice.
 * Run with: node scripts/melody.mts recording.wav [map.json]
 *
 * The recording must be a WAV file of a voice on its own: no instruments.
 * It prints the notes it found. With a second file name, it also saves the
 * map there.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { mapMelody } from '../src/lib/melody.ts';
import { noteName } from '../src/lib/notes.ts';
import { readWav } from '../src/lib/wav.ts';

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/melody.mts recording.wav [map.json]');
  process.exit(1);
}

const file = readFileSync(input);
const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
const sound = readWav(bytes);
const map = mapMelody(sound.samples, sound.sampleRate, basename(input).replace(/\.wav$/i, ''));

const seconds = (ms: number) => (ms / 1000).toFixed(2).padStart(7);
for (const note of map.notes) {
  console.log(`${seconds(note.startMs)}s to ${seconds(note.endMs)}s  ${noteName(note.midi)}`);
}
console.log(`${map.notes.length} notes in ${(map.durationMs / 1000).toFixed(1)} seconds.`);

if (output) {
  writeFileSync(output, JSON.stringify(map, null, 2) + '\n');
  console.log(`Saved to ${output}`);
}
