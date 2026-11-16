/**
 * Checks the pitch engine with made-up sound, so no phone or voice is needed.
 * Run with: node scripts/check.mts
 */
import assert from 'node:assert/strict';

import { ANALYSIS_RATE, Framer, firstChannel, thinningFactor } from '../src/lib/frames.ts';
import {
  HOLD,
  NOT_HOLDING,
  advanceHold,
  compareToTarget,
  formatOctaves,
  type HoldState,
} from '../src/lib/hold.ts';
import { findNotes, mapMelody, steady, trackPitch, type MelodyNote } from '../src/lib/melody.ts';
import {
  centsBetween,
  formatCents,
  formatHz,
  hzToMidi,
  midiToHz,
  nearestNote,
  noteName,
} from '../src/lib/notes.ts';
import { PitchSmoother, detectPitch, level } from '../src/lib/pitch.ts';
import {
  FIRST_TARGET,
  HIGHEST_TARGET,
  LOWEST_TARGET,
  START,
  practiceReducer,
  type Practice,
} from '../src/lib/practice.ts';
import { readWav, writeWav } from '../src/lib/wav.ts';

/** A repeatable stand-in for Math.random, so a failing check fails every time. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * A voice-like tone: a fundamental plus overtones, with optional hiss.
 * `overtones` lists the loudness of each one, starting with the fundamental.
 */
function tone(
  hz: number,
  sampleRate: number,
  count: number,
  overtones: number[] = [1],
  noise = 0,
  random: () => number = seeded(1),
): Float32Array {
  const out = new Float32Array(count);
  const total = overtones.reduce((sum, value) => sum + Math.abs(value), 0);
  for (let i = 0; i < count; i++) {
    let sample = 0;
    for (let k = 0; k < overtones.length; k++) {
      sample += overtones[k] * Math.sin((2 * Math.PI * hz * (k + 1) * i) / sampleRate);
    }
    out[i] = (0.5 * sample) / total + noise * (random() * 2 - 1);
  }
  return out;
}

// --- Notes -----------------------------------------------------------------

assert.equal(hzToMidi(440), 69);
assert.equal(Math.round(midiToHz(60) * 100) / 100, 261.63);
assert.equal(noteName(69), 'A4');
assert.equal(noteName(60), 'C4');
assert.equal(noteName(36), 'C2');
assert.equal(noteName(61), 'C♯4');
assert.equal(Math.round(centsBetween(880, 440)), 1200);
assert.equal(Math.round(centsBetween(midiToHz(70), midiToHz(69))), 100);

const slightlySharp = nearestNote(445);
assert.equal(slightlySharp.name, 'A4');
assert.ok(slightlySharp.cents > 19 && slightlySharp.cents < 20);
assert.equal(formatHz(130.81), '131 Hz');
assert.equal(formatCents(4, 25), 'in tune');
assert.equal(formatCents(31.6, 25), '32 cents sharp');
assert.equal(formatCents(-40, 25), '40 cents flat');

// --- Pitch detection -------------------------------------------------------

const RATE = ANALYSIS_RATE;
const FRAME = 1024;

assert.equal(level(new Float32Array(FRAME)), 0);
assert.equal(detectPitch(new Float32Array(FRAME), RATE), null, 'silence has no pitch');

const hiss = new Float32Array(FRAME);
const hissRandom = seeded(7);
for (let i = 0; i < FRAME; i++) hiss[i] = 0.3 * (hissRandom() * 2 - 1);
assert.equal(detectPitch(hiss, RATE), null, 'noise has no pitch');

// Every semitone from C2 to C6, as a pure tone, a voice-like tone, and a
// voice-like tone with hiss. Each must land within a few cents.
const VOICE = [1, 0.6, 0.4, 0.25, 0.15];
// A tone whose fundamental is weaker than its overtones, as low voices
// often are on a phone microphone.
const WEAK_FUNDAMENTAL = [0.3, 1, 0.7, 0.4];

let worst = { cents: 0, note: '', kind: '' };
for (let midi = 36; midi <= 84; midi++) {
  const hz = midiToHz(midi);
  const cases: [string, Float32Array][] = [
    ['pure', tone(hz, RATE, FRAME)],
    ['voice', tone(hz, RATE, FRAME, VOICE)],
    ['voice with hiss', tone(hz, RATE, FRAME, VOICE, 0.02, seeded(midi))],
    ['weak fundamental', tone(hz, RATE, FRAME, WEAK_FUNDAMENTAL)],
  ];
  for (const [kind, samples] of cases) {
    const pitch = detectPitch(samples, RATE);
    assert.ok(pitch, `${noteName(midi)} ${kind}: no pitch found`);
    const off = Math.abs(centsBetween(pitch.hz, hz));
    if (off > worst.cents) worst = { cents: off, note: noteName(midi), kind };
    assert.ok(off < 10, `${noteName(midi)} ${kind}: ${off.toFixed(1)} cents off (${pitch.hz.toFixed(1)} Hz)`);
  }
}

