/**
 * Slide mode: the app plays a pitch that glides from one note to another,
 * and the singer follows the glide.
 *
 * A set is seven slides across one octave of a major scale. "Up" rises,
 * "down" falls, and "random" goes either way. Difficulty sets how far a
 * slide may travel and how long it lasts on average.
 *
 * Pure logic. The sound is made here as numbers; saving and playing it is
 * done elsewhere.
 */
import { COUNTDOWN_MS, SLIDE_SHAPE, slideMs, slideStep, type Path, type Step } from './exercise.ts';
import { midiToHz, noteName } from './notes.ts';
import { MAJOR_SCALE } from './quick.ts';

export type SlideOrder = 'up' | 'down' | 'random';
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * What each difficulty allows. A "step" is one note of the scale, so three
 * steps from C is F. Harder slides travel further, and get longer to do it.
 */
export const DIFFICULTY: Record<
  Difficulty,
  { minSteps: number; maxSteps: number; extraMs: number; turns: boolean }
> = {
  easy: { minSteps: 1, maxSteps: 1, extraMs: 0, turns: false },
  medium: { minSteps: 1, maxSteps: 3, extraMs: 1000, turns: false },
  /** Hard slides always travel at least three steps, and may change direction once. */
  hard: { minSteps: 3, maxSteps: 5, extraMs: 2000, turns: true },
};

/** On hard, about this share of random slides turn round part way. */
const TURN_SHARE = 0.4;

/**
 * How much a slide's speed varies: its glide takes between this share of the
 * usual time and its inverse. Slower and quicker slides keep a set from
 * feeling the same seven times over.
 */
const SPEED_SPREAD = 0.75;
/** How long the first note is held before the glide, shortest and longest. */
const LEAD_MS = { least: 300, most: 900 };

/**
 * The seven slides of one set.
 *
 * Every slide starts somewhere different: "up" slides all rise and "down"
 * slides all fall, but no two slides in a row start on the same note. Each
 * one also glides at its own speed and holds its first note for its own time.
 *
 * Each slide starts on cue, after a one-second countdown, instead of waiting
 * for the singer.
 *
 * `random` is a function that returns a number from 0 up to 1, like
 * Math.random. It is passed in so a check can use a repeatable one.
 */
export function slideSteps(
  start: number,
  order: SlideOrder,
  difficulty: Difficulty,
  random: () => number,
): Step[] {
  const scale = MAJOR_SCALE.map((above) => start + above);
  const top = scale.length - 1;
  const { minSteps, maxSteps, extraMs, turns } = DIFFICULTY[difficulty];
  const size = () => minSteps + Math.floor(random() * (maxSteps - minSteps + 1));
  const pick = (count: number) => Math.floor(random() * count);

  /** One slide, with a fresh speed and lead-in. */
  const make = (from: number, to: number, via?: number): Step => {
    const speed = SPEED_SPREAD + random() * (1 / SPEED_SPREAD - SPEED_SPREAD);
    const step = slideStep(scale[from], scale[to], via === undefined ? undefined : scale[via]);
    const slide = step.slide!;
    // Whole tenths of a second, so the numbers stay tidy.
    slide.glideMs = Math.round(((SLIDE_SHAPE.glideMs + extraMs) * speed) / 100) * 100;
    slide.leadMs = LEAD_MS.least + Math.round((random() * (LEAD_MS.most - LEAD_MS.least)) / 100) * 100;
    return { ...step, listenMs: slideMs(slide) + 1000, countdownMs: COUNTDOWN_MS, onCue: true };
  };

  /** One slide's notes, as places on the scale. */
  const draw = (): [number, number, number | undefined] => {
    const far = size();
    // Start anywhere the slide fits.
    const low = pick(top - far + 1);
    if (order === 'up') return [low, low + far, undefined];
    if (order === 'down') return [low + far, low, undefined];
    const upward = random() < 0.5;
    const from = upward ? low : low + far;
    const turn = upward ? low + far : low;
    if (turns && random() < TURN_SHARE) {
      // Out, then back the other way. The way back need not be as far as
      // the way out: it is its own size, cut short only by the end of the scale.
      const room = upward ? turn : top - turn;
      const back = Math.min(size(), room);
      return [from, upward ? turn - back : turn + back, turn];
    }
    return [from, turn, undefined];
  };

  const steps: Step[] = [];
  let lastStart = -1;
  while (steps.length < top) {
    let notes = draw();
    // Never two slides in a row from the same note. Draw again until it differs.
    for (let tries = 0; tries < 20 && notes[0] === lastStart; tries++) notes = draw();
    lastStart = notes[0];
    steps.push(make(notes[0], notes[1], notes[2]));
  }
  return steps;
}

/** "C3 → D3" for a slide, "C3 → E3 → C3" for one that turns, "C3" for a note, "Any note" for a free one. */
export function stepLabel(step: Step): string {
  if (step.name !== undefined) return step.name;
  if (step.midi === null) return 'Any note';
  if (step.slide === undefined) return noteName(step.midi);
  const turn = step.slide.viaMidi === undefined ? '' : `${noteName(step.slide.viaMidi)} → `;
  return `${noteName(step.midi)} → ${turn}${noteName(step.slide.toMidi)}`;
}

const OVERTONES = [1, 0.71, 0.58, 0.5, 0.45, 0.41, 0.38, 0.35];

/**
 * The sound of a slide or a phrase, as samples from -1 to 1.
 *
 * The pitch changes during the sound, so each sample moves the wave forward
 * by a little more or less than the last. Adding those small moves up, and
 * not restarting the wave at each pitch, is what keeps a glide smooth. Where
 * a new note of a phrase begins, the sound dips for an instant, the way a
 * singer's does between notes.
 */
export function pathSound(path: Path, sampleRate: number): Float32Array {
  const count = Math.round((path.totalMs / 1000) * sampleRate);
  const out = new Float32Array(count);
  const fadeIn = 0.03 * sampleRate;
  const fadeOut = 0.15 * sampleRate;
  const dip = 0.025 * sampleRate;
  const starts = path.starts.slice(1).map((ms) => Math.round((ms / 1000) * sampleRate));
  let nextStart = 0;
  let phase = 0;
  let loudest = 0;
  for (let i = 0; i < count; i++) {
    const hz = midiToHz(path.midiAt((i / sampleRate) * 1000));
    phase += (2 * Math.PI * hz) / sampleRate;
    let sample = 0;
    for (let k = 0; k < OVERTONES.length; k++) {
      // Leave out overtones too high for this sample rate to carry.
      if (hz * (k + 1) < sampleRate / 2) sample += OVERTONES[k] * Math.sin(phase * (k + 1));
    }
    while (nextStart < starts.length && i > starts[nextStart] + dip) nextStart++;
    const toNext = nextStart < starts.length ? Math.abs(i - starts[nextStart]) : dip;
    const fade = Math.min(1, i / fadeIn, (count - i) / fadeOut, 0.15 + (0.85 * toNext) / dip);
    out[i] = sample * fade;
    loudest = Math.max(loudest, Math.abs(out[i]));
  }
  if (loudest > 0) for (let i = 0; i < count; i++) out[i] = (out[i] * 0.9) / loudest;
  return out;
}
