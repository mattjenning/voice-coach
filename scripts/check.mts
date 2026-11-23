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
  SLIDE_SHAPE,
  VOICE_GAP_MS,
  VOLUME_TOLERANCE,
  currentStep,
  loudnessShare,
  noteStep,
  slideMidiAt,
  slideMs,
  slideStep,
  stepPath,
  volumeSteps,
  COUNTDOWN_MS,
  countdownDots,
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
import { grade, isPassing, noteScore, rangeSize, summarize } from '../src/lib/report.ts';
import { DIFFICULTY, pathSound, slideSteps, stepLabel } from '../src/lib/slide.ts';
import { HIT_LEVELS, HIT_RUNS, hitSteps } from '../src/lib/hits.ts';
import {
  AMAZING_GRACE,
  PASSES_TO_MASTER,
  addPasses,
  isClean,
  lineMastered,
  lineStep,
  nextLine,
  noPasses,
  parsePasses,
  songMastered,
  songSteps,
} from '../src/lib/song.ts';
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

// --- Slides ----------------------------------------------------------------

{
  const step = slideStep(60, 62); // C4 gliding up to D4
  const slide = step.slide!;
  const total = slideMs(slide);
  assert.equal(total, 4000);
  assert.equal(slideMidiAt(60, slide, 0), 60);
  assert.equal(slideMidiAt(60, slide, SLIDE_SHAPE.leadMs), 60);
  assert.equal(slideMidiAt(60, slide, 2000), 61, 'half way through the glide is half way between');
  assert.equal(slideMidiAt(60, slide, total), 62);
  assert.equal(stepLabel(step), 'C4 → D4');
  assert.equal(stepLabel(noteStep(60)), 'C4');

  /** Sing along a slide: `pitchAt` gives the note number sung at each moment, or null. */
  const follow = (startAt: number, pitchAt: (tMs: number) => number | null): Run => {
    let run = runReducer(NO_RUN, { type: 'start', steps: [step] });
    run = runReducer(run, { type: 'listen', atMs: 0 });
    for (let at = 100; at < startAt; at += 100) run = hear(run, null, at);
    for (let at = startAt; run.phase === 'listening' && at < 20_000; at += 100) {
      const midi = pitchAt(at - startAt);
      run = hear(run, midi === null ? null : hzOf(midi), at);
    }
    return run;
  };

  const perfect = follow(100, (t) => slideMidiAt(60, slide, t));
  assert.equal(perfect.phase, 'done');
  assert.equal(perfect.results[0].score, 100);
  assert.ok(perfect.results[0].matched);
  assert.equal(perfect.results[0].sungMidi, 60);
  assert.equal(noteScore(perfect.results[0]), 100);

  const lateStart = follow(1800, (t) => slideMidiAt(60, slide, t));
  assert.equal(lateStart.results[0].score, 100, 'the clock starts when the singer does');

  const octaveDown = follow(100, (t) => slideMidiAt(60, slide, t) - 12);
  assert.equal(octaveDown.results[0].score, 100, 'an octave down still counts');
  assert.equal(octaveDown.results[0].sungMidi, 48);

  // Staying on the first note: on the line for the lead-in and the first part of the glide.
  const stuck = follow(100, () => 60);
  const stuckScore = stuck.results[0].score ?? -1;
  assert.ok(stuckScore > 25 && stuckScore < 45, `staying put scored ${stuckScore}`);
  assert.ok(!stuck.results[0].matched);
  assert.ok((stuck.results[0].closestCents ?? 0) > 50);

  // Singing the slide well, then stopping half way.
  const halfway = follow(100, (t) => (t <= 2000 ? slideMidiAt(60, slide, t) : null));
  const halfScore = halfway.results[0].score ?? -1;
  assert.ok(halfScore > 45 && halfScore < 60, `stopping half way scored ${halfScore}`);

  const silent = follow(99_999, () => null);
  assert.equal(silent.results[0].score, 0);
  assert.equal(silent.results[0].closestCents, null);
  assert.equal(summarize(silent.results).score, 0);

  // If the microphone goes quiet mid-slide, the clock alone still ends it.
  let ticking = runReducer(NO_RUN, { type: 'start', steps: [step, step] });
  ticking = runReducer(ticking, { type: 'listen', atMs: 0 });
  ticking = hear(ticking, hzOf(60), 200);
  ticking = runReducer(ticking, { type: 'tick', atMs: 2000 });
  assert.equal(ticking.index, 0);
  ticking = runReducer(ticking, { type: 'tick', atMs: 3300 });
  assert.equal(ticking.index, 0);
  ticking = runReducer(ticking, { type: 'tick', atMs: 4300 });
  assert.equal(ticking.index, 1, 'four seconds after the first sound, it moves on');

  // The sets: seven slides each.
  // Up and down sets start from different notes, and never repeat a slide back to back.
  for (const order of ['up', 'down', 'random'] as const) {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const set = slideSteps(48, order, level, seeded(seed));
        const labels = set.map(stepLabel);
        for (let i = 1; i < labels.length; i++) {
          assert.notEqual(labels[i], labels[i - 1], `${order} ${level}: no slide twice in a row`);
        }
        assert.ok(new Set(set.map((each) => each.midi)).size >= 3, `${order} ${level}: varied starts`);
        for (const each of set) {
          assert.equal(each.onCue, true, 'slides start on cue');
          assert.equal(each.countdownMs, COUNTDOWN_MS, 'after a one-second countdown');
        }
      }
    }
  }
  const scaleNotes = MAJOR_SCALE.map((above) => 48 + above);
  for (const seed of [1, 2, 3, 4, 5]) {
    const any = slideSteps(48, 'random', 'hard', seeded(seed));
    assert.equal(any.length, 7);
    for (const each of any) {
      assert.ok(scaleNotes.includes(each.midi ?? -1) && scaleNotes.includes(each.slide!.toMidi));
      const far = each.slide!.viaMidi ?? each.slide!.toMidi;
      assert.notEqual(each.midi, far, 'a slide has to go somewhere');
    }
  }
  assert.notDeepEqual(
    slideSteps(48, 'random', 'hard', seeded(1)).map(stepLabel),
    slideSteps(48, 'random', 'hard', seeded(2)).map(stepLabel),
  );

  // A slide that turns: up from C4 to E4 and back.
  const arch = slideStep(60, 60, 64);
  const archSlide = arch.slide!;
  assert.equal(stepLabel(arch), 'C4 → E4 → C4');
  assert.equal(slideMidiAt(60, archSlide, 500), 60);
  assert.equal(slideMidiAt(60, archSlide, 1250), 62, 'half way up');
  assert.equal(slideMidiAt(60, archSlide, 2000), 64, 'the turn, half way through the glide');
  assert.equal(slideMidiAt(60, archSlide, 2750), 62, 'half way back down');
  assert.equal(slideMidiAt(60, archSlide, 4000), 60);
  const archSound = trackPitch(pathSound(stepPath(arch)!, 12_000), 12_000).points;
  const top = archSound.find((point) => point.atMs >= 2000)?.hz ?? 0;
  assert.ok(Math.abs(centsBetween(top, midiToHz(64))) < 25, 'the sound peaks on E4');
  let archRun = runReducer(NO_RUN, { type: 'start', steps: [arch] });
  archRun = runReducer(archRun, { type: 'listen', atMs: 0 });
  for (let at = 100; archRun.phase === 'listening'; at += 100) {
    archRun = hear(archRun, hzOf(slideMidiAt(60, archSlide, at - 100)), at);
  }
  assert.equal(archRun.results[0].score, 100);
  // Singing only the way up, and staying at the top, loses the way down.
  let stayedUp = runReducer(NO_RUN, { type: 'start', steps: [arch] });
  stayedUp = runReducer(stayedUp, { type: 'listen', atMs: 0 });
  for (let at = 100; stayedUp.phase === 'listening'; at += 100) {
    stayedUp = hear(stayedUp, hzOf(slideMidiAt(60, archSlide, Math.min(at - 100, 2000))), at);
  }
  const stayedScore = stayedUp.results[0].score ?? -1;
  assert.ok(stayedScore > 50 && stayedScore < 70, `staying at the top scored ${stayedScore}`);

  // Difficulty: how far a slide may travel, how long it lasts, whether it may turn.
  const scaleIndex = (midi: number) => scaleNotes.indexOf(midi);
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const rule = DIFFICULTY[level];
    let turning = 0;
    let uneven = 0;
    let longest = 0;
    let shortest = 99;
    const glides = new Set<number>();
    const leads = new Set<number>();
    for (const order of ['up', 'down', 'random'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const set = slideSteps(48, order, level, seeded(seed));
        assert.equal(set.length, 7);
        for (const each of set) {
          const far = each.slide!.viaMidi ?? each.slide!.toMidi;
          const travelled = Math.abs(scaleIndex(far) - scaleIndex(each.midi ?? -1));
          assert.ok(scaleIndex(far) >= 0 && scaleIndex(each.midi ?? -1) >= 0, 'stays on the scale');
          assert.ok(
            travelled >= rule.minSteps && travelled <= rule.maxSteps,
            `${level} ${order}: ${stepLabel(each)}`,
          );
          const usual = SLIDE_SHAPE.glideMs + rule.extraMs;
          assert.ok(
            each.slide!.glideMs >= usual * 0.74 && each.slide!.glideMs <= usual * 1.34,
            `${level} glide of ${each.slide!.glideMs} ms is near ${usual}`,
          );
          assert.ok(each.slide!.leadMs >= 300 && each.slide!.leadMs <= 900);
          glides.add(each.slide!.glideMs);
          leads.add(each.slide!.leadMs);
          longest = Math.max(longest, travelled);
          shortest = Math.min(shortest, travelled);
          if (each.slide!.viaMidi !== undefined) {
            turning++;
            assert.equal(order, 'random', 'only random slides turn');
            // Out one way, back the other, and the way back is its own size.
            const out = scaleIndex(far) - scaleIndex(each.midi ?? -1);
            const back = scaleIndex(each.slide!.toMidi) - scaleIndex(far);
            assert.ok(out * back < 0, `${stepLabel(each)} turns round`);
            assert.ok(Math.abs(back) >= rule.minSteps && Math.abs(back) <= rule.maxSteps, stepLabel(each));
            if (Math.abs(back) !== Math.abs(out)) uneven++;
          } else if (order !== 'random') {
            assert.equal(far > (each.midi ?? 0), order === 'up', `${order} slides go ${order}`);
          }
        }
      }
    }
    assert.equal(longest, rule.maxSteps, `${level} uses its whole reach`);
    assert.equal(shortest, rule.minSteps, `${level} never moves less than ${rule.minSteps}`);
    if (rule.turns) assert.ok(uneven > 10, 'many turning slides come back a different distance');
    assert.equal(turning > 0, rule.turns, `${level} ${rule.turns ? 'has' : 'has no'} turning slides`);
    assert.ok(glides.size >= 8, `${level} slides glide at many speeds (${glides.size})`);
    assert.ok(leads.size >= 5, `${level} slides hold their first note for different times`);
  }
  // On average, harder slides still take longer.
  const average = (level: 'easy' | 'medium' | 'hard') => {
    const all = Array.from({ length: 20 }, (_, i) => slideSteps(48, 'random', level, seeded(i + 1))).flat();
    return all.reduce((sum, each) => sum + each.slide!.glideMs, 0) / all.length;
  };
  assert.ok(average('easy') < average('medium') && average('medium') < average('hard'));

  // On cue: the slide's clock starts when the countdown ends, not when the singer does.
  {
    const cued = slideSteps(48, 'up', 'easy', seeded(4))[0];
    const cuedPath = stepPath(cued)!;
    const sing = (lateBy: number) => {
      let run = runReducer(NO_RUN, { type: 'start', steps: [cued] });
      run = runReducer(run, { type: 'listen', atMs: 0 });
      assert.equal(run.slideStartedAt, COUNTDOWN_MS);
      for (let at = 100; run.phase === 'listening' && at < 20_000; at += 100) {
        const t = at - COUNTDOWN_MS;
        run = hear(run, t < lateBy ? null : hzOf(cuedPath.midiAt(Math.max(0, t))), at);
      }
      return run;
    };
    assert.equal(sing(0).results[0].score, 100, 'on cue and on the line');
    const late = sing(1500).results[0].score ?? -1;
    assert.ok(late > 40 && late < 80, `starting 1.5 seconds late scored ${late}`);
    // The clock alone ends it, even in silence.
    let quiet = runReducer(NO_RUN, { type: 'start', steps: [cued, cued] });
    quiet = runReducer(quiet, { type: 'listen', atMs: 0 });
    quiet = runReducer(quiet, { type: 'tick', atMs: COUNTDOWN_MS + cuedPath.totalMs + 50 });
    assert.equal(quiet.index, 1);
    assert.equal(quiet.results[0].score, 0);
  }

  // The sound of a slide really starts on one note and ends on the other.
  const sound = pathSound(stepPath(step)!, 12_000);
  assert.equal(sound.length, 48_000);
  const heard = trackPitch(sound, 12_000).points.filter((point) => point.hz !== null);
  const first = heard[2].hz ?? 0;
  const last = heard[heard.length - 3].hz ?? 0;
  assert.ok(Math.abs(centsBetween(first, midiToHz(60))) < 10, 'starts on C4');
  assert.ok(Math.abs(centsBetween(last, midiToHz(62))) < 10, 'ends on D4');
  const middle = heard.find((point) => point.atMs >= 2000)?.hz ?? 0;
  assert.ok(Math.abs(centsBetween(middle, midiToHz(61))) < 25, 'and passes through the middle');
  let peak = 0;
  for (const value of sound) peak = Math.max(peak, Math.abs(value));
  assert.ok(Math.abs(peak - 0.9) < 0.001);
}

