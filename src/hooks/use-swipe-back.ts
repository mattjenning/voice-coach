import { usePreventRemove } from 'expo-router';

/**
 * Makes the iPhone's swipe back go one level up inside a mode, not out of it.
 *
 * Each mode is one page of the app with several views inside it: a list, a
 * set being sung, a report card. To the phone they are all one page, so a
 * swipe from the edge used to close the whole mode and land on the start
 * screen (Matthew, 2026-11-25). Give this the way back for the view on
 * screen. While it is set, a swipe (or the Android back button) calls it
 * instead of leaving. Pass null on a mode's own first view, where a swipe
 * should leave as normal.
 */
export function useSwipeBack(goBack: (() => void) | null) {
  usePreventRemove(goBack !== null, () => goBack?.());
}
