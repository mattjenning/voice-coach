import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { tonePlayer } from '@/hooks/tone-players';
import type { Slide, Step } from '@/lib/exercise';
import { slideSound } from '@/lib/slide';
import { writeWav } from '@/lib/wav';

/** Samples a second for a slide's sound. Enough for its overtones, small enough to make quickly. */
const SLIDE_RATE = 12_000;

const players = new Map<string, AudioPlayer>();

/**
 * A player for the sound of one slide.
 *
 * There are far too many possible slides to ship a sound file for each, so
 * the sound is made on the phone the first time it is needed: worked out as
 * numbers, saved as a small file in the phone's throwaway storage, and
 * played from there. If any of that fails, the slide's first note plays
 * instead, so the exercise still runs.
 */
function slidePlayer(fromMidi: number, slide: Slide): AudioPlayer {
  const key = `${fromMidi}-${slide.viaMidi ?? 'x'}-${slide.toMidi}-${slide.leadMs}-${slide.glideMs}-${slide.tailMs}`;
  const ready = players.get(key);
  if (ready !== undefined) return ready;
  let player: AudioPlayer;
  try {
    const file = new File(Paths.cache, `slide-${key}.wav`);
    file.create({ overwrite: true });
    file.writeSync(writeWav(slideSound(fromMidi, slide, SLIDE_RATE), SLIDE_RATE));
    player = createAudioPlayer({ uri: file.uri });
  } catch {
    player = tonePlayer(fromMidi);
  }
  players.set(key, player);
  return player;
}

/** The sound to play before a step, or null for a step with no sound. */
export function stepPlayer(step: Step): AudioPlayer | null {
  if (step.midi === null) return null;
  return step.slide === undefined ? tonePlayer(step.midi) : slidePlayer(step.midi, step.slide);
}