// --- Hit the Notes ----------------------------------------------------------

{
  const scaleNotes = MAJOR_SCALE.map((above) => 48 + above);
  const place = (midi: number) => scaleNotes.indexOf(midi);
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const rule = HIT_LEVELS[level];
    let biggest = 0;
    let lowest = 99;
    let highest = -1;
    const firsts = new Set<number>();
    const lengths = new Set<number>();
    let uneven = 0;
    let runs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const set = hitSteps(48, level, seeded(seed));
      runs += set.length;
      assert.equal(set.length, HIT_RUNS);
      for (const each of set) {
        const notes = each.phrase!;
        assert.equal(each.onCue, true, 'starts on cue');
        assert.equal(each.countdownMs, COUNTDOWN_MS);
        assert.equal(notes.length, rule.notes, `${level} runs have ${rule.notes} notes`);
        const places = notes.map((note) => place(note.midi));
        assert.ok(places.every((p) => p >= 0), 'every note is on the scale');
        assert.ok(
          notes.every((note) => note.ms >= rule.shortestMs && note.ms <= rule.longestMs && note.ms % 50 === 0),
          `${level} notes last ${rule.shortestMs} to ${rule.longestMs} ms`,
        );
        notes.forEach((note) => lengths.add(note.ms));
        if (new Set(notes.map((note) => note.ms)).size > 1) uneven++;
        assert.ok(Math.max(...places) - Math.min(...places) < rule.span, `${level} stays inside ${rule.span} notes`);
        let changes = 0;
        for (let i = 1; i < places.length; i++) {
          const jump = places[i] - places[i - 1];
          assert.ok(jump !== 0 && Math.abs(jump) <= rule.maxJump, `${level}: ${each.name}`);
          biggest = Math.max(biggest, Math.abs(jump));
          if (i > 1 && Math.sign(jump) !== Math.sign(places[i - 1] - places[i - 2])) changes++;
        }
        if (rule.turns !== Infinity) assert.equal(changes, rule.turns, `${level} turns ${rule.turns} times: ${each.name}`);
        lowest = Math.min(lowest, ...places);
        highest = Math.max(highest, ...places);
        firsts.add(places[0]);
        // The whole run is the notes, one after another.
        const path = stepPath(each)!;
        assert.equal(path.totalMs, notes.reduce((sum, note) => sum + note.ms, 0));
        assert.equal(path.midiAt(notes[0].ms + notes[1].ms / 2), notes[1].midi);
      }
    }
    assert.equal(biggest, rule.maxJump, `${level} uses its biggest jump`);
    assert.equal(lowest, 0, `${level} reaches the bottom`);
    assert.equal(highest, 7, `${level} reaches the top`);
    assert.ok(firsts.size >= 5, `${level} runs start on many notes`);
    assert.ok(lengths.has(rule.shortestMs) && lengths.has(rule.longestMs), `${level} uses its whole range of lengths`);
    assert.ok(uneven > runs * 0.9, `${level}: nearly every run mixes note lengths (${uneven} of ${runs})`);
  }
  assert.notDeepEqual(
    hitSteps(48, 'medium', seeded(1)).map(stepLabel),
    hitSteps(48, 'medium', seeded(2)).map(stepLabel),
  );
  assert.equal(stepLabel(hitSteps(48, 'easy', seeded(1))[0]).split(' ').length, 4, 'named by its notes');

  // Singing the run on cue scores full marks; singing one note throughout does not.
  const run = hitSteps(48, 'medium', seeded(3))[0];
  const path = stepPath(run)!;
  const sing = (pitchAt: (t: number) => number) => {
    let state = runReducer(NO_RUN, { type: 'start', steps: [run] });
    state = runReducer(state, { type: 'listen', atMs: 0 });
    for (let at = 50; state.phase === 'listening' && at < 20_000; at += 50) {
      state = hear(state, hzOf(pitchAt(Math.max(0, at - COUNTDOWN_MS))), at);
    }
    return state.results[0];
  };
  const good = sing((t) => path.midiAt(t));
  assert.equal(good.score, 100);
  assert.ok(good.matched);
  const flat = sing(() => run.phrase![0].midi);
  assert.ok(!flat.matched && (flat.score ?? 100) < 50, `one note throughout scored ${flat.score}`);
}

