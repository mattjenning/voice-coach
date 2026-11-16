import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Label, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';

type Mode = {
  href: Href;
  title: string;
  line: string;
  /** Shown as a small tag when the mode is not finished. */
  state?: string;
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
    line: 'Master one song, a phrase at a time.',
    state: 'Design only',
  },
];

export default function StartScreen() {
  return (
    <Screen title="Voice Coach" subtitle="Pick how you want to practice today.">
      {MODES.map((mode) => (
        <Pressable
          key={mode.title}
          accessibilityRole="button"
          accessibilityLabel={mode.title}
          onPress={() => router.push(mode.href)}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.mode}>
            {mode.state !== undefined && <Label>{mode.state}</Label>}
            <ThemedText style={styles.title}>{mode.title}</ThemedText>
            <ThemedText themeColor="textSecondary">{mode.line}</ThemedText>
          </ThemedView>
        </Pressable>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Your voice is analyzed on this phone. It is never recorded or sent anywhere.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mode: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.6,
  },
});
