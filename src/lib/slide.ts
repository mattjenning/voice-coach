/**
 * Slide mode: the app plays a pitch that glides from one note to another,
 * and the singer follows the glide.
 *
 * A set is seven slides across one octave of a major scale. "Up" climbs,
 * "down" descends, and "random" goes either way. Difficulty sets how far a
 * slide may travel and how long it lasts.
 *
 * Pure logic. The sound is made here as numbers; saving and playing it is
 * done elsewhere.
 */
import { slideStep, type Path, type Step } from './exercise.ts';
import { midiToHz, noteName } from './notes.ts';
import { MAJOR_SCALE } from './quick.ts';

export type SlideOrder = 'up' | 'down' | 'random';
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * What each difficulty allows. A "step" is one note of the scale, so three
 * steps from C is F. Harder slides travel further, and get longer to do it.
 */
export const DIFFICULTY: Record<Difficulty, { maxSteps: number; extraMs: number; turns: boolean }> = {
  easy: { maxSteps: 1, extraMs: 0, turns: false },
  medium: { maxSteps: 3, extraMs: 1000, turns: false },
  /** Hard slides may also change direction once: out to a note and back. */
  hard: { maxSteps: 5, extraMs: 2000, turns: true },
};

/** On hard, about this share of random slides turn round and come back. */
const TURN_SHARE = 0.4;

/**
 * The seven slides of one set.
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
  const { maxSteps, extraMs, turns } = DIFFICULTY[difficulty];
  const size = () => 1 + Math.floor(random() * maxSteps);
  /** A note `steps` away from `from`, the other way if that runs off the scale. */
  const reach = (from: number, steps: number, upward: boolean): number => {
    const way = upward ? 1 : -1;
    const there = from + way * steps;
    if (there >= 0 && there <= top) return there;
    const back = from - way * steps;
    if (back >= 0 && back <= top) return back;
    return upward ? (from === top ? 0 : top) : from === 0 ? top : 0;
  };
  const steps: Step[] = [];
  for (let i = 0; i < top; i++) {
    if (order === 'up') {
      steps.push(slideStep(scale[i], scale[Math.min(top, i + size())], undefined, extraMs));
    } else if (order === 'down') {
      steps.push(slideStep(scale[top - i], scale[Math.max(0, top - i - size())], undefined, extraMs));
    } else {
      const from = Math.floor(random() * scale.length);
      const far = reach(from, size(), random() < 0.5);
      if (turns && random() < TURN_SHARE) {
        steps.push(slideStep(scale[from], scale[from], scale[far], extraMs));
      } else {
        steps.push(slideStep(scale[from], scale[far], undefined, extraMs));
      }
    }
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
