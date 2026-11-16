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
  HIGHEST_TONE,
  LOWEST_TONE,
  NO_RUN,
  currentStep,
  noteStep,
  runReducer,
  timeLeftMs,
  type Run,
  type Step,
  type StepResult,
} from '../src/lib/exercise.ts';
import {
  LEVELS,
  NEW_PROGRESS,
  achievements,
  applyResults,
  didPass,
  isOpen,
  levelSteps,
  nextLevel,
  parseProgress,
  usableHome,
  type Progress,
} from '../src/lib/progression.ts';
import { MAJOR_SCALE, SHIFTS, STARTS, canShift, canStartOn, scaleSteps } from '../src/lib/quick.ts';
import { grade, noteScore, rangeSize, summarize } from '../src/lib/report.ts';
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

// --- Exercises: a list of steps the app works through by itself -------------

const hzOf = (midi: number, cents = 0) => midiToHz(midi) * 2 ** (cents / 1200);
const hear = (run: Run, hz: number | null, atMs: number) =>
  runReducer(run, { type: 'pitch', hz, atMs });
/** Sing one pitch steadily from `from` for `ms`, a reading every 100 ms. */
function singFor(run: Run, hz: number | null, from: number, ms: number): Run {
  let next = run;
  for (let at = from; at <= from + ms; at += 100) next = hear(next, hz, at);
  return next;
}

assert.equal(hear(NO_RUN, 220, 0), NO_RUN, 'nothing is scored before a start');
assert.equal(runReducer(NO_RUN, { type: 'start', steps: [] }), NO_RUN);
assert.equal(currentStep(NO_RUN), null);

{
  // Three notes: the first matched, the second missed, the third matched an octave down.
  const steps = [noteStep(60), noteStep(62), noteStep(64)];
  let run = runReducer(NO_RUN, { type: 'start', steps });
  assert.equal(run.phase, 'tone');
  assert.equal(run.turn, 1);
  assert.equal(currentStep(run)?.midi, 60);
  assert.equal(hear(run, hzOf(60), 0), run, 'nothing is scored while the tone plays');

  run = runReducer(run, { type: 'listen', atMs: 1000 });
  assert.equal(run.phase, 'listening');
  assert.equal(timeLeftMs(run), 3500);
  run = hear(run, hzOf(60, 60), 1100);
  run = hear(run, hzOf(60, -30), 1200);
  run = hear(run, hzOf(60, 80), 1300);
  assert.equal(Math.round(run.closest?.cents ?? 0), -30, 'the best attempt is kept');
  assert.equal(Math.round(run.reading?.cents ?? 0), 80);
  run = singFor(run, hzOf(60, 5), 1400, 2000);

  assert.equal(run.phase, 'tone', 'a match moves straight to the next tone');
  assert.equal(run.index, 1);
  assert.equal(run.turn, 2);
  assert.equal(run.results.length, 1);
  assert.ok(run.results[0].matched);
  assert.equal(run.results[0].sungMidi, 60);
  assert.equal(run.results[0].heldMs, 2000);
  assert.equal(run.hz, null, 'the new step starts clean');
  assert.equal(run.closest, null);

  run = runReducer(run, { type: 'listen', atMs: 10_000 });
  run = hear(run, hzOf(62, 45), 11_000);
  run = singFor(run, hzOf(62), 12_800, 700); // in tune, but too late to hold two seconds
  assert.equal(run.index, 2, 'time ran out and it moved on');
  assert.ok(!run.results[1].matched);
  assert.equal(Math.round(run.results[1].closestCents ?? 99), 0);
  assert.equal(run.results[1].heldMs, 700);

  run = runReducer(run, { type: 'listen', atMs: 20_000 });
  run = singFor(run, hzOf(52), 20_100, 2000); // E3 for an E4 target
  assert.equal(run.phase, 'done');
  assert.equal(run.turn, 3, 'no tone is due after the last step');
  assert.ok(run.results[2].matched, 'the same note an octave down counts');
  assert.equal(run.results[2].sungMidi, 52, 'and the report knows which octave was really sung');
  assert.equal(currentStep(run), null);
  assert.equal(hear(run, 220, 99_999), run);

  const card = summarize(run.results);
  assert.equal(card.attempted, 3);
  assert.equal(card.matched, 2);
  assert.equal(card.lowestSung, 52);
  assert.equal(card.highestSung, 60);
  assert.equal(rangeSize(card), 9);
  assert.equal(card.longestHoldMs, 2000);
  assert.ok(card.averageOffCents !== null && card.averageOffCents < 5);
  // Matched, missed-but-close (0 cents off, held 700 of 2000 ms), matched.
  assert.deepEqual(run.results.map(noteScore), [100, 68, 100]);
  assert.equal(card.score, 89);
  assert.equal(grade(card), 'B');

  // A second set starts a fresh run, and the session report joins both.
  const again = runReducer(run, { type: 'start', steps });
  assert.equal(again.results.length, 0);
  assert.equal(again.turn, 4, 'a new start is a new turn, so the tone plays');
  assert.equal(summarize([...run.results, ...run.results]).attempted, 6);
}