// --- Volume match ----------------------------------------------------------

{
  assert.equal(loudnessShare(-40, -40, -20), 0);
  assert.equal(loudnessShare(-20, -40, -20), 1);
  assert.equal(loudnessShare(-30, -40, -20), 0.5);
  assert.equal(loudnessShare(-35, -40, -38), 0.5, 'a tiny range is widened to ten decibels');
  assert.ok(loudnessShare(-30, null, null) > 0 && loudnessShare(-30, null, null) < 1);

  const steps = volumeSteps();
  /** Every step opens with a countdown. Singing starts after it. */
  const C = COUNTDOWN_MS;
  assert.deepEqual(steps.map(stepLabel), ['As soft as you can', 'Loud, but comfortable', 'Soft', 'Loud', 'Medium', 'Very loud', 'Very soft']);
  assert.deepEqual(steps.map((step) => step.midi), [null, null, null, null, null, null, null], 'no tone plays: it starts listening straight away');

  const loud = (run: Run, db: number | null, atMs: number) =>
    runReducer(run, { type: 'pitch', hz: db === null ? null : 196, atMs, db: db ?? -80 });
  /** Sing at one loudness from `from` for `ms`. */
  const singAt = (run: Run, db: number | null, from: number, ms: number): Run => {
    let next = run;
    for (let at = from; at <= from + ms && next.phase === 'listening'; at += 100) next = loud(next, db, at);
    return next;
  };

  let run = runReducer(NO_RUN, { type: 'start', steps });
  // Soft: -42. Loud: -18. Then the singer's range is 24 decibels wide.
  run = runReducer(run, { type: 'listen', atMs: 0 });
  run = singAt(run, -42, 100 + C, 4000);
  assert.equal(run.index, 1);
  assert.equal(run.quietDb, -42);
  assert.ok(run.results[0].matched);
  run = runReducer(run, { type: 'listen', atMs: 10_000 });
  run = singAt(run, -18, 10_100 + C, 4000);
  assert.equal(run.loudDb, -18);
  assert.equal(run.quietDb, -42, 'the soft reading is kept for the rest of the run');

  // "Soft" is a quarter of the way up: -36. Singing there for two seconds matches it.
  run = runReducer(run, { type: 'listen', atMs: 20_000 });
  run = loud(run, -20, 20_100 + C); // far too loud at first
  assert.ok((run.loudness ?? 0) > 0.9);
  assert.equal(run.hold.heldMs, 0);
  run = singAt(run, -36, 20_200 + C, 2100);
  assert.equal(run.index, 3, 'held in range, so it moved on');
  assert.ok(run.results[2].matched);
  assert.equal(noteScore(run.results[2]), 100);

  // "Loud" is three quarters up: -24. Singing at -33, well short, misses.
  run = runReducer(run, { type: 'listen', atMs: 30_000 });
  run = singAt(run, -33, 30_100 + C, 6000);
  assert.equal(run.index, 4);
  assert.ok(!run.results[3].matched);
  const short = noteScore(run.results[3]);
  assert.ok(short > 5 && short < 40, `well short scored ${short}`);

  // "Medium": in range for one second, then silence. Partial credit.
  run = runReducer(run, { type: 'listen', atMs: 40_000 });
  run = singAt(run, -30, 40_100 + C, 1000);
  run = singAt(run, null, 41_200 + C, 5000);
  assert.ok(!run.results[4].matched);
  assert.equal(run.results[4].heldMs, 1000);
  assert.equal(noteScore(run.results[4]), 75, 'spot on, held half the time');

  // The edge of the range counts; just past it does not.
  const edge = 0.95 - VOLUME_TOLERANCE + 0.01; // "Very loud" is 0.95
  run = runReducer(run, { type: 'listen', atMs: 50_000 });
  run = singAt(run, -42 + 24 * edge, 50_100 + C, 2100);
  assert.ok(run.results[5].matched);
  run = runReducer(run, { type: 'listen', atMs: 60_000 });
  run = singAt(run, -42 + 24 * (0.05 + VOLUME_TOLERANCE + 0.03), 60_100 + C, 6000); // "Very soft" is 0.05
  assert.equal(run.phase, 'done');
  assert.ok(!run.results[6].matched);

  // The countdown: three dots, then two, then one, then listening. Singing during it does not count.
  {
    let counting = runReducer(NO_RUN, { type: 'start', steps });
    counting = runReducer(counting, { type: 'listen', atMs: 0 });
    assert.equal(countdownDots(counting), 3);
    counting = loud(counting, -42, 400);
    assert.equal(countdownDots(counting), 2);
    assert.deepEqual(counting.levels, [], 'singing during the countdown is not counted');
    counting = runReducer(counting, { type: 'tick', atMs: 700 });
    assert.equal(countdownDots(counting), 1);
    counting = runReducer(counting, { type: 'tick', atMs: C });
    assert.equal(countdownDots(counting), 0);
    counting = loud(counting, -42, C + 100);
    assert.equal(counting.levels.length, 1, 'after the countdown it listens');
    assert.equal(counting.deadlineMs, C + 3500, 'the countdown does not eat into the listening time');
  }

  const card = summarize(run.results);
  assert.equal(card.attempted, 7);
  assert.equal(card.matched, 4);
  assert.equal(card.averageOffCents, null, 'loudness has no pitch to miss');

  // Silence while learning the range: nothing is learned, and the usual range stands in.
  let quiet = runReducer(NO_RUN, { type: 'start', steps });
  quiet = runReducer(quiet, { type: 'listen', atMs: 0 });
  quiet = runReducer(quiet, { type: 'tick', atMs: 4000 + C });
  assert.equal(quiet.index, 1);
  assert.equal(quiet.quietDb, null);
  assert.ok(!quiet.results[0].matched);
}

