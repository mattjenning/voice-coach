import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { NEW_DAILY, parseDaily, type Daily } from '@/lib/daily';

const KEY = 'voice-coach/daily/v1';

/**
 * The record of daily sessions, kept on the phone between visits: the
 * streak, the best score, and how hard the self-adjusting parts are.
 *
 * `reload` reads the saved copy again, for a screen that stays open
 * underneath while another one changes it. Saving is best effort: if the
 * phone refuses, the record still holds until the app closes.
 */
export function useDaily(): {
  daily: Daily;
  loaded: boolean;
  save: (next: Daily) => void;
  reload: () => void;
} {
  const [daily, setDaily] = useState<Daily>(NEW_DAILY);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    AsyncStorage.getItem(KEY)
      .then((text) => setDaily(parseDaily(text)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(reload, [reload]);

  const save = (next: Daily) => {
    setDaily(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };

  return { daily, loaded, save, reload };
}
