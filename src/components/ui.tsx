import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Button({
  label,
  onPress,
  disabled = false,
  primary = false,
  compact = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  /** Less padding at the sides, for a row of several buttons. */
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.text : theme.backgroundSelected },
        compact && styles.compact,
        (pressed || disabled) && styles.dimmed,
      ]}>
      <ThemedText style={[styles.buttonLabel, primary && { color: theme.background }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A rounded panel. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {children}
    </ThemedView>
  );
}

/** A small capital-letter heading for a card. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
      {children}
    </ThemedText>
  );
}

/** The frame every screen shares: a title, an optional way back, and scrolling content. */
export function Screen({
  title,
  subtitle,
  back = false,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children: ReactNode;
}) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            {back && (
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()}>
                <ThemedText themeColor="textSecondary">‹ Modes</ThemedText>
              </Pressable>
            )}
            <ThemedText type="subtitle">{title}</ThemedText>
            {subtitle !== undefined && <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>}
          </View>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
    lineHeight: 16,
  },
  button: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 64,
    paddingHorizontal: Spacing.one,
  },
  buttonLabel: {
    fontWeight: 600,
    textAlign: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
});
