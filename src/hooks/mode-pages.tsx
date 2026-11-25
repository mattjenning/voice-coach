import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  type NativeStackNavigationProp,
} from 'expo-router';
import { createContext, use, useState } from 'react';

import { Colors } from '@/constants/theme';

/**
 * Each mode as a little stack of real pages.
 *
 * A mode (Free practice, Progression, Song, Today) moves between several
 * pages: a list, a set being sung, a report card. They used to be views
 * inside one page, so the iPhone's swipe from the edge slid that one page
 * away and showed the start screen under it. Catching the swipe still
 * flashed the start screen (Matthew, 2026-11-25). Now every view is its own
 * page in a stack of the mode's own, so a swipe slides the page away and
 * shows the real page underneath, as it does in any iPhone app.
 *
 * What a page shows is a plain value, a "view", kept in memory here under a
 * number; the page's address carries only the number. State that every page
 * of a mode shares, such as the sets finished this session, lives in the
 * mode's layout and lasts as long as the mode is open.
 */

/** The pages of every mode share these. The app is always dark. */
const PAGE_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.dark.background },
};

/** The name of the route that shows any page but the first: `[page].tsx` in the mode's folder. */
const PAGE_ROUTE = '[page]';

let lastPage = 0;

type Store<V, S> = { pages: Map<string, V>; shared: S };

type StackNav = NativeStackNavigationProp<Record<string, { page?: string } | undefined>>;

/**
 * Makes a mode's pages. `first` is the view of the mode's first page, and
 * `useShared` is a hook for the state all its pages share.
 */
export function modePages<V, S>(first: V, useShared: () => S) {
  const Context = createContext<Store<V, S> | null>(null);

  /** The mode's `_layout.tsx`: its shared state, around a stack of its own. */
  function Layout() {
    const shared = useShared();
    const [pages] = useState(() => new Map<string, V>());
    return (
      <Context value={{ pages, shared }}>
        <Stack screenOptions={PAGE_OPTIONS} />
      </Context>
    );
  }

  /** Everything a page needs: what it shows, the shared state, and the ways to move. */
  function usePage(): {
    view: V;
    shared: S;
    /** Open a page on top of this one. A swipe back from it comes back here. */
    push: (view: V) => void;
    /** Swap this page for another. A swipe back from that one goes where one from here would. */
    replace: (view: V) => void;
    /** Close this page and show the one under it. */
    back: () => void;
    /** Close every page down to the mode's first. */
    toFirst: () => void;
    /** Leave the mode for the start screen. */
    leave: () => void;
  } {
    const store = use(Context);
    if (store === null) throw new Error('A mode page must sit inside its mode layout.');
    const navigation = useNavigation<StackNav>();
    const { page } = useLocalSearchParams<{ page?: string }>();
    const stored = page === undefined ? undefined : store.pages.get(page);
    const keep = (view: V) => {
      lastPage += 1;
      const id = String(lastPage);
      store.pages.set(id, view);
      return { page: id };
    };
    return {
      // A page whose view is gone (only after a code reload while developing) shows the first.
      view: stored === undefined ? first : stored,
      shared: store.shared,
      push: (view) => navigation.push(PAGE_ROUTE, keep(view)),
      replace: (view) => navigation.replace(PAGE_ROUTE, keep(view)),
      back: () => navigation.goBack(),
      toFirst: () => navigation.popToTop(),
      leave: () => navigation.getParent()?.goBack(),
    };
  }

  return { Layout, usePage };
}
