import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { tones } from '@/data/tones';

/**
 * One sound player per reference tone, made the first time it is needed and
 * kept for as long as the app is open. Keeping them means a tone that has
 * played once starts instantly the next time.
 */
const players = new Map<number, AudioPlayer>();

export function tonePlayer(midi: number): AudioPlayer {
  let player = players.get(midi);
  if (player === undefined) {
    player = createAudioPlayer(tones[midi]);
    players.set(midi, player);
  }
  return player;
}

/** Get a tone loading before it is asked for, so it plays without a wait. */
export function warmTone(midi: number): void {
  if (tones[midi] !== undefined) tonePlayer(midi);
}
