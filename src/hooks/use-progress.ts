import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { NEW_PROGRESS, parseProgress, type Progress } from '@/lib/progression';

const KEY = 'voice-coach/progress/v1';

/**
 * Progression progress, kept on the phone between visits.
 *
 * `loaded` is false for the instant it takes to read the saved copy. Saving
 * is best effort: if the phone refuses, the progress still holds until the
 * app closes.
 */
export function useProgress(): {
  progress: Progress;
  loaded: boolean;
  save: (next: Progress) => void;
} {
  const [progress, setProgress] = useState<Progress>(NEW_PROGRESS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(KEY)
      .then((text) => {
        if (current) setProgress(parseProgress(text));
      })
      .catch(() => {})
      .finally(() => {
        if (current) setLoaded(true);
      });
    return () => {
      current = false;
    };
  }, []);

  const save = (next: Progress) => {
    setProgress(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };

  return { progress, loaded, save };
}
