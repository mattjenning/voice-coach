import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { noPasses, parsePasses, type Passes, type Song } from '@/lib/song';

/**
 * How many clean passes each line of a song has, kept on the phone between
 * visits. Saving is best effort: if the phone refuses, the counts still hold
 * until the app closes.
 */
export function usePasses(song: Song): { passes: Passes; save: (next: Passes) => void } {
  const key = `voice-coach/song/${song.id}/v1`;
  const [passes, setPasses] = useState<Passes>(() => noPasses(song));

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(key)
      .then((text) => {
        if (current) setPasses(parsePasses(song, text));
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [key, song]);

  const save = (next: Passes) => {
    setPasses(next);
    AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  };

  return { passes, save };
}