{
  // Silence all the way: only the clock moves it on.
  let run = runReducer(NO_RUN, { type: 'start', steps: [noteStep(60), noteStep(62)] });
  run = runReducer(run, { type: 'listen', atMs: 0 });
  run = runReducer(run, { type: 'tick', atMs: 2000 });
  assert.equal(timeLeftMs(run), 1500);
  run = runReducer(run, { type: 'tick', atMs: 3600 });
  assert.equal(run.index, 1);
  assert.deepEqual(
    [run.results[0].matched, run.results[0].closestCents, run.results[0].sungMidi],
    [false, null, null],
  );
  const stopped = runReducer(run, { type: 'stop' });
  assert.equal(stopped.phase, 'ready');
  assert.equal(stopped.results.length, 0);
  assert.equal(runReducer(stopped, { type: 'listen', atMs: 5 }), stopped, 'a late tone does not restart it');
  assert.equal(summarize([]).averageOffCents, null);
  assert.equal(grade(summarize([])), null);
  assert.equal(summarize([]).score, null);
  assert.equal(noteScore(run.results[0]), 0, 'a note never heard scores nothing');
}

{
  // A long hold needs the whole time, and a wobble out of tune starts it over.
  const step: Step = { midi: 57, holdMs: 5000, listenMs: 9000 };
  let run = runReducer(NO_RUN, { type: 'start', steps: [step] });
  run = runReducer(run, { type: 'listen', atMs: 0 });
  run = singFor(run, hzOf(57), 0, 3000);
  assert.equal(run.phase, 'listening', 'two seconds is not enough here');
  run = singFor(run, hzOf(57, 70), 3100, 500);
  assert.equal(run.hold.heldMs, 0);
  run = singFor(run, hzOf(57), 3700, 5000);
  assert.equal(run.phase, 'done');
  assert.ok(run.results[0].matched);
  assert.equal(run.results[0].heldMs, 5000);
}

{
  // "Any steady note": no target. Sliding around does not count; settling does.
  const step: Step = { midi: null, holdMs: 2000, listenMs: 8000 };
  let run = runReducer(NO_RUN, { type: 'start', steps: [step] });
  run = runReducer(run, { type: 'listen', atMs: 0 });
  run = singFor(run, hzOf(50), 0, 1000);
  assert.equal(run.settledMidi, 50);
  run = singFor(run, hzOf(53, 20), 1100, 1500); // moved to another note: count restarts
  assert.equal(run.phase, 'listening');
  assert.equal(run.settledMidi, 53);
  run = singFor(run, hzOf(53, -10), 2700, 600);
  assert.equal(run.phase, 'done');
  assert.ok(run.results[0].matched);
  assert.equal(run.results[0].sungMidi, 53);
}

// --- Quick practice --------------------------------------------------------

assert.deepEqual(MAJOR_SCALE, [0, 2, 4, 5, 7, 9, 11, 12]);
assert.deepEqual(
  scaleSteps(STARTS.medium).map((step) => noteName(step.midi ?? 0)),
  ['A♯2', 'C3', 'D3', 'D♯3', 'F3', 'G3', 'A3', 'A♯3'],
);
assert.deepEqual(
  Object.entries(STARTS).map(([choice, start]) => `${choice} ${noteName(start)}`),
  ['low A2', 'medium A♯2', 'high C3', 'top C4'],
);
assert.deepEqual(SHIFTS.map((shift) => shift.by), [-6, -1, 0, 1, 6]);

{
  // Partial credit for a missed note: half for closeness, half for the hold.
  const step = noteStep(60);
  const missed = (closestCents: number | null, heldMs: number): StepResult => ({
    step,
    matched: false,
    closestCents,
    sungMidi: 60,
    heldMs,
  });
  assert.equal(noteScore({ ...missed(0, 2000), matched: true }), 100);
  assert.equal(noteScore(missed(null, 0)), 0);
  assert.equal(noteScore(missed(100, 0)), 0, 'a semitone off earns nothing');
  assert.equal(noteScore(missed(-250, 0)), 0);
  assert.equal(noteScore(missed(50, 0)), 25, 'half a semitone off, never in tune');
  assert.equal(noteScore(missed(-40, 0)), 30, 'flat counts the same as sharp');
  assert.equal(noteScore(missed(10, 1000)), 70, 'in tune for half the hold');
  assert.equal(noteScore(missed(0, 1990)), 99, 'a miss never reaches full marks');
  const letter = (scores: StepResult[]) => grade(summarize(scores));
  assert.equal(letter([{ ...missed(0, 2000), matched: true }]), 'A');
  assert.equal(letter([missed(10, 1000)]), 'C');
  assert.equal(letter([missed(20, 400)]), 'F');
  assert.equal(summarize([missed(10, 1000), { ...missed(0, 2000), matched: true }]).score, 85);
}
for (const start of Object.values(STARTS)) {
  assert.ok(canStartOn(start));
  assert.ok(canShift(start, 0));
}
assert.ok(canStartOn(LOWEST_TONE) && canStartOn(HIGHEST_TONE - 12));
assert.ok(!canStartOn(LOWEST_TONE - 1) && !canStartOn(HIGHEST_TONE - 11));
assert.ok(!canShift(STARTS.low, -12), 'no going below the lowest tone');
assert.ok(canShift(STARTS.low, -6) && !canShift(LOWEST_TONE, -1));
assert.ok(canShift(STARTS.high, 6) && !canShift(HIGHEST_TONE - 12, 1));
for (const shift of SHIFTS) assert.ok(shift.spoken.length > 0 && shift.label.split('\n').length <= 2);