// Notes between the piano keys must read as between, not snap to a key.
for (const cents of [-40, -15, 15, 40]) {
  const hz = midiToHz(57) * 2 ** (cents / 1200);
  const pitch = detectPitch(tone(hz, RATE, FRAME, VOICE), RATE);
  assert.ok(pitch);
  assert.ok(Math.abs(centsBetween(pitch.hz, midiToHz(57)) - cents) < 5, `A3 ${cents} cents`);
}

// A clean note reports high clarity.
const clean = detectPitch(tone(220, RATE, FRAME, VOICE), RATE);
assert.ok(clean && clean.clarity > 0.9);

// --- Smoothing -------------------------------------------------------------

const smoother = new PitchSmoother(5, 3);
assert.equal(smoother.push(null), null);
for (const hz of [220, 221, 219, 220]) smoother.push(hz);
assert.equal(smoother.push(440), 220, 'one octave jump is thrown away');
assert.equal(smoother.push(null), 220, 'holds through a short gap');
smoother.push(null);
assert.equal(smoother.push(null), null, 'lets go after three gaps');

// --- Framing ---------------------------------------------------------------

assert.equal(thinningFactor(48_000), 3);
assert.equal(thinningFactor(44_100), 3);
assert.equal(thinningFactor(16_000), 1);
assert.equal(thinningFactor(8_000), 1);
assert.deepEqual([...firstChannel(new Float32Array([1, 9, 2, 9, 3, 9]), 2)], [1, 2, 3]);

const framer = new Framer(8, 4);
assert.equal(framer.push(new Float32Array([1, 2, 3, 4, 5, 6, 7])).length, 0);
const first = framer.push(new Float32Array([8, 9]));
assert.deepEqual(first.map((frame) => [...frame]), [[1, 2, 3, 4, 5, 6, 7, 8]]);
const second = framer.push(new Float32Array([10, 11, 12]));
assert.deepEqual(second.map((frame) => [...frame]), [[5, 6, 7, 8, 9, 10, 11, 12]]);

const merging = new Framer(4, 4);
// Groups of three are averaged, and a group split across two buffers still merges.
assert.equal(merging.push(new Float32Array([3, 3, 3, 6, 6]), 3).length, 0);
const merged = merging.push(new Float32Array([6, 9, 9, 9, 0, 3, 6]), 3);
assert.deepEqual(merged.map((frame) => [...frame]), [[3, 6, 9, 3]]);

// The whole path, as the phone will run it: 48,000 samples a second arriving
// in odd-sized buffers, thinned, framed, detected and smoothed.
{
  const phoneRate = 48_000;
  const factor = thinningFactor(phoneRate);
  const rate = phoneRate / factor;
  const sung = tone(midiToHz(55), phoneRate, phoneRate, VOICE, 0.01); // one second of G3
  const path = new Framer();
  const steady = new PitchSmoother();
  let reading: number | null = null;
  let frames = 0;
  for (let at = 0; at < sung.length; at += 4410) {
    for (const frame of path.push(sung.subarray(at, at + 4410), factor)) {
      frames++;
      const pitch = detectPitch(frame, rate);
      reading = steady.push(pitch ? pitch.hz : null);
    }
  }
  assert.ok(frames >= 28, `expected about 30 frames a second, got ${frames}`);
  assert.ok(reading !== null);
  assert.equal(nearestNote(reading).name, 'G3');
  assert.ok(Math.abs(nearestNote(reading).cents) < 5);
}

// --- The exercise ----------------------------------------------------------

const onTarget = compareToTarget(midiToHz(48), 48);
assert.equal(Math.round(onTarget.cents), 0);
assert.equal(onTarget.octaves, 0);
assert.ok(onTarget.inTune);

const octaveBelow = compareToTarget(midiToHz(48), 60);
assert.equal(octaveBelow.octaves, -1);
assert.ok(octaveBelow.inTune, 'the same note an octave down counts');
assert.ok(!compareToTarget(midiToHz(48), 60, false).inTune, 'unless any-octave is off');

const sharp = compareToTarget(midiToHz(48) * 2 ** (40 / 1200), 48);
assert.equal(Math.round(sharp.cents), 40);
assert.ok(!sharp.inTune);
assert.ok(compareToTarget(midiToHz(48) * 2 ** (-20 / 1200), 48).inTune);