// --- Song mode -------------------------------------------------------------

{
  const song = AMAZING_GRACE;
  assert.equal(song.lines.length, 4);
  const names = (index: number) => song.lines[index].notes.map((note) => noteName(note.midi)).join(' ');
  assert.equal(names(0), 'D4 G4 B4 G4 B4 A4 G4 E4 D4');
  assert.equal(names(1), 'D4 G4 B4 G4 B4 A4 D5');
  assert.equal(names(2), 'B4 D5 B4 G4 D4 E4 G4 E4 D4');
  assert.equal(names(3), 'D4 G4 B4 G4 B4 A4 G4');
  // The tune uses only five notes. Each line is a pickup beat and then three bars of three:
  // twelve beats where the last note is cut short for the next pickup, ten where it is held.
  const used = new Set(song.lines.flatMap((each) => each.notes.map((note) => note.midi % 12)));
  assert.deepEqual([...used].sort((a, b) => a - b), [2, 4, 7, 9, 11]);
  for (const each of song.lines) {
    const beats = each.notes.reduce((sum, note) => sum + note.ms, 0) / 700;
    assert.ok([10, 12].includes(beats), `"${each.words}" is ${beats} beats`);
    for (const note of each.notes) {
      assert.ok(note.midi >= LOWEST_TONE && note.midi <= HIGHEST_TONE);
    }
  }

  const first = lineStep(song, 0);
  const path = stepPath(first)!;
  assert.equal(stepLabel(first), 'Line 1');
  assert.equal(path.totalMs, 12 * 700);
  assert.deepEqual(path.starts.slice(0, 4), [0, 700, 2100, 2450]);
  assert.equal(path.midiAt(0), 62);
  assert.equal(path.midiAt(699), 62);
  assert.equal(path.midiAt(700), 67, 'the second note starts on the beat');
  assert.equal(path.midiAt(2200), 71);
  assert.equal(path.midiAt(2500), 67);
  assert.equal(path.midiAt(99_999), 62, 'after the end, the last note');
  assert.equal(songSteps(song).length, 4);

  // The sound of the line, fed back through the melody mapper, is the line.
  const sound = pathSound(path, 12_000);
  const mapped = mapMelody(sound, 12_000, 'line 1').notes.map((note) => noteName(note.midi)).join(' ');
  assert.equal(mapped, names(0), 'the app plays the right tune');

  /** Sing a line: `pitchAt` gives the note number sung at each moment, or null. */
  const singLine = (index: number, pitchAt: (tMs: number) => number | null) => {
    const step = lineStep(song, index);
    let run = runReducer(NO_RUN, { type: 'start', steps: [step] });
    run = runReducer(run, { type: 'listen', atMs: 0 });
    for (let at = 500; run.phase === 'listening' && at < 30_000; at += 100) {
      const midi = pitchAt(at - 500);
      run = hear(run, midi === null ? null : hzOf(midi), at);
    }
    return run.results[0];
  };
  const perfect = singLine(0, (t) => path.midiAt(t));
  assert.equal(perfect.score, 100);
  assert.ok(isClean(perfect));
  const octaveDown = singLine(0, (t) => path.midiAt(t) - 12);
  assert.equal(octaveDown.score, 100, 'a low voice sings it an octave down');
  // A fifth of a second behind the beat loses the start of every note, but not the line.
  const dragging = singLine(0, (t) => path.midiAt(Math.max(0, t - 200)));
  assert.ok((dragging.score ?? 0) >= 70 && (dragging.score ?? 0) < 100, `dragging scored ${dragging.score}`);
  assert.ok(isClean(dragging));
  // One wrong note in nine is still clean. Droning on the first note is not.
  const oneWrong = singLine(0, (t) => (t >= 3500 && t < 4200 ? 72 : path.midiAt(t)));
  assert.ok(isClean(oneWrong) && (oneWrong.score ?? 0) < 100);
  const drone = singLine(0, () => 62);
  assert.ok(!isClean(drone), `droning scored ${drone.score}`);
  assert.ok(!isClean(singLine(0, () => null)));

  // The ball on the singer's turn. Sing line 1 with words: the voice breaks for
  // a fifth of a second at the start of every note, as consonants and breaths do.
  {
    const step = lineStep(song, 0);
    let run = runReducer(NO_RUN, { type: 'start', steps: [step] });
    run = runReducer(run, { type: 'listen', atMs: 0 });
    assert.equal(run.reading, null, 'no ball before the singer starts');
    let shown = 0;
    let readings = 0;
    for (let at = 500; run.phase === 'listening' && at < 30_000; at += 100) {
      const t = at - 500;
      const sinceNote = t - Math.max(...path.starts.filter((start) => start <= t));
      const gap = t > 0 && sinceNote < 200;
      run = hear(run, gap ? null : hzOf(path.midiAt(t) - 12), at);
      if (run.phase !== 'listening') break;
      readings++;
      if (run.reading !== null) shown++;
    }
    assert.equal(shown, readings, `the ball showed for ${shown} of ${readings} readings of a sung line`);
    assert.ok(isClean(run.results[0]), 'a line sung with words is still clean');

    // A real stop, longer than a consonant, takes the ball away.
    let quiet = runReducer(NO_RUN, { type: 'start', steps: [step] });
    quiet = runReducer(quiet, { type: 'listen', atMs: 0 });
    quiet = hear(quiet, hzOf(62), 100);
    assert.notEqual(quiet.reading, null, 'the ball appears at the first note heard');
    quiet = hear(quiet, null, 100 + VOICE_GAP_MS);
    assert.notEqual(quiet.reading, null, 'it stays through a short break');
    quiet = hear(quiet, null, 200 + VOICE_GAP_MS);
    assert.equal(quiet.reading, null, 'and goes when the voice really stops');
  }

  // Mastery: three clean passes a line.
  let passes = noPasses(song);
  assert.deepEqual(passes, [0, 0, 0, 0]);
  assert.equal(nextLine(passes), 0);
  passes = addPasses(passes, 0, [perfect]);
  passes = addPasses(passes, 0, [drone]);
  assert.deepEqual(passes, [1, 0, 0, 0], 'only a clean pass counts');
  passes = addPasses(passes, 0, [perfect, perfect, drone, perfect]); // the whole song at once
  assert.deepEqual(passes, [2, 1, 0, 1]);
  passes = addPasses(passes, 2, [perfect]);
  assert.deepEqual(passes, [2, 1, 1, 1], 'a single line counts for its own line');
  for (let i = 0; i < 5; i++) passes = addPasses(passes, 0, [perfect]);
  assert.equal(passes[0], PASSES_TO_MASTER, 'the count stops at mastered');
  assert.ok(lineMastered(passes, 0) && !lineMastered(passes, 1));
  assert.equal(nextLine(passes), 1);
  assert.ok(!songMastered(passes));
  for (let i = 0; i < 3; i++) passes = addPasses(passes, 0, [perfect, perfect, perfect, perfect]);
  assert.ok(songMastered(passes));
  assert.equal(nextLine(passes), null);
  assert.deepEqual(parsePasses(song, JSON.stringify(passes)), passes);
  assert.deepEqual(parsePasses(song, null), [0, 0, 0, 0]);
  assert.deepEqual(parsePasses(song, '"x"'), [0, 0, 0, 0]);
  assert.deepEqual(parsePasses(song, '[2,"x",99]'), [2, 0, 3, 0]);
}