// --- Progression -----------------------------------------------------------

{
  const result = (step: Step, matched: boolean, sungMidi: number | null, heldMs = 2000): StepResult => ({
    step,
    matched,
    closestCents: matched ? 3 : 60,
    sungMidi,
    heldMs,
  });
  const pass = (progress: Progress, id: string, sungAbove = 0): Progress => {
    const level = LEVELS.find((each) => each.id === id)!;
    const steps = levelSteps(progress, level);
    const results = steps.map((step) =>
      result(step, true, (step.midi ?? 50) + sungAbove, step.holdMs),
    );
    return applyResults(progress, level, results);
  };

  assert.equal(new Set(LEVELS.map((level) => level.id)).size, LEVELS.length, 'level ids are unique');
  assert.equal(nextLevel(NEW_PROGRESS)?.id, 'home');
  assert.ok(isOpen(NEW_PROGRESS, LEVELS[0]) && !isOpen(NEW_PROGRESS, LEVELS[1]));
  assert.deepEqual(parseProgress(null), NEW_PROGRESS);
  assert.deepEqual(parseProgress('not json'), NEW_PROGRESS);
  assert.deepEqual(parseProgress('{"home":"x","passed":["home","made-up"]}').passed, ['home']);

  // Every level's notes have a tone, for the lowest and highest usable home notes.
  assert.equal(usableHome(50), 50);
  assert.equal(usableHome(30), 54, 'a very low home note moves up by octaves');
  assert.equal(usableHome(80), 68, 'and a very high one moves down');
  for (const home of [usableHome(0), usableHome(127), 50]) {
    for (const level of LEVELS) {
      const steps = level.steps(home);
      assert.ok(level.passMark >= 1 && level.passMark <= steps.length, `${level.id} pass mark`);
      for (const step of steps) {
        assert.ok(step.listenMs > step.holdMs, `${level.id} leaves time to find the note`);
        if (step.midi !== null) {
          assert.ok(step.midi >= LOWEST_TONE && step.midi <= HIGHEST_TONE, `${level.id} ${step.midi}`);
        }
      }
    }
  }

  // Level 1 sets the home note. A failed try changes nothing but the records.
  const homeLevel = LEVELS[0];
  const homeStep = homeLevel.steps(0)[0];
  const failed = applyResults(NEW_PROGRESS, homeLevel, [result(homeStep, false, null, 400)]);
  assert.equal(failed.home, null);
  assert.deepEqual(failed.passed, []);
  let progress = applyResults(NEW_PROGRESS, homeLevel, [result(homeStep, true, 50)]);
  assert.equal(progress.home, 50);
  assert.deepEqual(progress.passed, ['home']);
  assert.equal(nextLevel(progress)?.id, 'match');
  assert.deepEqual(levelSteps(progress, LEVELS[1]).map((step) => step.midi), [50]);
  assert.ok(isOpen(progress, LEVELS[1]) && !isOpen(progress, LEVELS[2]));

  // A level below its pass mark is not passed; trying again does not double-count.
  const three = LEVELS.find((level) => level.id === 'three-up')!;
  const threeSteps = levelSteps(progress, three);
  const oneOfThree = [result(threeSteps[0], true, 50), result(threeSteps[1], false, null), result(threeSteps[2], false, null)];
  assert.ok(!didPass(three, oneOfThree));
  progress = pass(progress, 'match');
  progress = pass(pass(progress, 'match'), 'three-up');
  assert.deepEqual(progress.passed, ['home', 'match', 'three-up']);

  const earned = (state: Progress) =>
    achievements(state).filter((each) => each.earned).map((each) => each.title);
  assert.deepEqual(earned(NEW_PROGRESS), []);
  assert.deepEqual(earned(progress), ['First note', 'On pitch']);
  progress = pass(pass(progress, 'five-up-back'), 'hold-5');
  assert.equal(progress.longestHoldMs, 5000);
  assert.ok(earned(progress).includes('Steady breath') && !earned(progress).includes('Long breath'));
  progress = pass(progress, 'octave');
  assert.equal(progress.highestSung, 62);
  assert.ok(earned(progress).includes('Full octave') && earned(progress).includes('Octave range'));
  for (const id of ['jumps', 'hold-10', 'reach-down', 'reach-up']) progress = pass(progress, id);
  assert.equal(nextLevel(progress), null, 'every level can be passed');
  assert.equal(earned(progress).length, achievements(progress).length);
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress, 'progress survives saving');
}

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
