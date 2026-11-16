import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The shared pieces of every screen.
 *
 * The layout is a set list: large light titles, everything flush left, and
 * thin rules between rows. There are no boxes. A thing you can press is
 * either turquoise or a row in a list.
 */

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
  /** A solid block of turquoise: the one thing to do next. Others are outlined in it. */
  primary?: boolean;
  /** Smaller type and less padding, for a row of several buttons. */
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label.replace('\n', ' ')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: theme.accent,
          backgroundColor: primary || pressed ? theme.accent : 'transparent',
        },
        compact && styles.compact,
        pressed && primary && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {({ pressed }) => (
        <ThemedText
          style={[
            compact ? styles.compactLabel : styles.buttonLabel,
            { color: primary || pressed ? theme.onAccent : theme.accent },
          ]}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** A section of a screen. Sections are set apart by an ink rule, not a box. */
export function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.section, { borderTopColor: theme.text }]}>{children}</View>;
}

/** The name of a section. */
export function Label({ children }: { children: ReactNode }) {
  return <ThemedText style={styles.label}>{children}</ThemedText>;
}

/**
 * A row in a list you can press: a big name, with a line of detail under it
 * or a short value at the right. Rows share thin rules, like a set list.
 */
export function ListRow({
  title,
  detail,
  value,
  note,
  onPress,
  disabled = false,
}: {
  title: string;
  detail?: string;
  /** Short text at the right edge, such as a range of notes. */
  value?: string;
  /** A plain remark under the detail, such as "Not built yet." */
  note?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const inert = disabled || onPress === undefined;
  return (
    <Pressable
      accessibilityRole={inert ? undefined : 'button'}
      accessibilityLabel={title}
      accessibilityState={{ disabled: inert }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.textSecondary },
        pressed && { backgroundColor: theme.accent },
        inert && styles.disabled,
      ]}>
      {({ pressed }) => {
        // Under a finger the row turns pale green, so its words turn dark to stay readable.
        const ink = pressed ? { color: theme.onAccent } : null;
        return (
          <>
            <View style={styles.rowText}>
              <ThemedText type="subtitle" style={ink}>
                {title}
              </ThemedText>
              {detail !== undefined && (
                <ThemedText themeColor="textSecondary" style={ink}>
                  {detail}
                </ThemedText>
              )}
              {note !== undefined && (
                <ThemedText type="smallBold" style={ink}>
                  {note}
                </ThemedText>
              )}
            </View>
            {value !== undefined && <ThemedText style={[styles.rowValue, ink]}>{value}</ThemedText>}
          </>
        );
      }}
    </Pressable>
  );
}

/**
 * The frame every screen shares: the screen's name at the very top, a line
 * about the screen, then the content. It all scrolls together.
 */
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
                <ThemedText type="smallBold" themeColor="accent">
                  ‹ Modes
                </ThemedText>
              </Pressable>
            )}
            <ThemedText type="title">{title}</ThemedText>
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.75,
  },
  section: {
    borderTopWidth: 2,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  label: Type.section,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    // A little room at the sides, so the pressed color does not sit tight against the words.
    marginHorizontal: -Spacing.two,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: Spacing.one,
  },
  rowValue: {
    fontVariant: ['tabular-nums'],
    fontWeight: 600,
  },
  button: {
    minHeight: 60,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    ...Type.action,
    textAlign: 'center',
  },
  compact: {
    minHeight: 64,
    paddingHorizontal: Spacing.one,
  },
  compactLabel: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: 700,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
});