// --- Quick practice --------------------------------------------------------

assert.deepEqual(MAJOR_SCALE, [0, 2, 4, 5, 7, 9, 11, 12]);
assert.deepEqual(
  scaleSteps(STARTS.tenor).map((step) => noteName(step.midi ?? 0)),
  ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'],
);
assert.deepEqual(
  Object.entries(STARTS).map(([choice, start]) => `${choice} ${noteName(start)}`),
  ['bass C2', 'baritone G2', 'tenor C3', 'alto G3', 'mezzo C4', 'soprano G4'],
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
  assert.deepEqual(
    (['A', 'B', 'C', 'D', 'F', null] as const).map(isPassing),
    [true, true, true, false, false, false],
    'a C or better passes',
  );
  assert.equal(summarize([missed(10, 1000), { ...missed(0, 2000), matched: true }]).score, 85);
}
for (const start of Object.values(STARTS)) {
  assert.ok(canStartOn(start));
  assert.ok(canShift(start, 0));
}
assert.ok(canStartOn(LOWEST_TONE) && canStartOn(HIGHEST_TONE - 12));
assert.ok(!canStartOn(LOWEST_TONE - 1) && !canStartOn(HIGHEST_TONE - 11));
assert.ok(!canShift(STARTS.baritone, -12), 'no going below the lowest tone');
assert.ok(canShift(STARTS.baritone, -6) && !canShift(LOWEST_TONE, -1));
assert.ok(!canShift(STARTS.bass, -1) && canShift(STARTS.bass, 1), 'bass is the lowest start there is');
assert.equal(noteName(STARTS.soprano + 12), 'G5');
assert.ok(canShift(STARTS.alto, 6) && !canShift(HIGHEST_TONE - 12, 1));
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
  const oneOfThree = [result(threeSteps[0], true, 50), result(threeSteps[1], false, null, 0), result(threeSteps[2], false, null, 0)];
  assert.equal(grade(summarize(oneOfThree)), 'F');
  assert.ok(!didPass(three, oneOfThree));
  // Below the pass mark, a C or better still passes (Matthew, 2026-11-23).
  const closeTwice = [result(threeSteps[0], false, null, 2000), result(threeSteps[1], false, null, 2000), result(threeSteps[2], false, null, 2000)];
  assert.equal(grade(summarize(closeTwice)), 'C');
  assert.ok(didPass(three, closeTwice), 'a C passes a level');
  const nearlyC = [result(threeSteps[0], false, null, 1800), result(threeSteps[1], false, null, 2000), result(threeSteps[2], false, null, 2000)];
  assert.equal(grade(summarize(nearlyC)), 'D');
  assert.ok(!didPass(three, nearlyC), 'a D does not');
  // The home level still needs a matched note, whatever the grade.
  assert.ok(!didPass(homeLevel, [result(homeStep, false, null, 1900)]));
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
