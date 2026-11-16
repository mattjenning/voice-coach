import { router, type Href } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ListRow, Screen } from '@/components/ui';

type Mode = {
  href: Href;
  title: string;
  line: string;
  /** A plain remark for a mode that is not finished. */
  note?: string;
};

const MODES: Mode[] = [
  {
    href: '/quick',
    title: 'Quick practice',
    line: 'Steps and slides across one octave, then a report card.',
  },
  {
    href: '/progression',
    title: 'Progression',
    line: 'Guided levels from your first note, built around your own voice.',
  },
  {
    href: '/song',
    title: 'Song mode',
    line: 'Master Amazing Grace a line at a time. The app sings, then you do.',
  },
];

export default function StartScreen() {
  return (
    <Screen title="Voice Coach" subtitle="Pick how you want to practice today.">
      <ListRows />
      <ThemedText type="small" themeColor="textSecondary">
        Your voice is analyzed on this phone. It is never recorded or sent anywhere.
      </ThemedText>
    </Screen>
  );
}

function ListRows() {
  return (
    <>
      {MODES.map((mode) => (
        <ListRow
          key={mode.title}
          title={mode.title}
          detail={mode.line}
          note={mode.note}
          onPress={() => router.push(mode.href)}
        />
      ))}
    </>
  );
}