assert.equal(formatOctaves(0), '');
assert.equal(formatOctaves(-1), 'one octave below');
assert.equal(formatOctaves(2), 'two octaves above');

let hold: HoldState = NOT_HOLDING;
hold = advanceHold(hold, false, 0);
assert.equal(hold.heldMs, 0);
hold = advanceHold(hold, true, 100);
hold = advanceHold(hold, true, 1100);
assert.equal(hold.heldMs, 1000);
assert.ok(!hold.done);
hold = advanceHold(hold, false, 1100 + HOLD.graceMs); // a brief slip
assert.equal(hold.heldMs, 1000, 'a short slip keeps the count');
hold = advanceHold(hold, true, 1500);
assert.equal(hold.heldMs, 1400);
hold = advanceHold(hold, true, 100 + HOLD.goalMs);
assert.ok(hold.done, 'held long enough');
assert.ok(advanceHold(hold, false, 99_999).done, 'done stays done');

let dropped: HoldState = advanceHold(NOT_HOLDING, true, 0);
dropped = advanceHold(dropped, true, 1000);
dropped = advanceHold(dropped, false, 1000 + HOLD.graceMs + 1); // a real break
assert.equal(dropped.heldMs, 0, 'a long break resets the count');
assert.equal(dropped.startedAt, null);

// --- A practice session ----------------------------------------------------

let session: Practice = START;
assert.equal(session.target, FIRST_TARGET);
const targetHz = midiToHz(FIRST_TARGET);

session = practiceReducer(session, { type: 'pitch', hz: targetHz * 1.2, atMs: 0 }); // far off
assert.equal(session.hold.heldMs, 0);
for (let at = 100; at <= 100 + HOLD.goalMs; at += 50) {
  session = practiceReducer(session, { type: 'pitch', hz: targetHz * 1.005, atMs: at });
}
assert.ok(session.hold.done);
assert.equal(session.matched, 1);
session = practiceReducer(session, { type: 'pitch', hz: targetHz, atMs: 9000 });
assert.equal(session.matched, 1, 'one match is counted once');
session = practiceReducer(session, { type: 'quiet' });
assert.ok(session.hold.done, 'a finished hold survives the tone playing');
assert.equal(session.hz, null);

session = practiceReducer(session, { type: 'target', midi: session.target + 1 });
assert.equal(session.target, FIRST_TARGET + 1);
assert.ok(!session.hold.done, 'a new target starts a new hold');
assert.equal(session.matched, 1);
session = practiceReducer(session, { type: 'pitch', hz: targetHz, atMs: 10_000 });
assert.equal(session.hold.heldMs, 0, 'the old note no longer matches');

assert.equal(practiceReducer(session, { type: 'target', midi: 200 }).target, HIGHEST_TARGET);
assert.equal(practiceReducer(session, { type: 'target', midi: -5 }).target, LOWEST_TARGET);

let half: Practice = practiceReducer(START, { type: 'pitch', hz: targetHz, atMs: 0 });
half = practiceReducer(half, { type: 'pitch', hz: targetHz, atMs: 800 });
assert.equal(half.hold.heldMs, 800);
assert.equal(practiceReducer(half, { type: 'quiet' }).hold.heldMs, 0);
assert.equal(practiceReducer(half, { type: 'again' }).hold.heldMs, 0);
assert.equal(practiceReducer(half, { type: 'pitch', hz: null, atMs: 5000 }).hold.heldMs, 0);

// --- Sound files -----------------------------------------------------------

{
  const original = tone(220, 16_000, 1600, VOICE);
  const file = writeWav(original, 16_000);
  const back = readWav(file.buffer as ArrayBuffer);
  assert.equal(back.sampleRate, 16_000);
  assert.equal(back.samples.length, original.length);
  for (let i = 0; i < original.length; i += 97) {
    assert.ok(Math.abs(back.samples[i] - original[i]) < 1 / 16_000, 'a saved sound reads back the same');
  }
  assert.throws(() => readWav(new Uint8Array([1, 2, 3, 4]).buffer), /Not a WAV file/);

  // A stereo file in 32-bit floating point, with an extra block before the
  // sound, as recording apps write them. Left is 0.5 and right is -0.1.
  const stereo = new DataView(new ArrayBuffer(12 + 24 + 12 + 8 + 16));
  const put = (at: number, value: string) =>
    [...value].forEach((letter, i) => stereo.setUint8(at + i, letter.charCodeAt(0)));
  put(0, 'RIFF');
  put(8, 'WAVEfmt ');
  stereo.setUint32(16, 16, true);
  stereo.setUint16(20, 3, true); // floating point
  stereo.setUint16(22, 2, true); // two channels
  stereo.setUint32(24, 44_100, true);
  stereo.setUint16(34, 32, true);
  put(36, 'LIST');
  stereo.setUint32(40, 4, true);
  put(48, 'data');
  stereo.setUint32(52, 16, true);
  [0.5, -0.1, 0.5, -0.1].forEach((value, i) => stereo.setFloat32(56 + i * 4, value, true));
  const mixed = readWav(stereo.buffer);
  assert.equal(mixed.sampleRate, 44_100);
  assert.equal(mixed.samples.length, 2);
  assert.ok(Math.abs(mixed.samples[0] - 0.2) < 1e-6, 'stereo is mixed down to one channel');
}

