import { router, useFocusEffect, type Href } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, ListRow, Screen } from '@/components/ui';
import { useDaily } from '@/hooks/use-daily';
import { dayKey, doneToday, streakNow } from '@/lib/daily';

type Mode = {
  href: Href;
  title: string;
  line: string;
  /** A plain remark for a mode that is not finished. */
  note?: string;
};

const MODES: Mode[] = [
  {
    href: '/progression',
    title: 'Progression',
    line: 'Fifteen levels, easy to hard, built around your own voice.',
  },
  {
    href: '/quick',
    title: 'Free practice',
    line: 'Pick your own: scales, slides, runs of notes or volume.',
  },
  {
    href: '/song',
    title: 'Song mode',
    line: 'Master Amazing Grace a line at a time. The app sings, then you do.',
  },
];

export default function StartScreen() {
  const { daily, loaded, reload } = useDaily();
  // This screen stays open underneath the others, so read the record again each time it comes back.
  useFocusEffect(reload);

  const today = dayKey(new Date());
  const streak = streakNow(daily, today);
  const done = doneToday(daily, today);
  const inARow = streak === 1 ? '1 day in a row' : `${streak} days in a row`;
  return (
    <Screen
      title="Voice Coach"
      subtitle={
        !loaded
          ? 'Three minutes a day.'
          : done
            ? `Done for today. ${inARow}.`
            : streak > 0
              ? `${inARow}. Today keeps it going.`
              : 'Three minutes a day. Start here.'
      }>
      <Button
        primary={!done}
        label={done ? 'Practice again today' : "Today's practice"}
        onPress={() => router.push('/today')}
      />
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