// --- Melody map ------------------------------------------------------------

/**
 * A made-up sung phrase at phone quality. Each note can wobble like a
 * singer's vibrato. Between notes there is silence, or none at all.
 */
function sing(
  notes: { midi: number; startMs: number; endMs: number; vibratoCents?: number }[],
  totalMs: number,
  sampleRate: number,
): Float32Array {
  const out = new Float32Array(Math.round((totalMs / 1000) * sampleRate));
  const random = seeded(42);
  for (const note of notes) {
    const from = Math.round((note.startMs / 1000) * sampleRate);
    const to = Math.round((note.endMs / 1000) * sampleRate);
    const fade = Math.round(0.01 * sampleRate);
    let phase = 0;
    for (let i = from; i < to; i++) {
      const seconds = (i - from) / sampleRate;
      const wobble = (note.vibratoCents ?? 0) * Math.sin(2 * Math.PI * 5.5 * seconds);
      const hz = midiToHz(note.midi) * 2 ** (wobble / 1200);
      phase += (2 * Math.PI * hz) / sampleRate;
      let sample = 0;
      for (let k = 0; k < VOICE.length; k++) sample += VOICE[k] * Math.sin(phase * (k + 1));
      const edge = Math.min(1, (i - from) / fade, (to - i) / fade);
      out[i] = 0.2 * sample * edge;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] += 0.005 * (random() * 2 - 1);
  return out;
}

{
  const phrase = [
    { midi: 60, startMs: 200, endMs: 600 },
    { midi: 62, startMs: 600, endMs: 1000 }, // no gap: sung straight on from the last
    { midi: 64, startMs: 1100, endMs: 1900, vibratoCents: 45 }, // a long, wobbling note
    { midi: 67, startMs: 2300, endMs: 2600 },
    { midi: 67, startMs: 2750, endMs: 3050 }, // the same note sung twice
    { midi: 55, startMs: 3200, endMs: 3350 }, // a short low note
  ];
  const sung = sing(phrase, 3600, 48_000);
  const map = mapMelody(sung, 48_000, 'check');

  assert.equal(map.version, 1);
  assert.equal(map.durationMs, 3600);
  assert.deepEqual(
    map.notes.map((note: MelodyNote) => noteName(note.midi)),
    phrase.map((note) => noteName(note.midi)),
    'finds every note, in order, and nothing extra',
  );
  let worstMs = 0;
  map.notes.forEach((note: MelodyNote, i: number) => {
    worstMs = Math.max(
      worstMs,
      Math.abs(note.startMs - phrase[i].startMs),
      Math.abs(note.endMs - phrase[i].endMs),
    );
  });
  assert.ok(worstMs <= 70, `note edges are within 70 ms (worst was ${worstMs} ms)`);

  // Silence gives no notes. So does a click too short to be a note.
  assert.deepEqual(mapMelody(new Float32Array(48_000), 48_000, 'silence').notes, []);
  const blip = sing([{ midi: 60, startMs: 500, endMs: 530 }], 1000, 48_000);
  assert.deepEqual(mapMelody(blip, 48_000, 'blip').notes, []);

  // One wrong reading in a steady run is thrown away.
  const run = [220, 220, 440, 220, 220].map((hz, i) => ({ atMs: i * 32, hz }));
  assert.deepEqual(steady(run).map((point) => point.hz), [220, 220, 220, 220, 220]);

  // A one-step dropout does not split a note; a long silence does.
  const step = 32;
  const points = [220, 220, 220, null, 220, 220, 220, null, null, null, null, 220, 220, 220, 220].map(
    (hz, i) => ({ atMs: i * step, hz }),
  );
  const split = findNotes({ points, stepMs: step });
  assert.equal(split.length, 2);
  assert.equal(split[0].endMs - split[0].startMs, 7 * step);

  assert.ok(trackPitch(sung, 48_000).stepMs === 32);
}

console.log(
  `All checks passed. 49 notes, C2 to C6, four kinds of tone each. ` +
    `Worst reading: ${worst.cents.toFixed(1)} cents off on ${worst.note} (${worst.kind}).`,
);
