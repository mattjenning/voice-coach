/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * The look: a two-ink gig poster. Deep indigo ink on pale periwinkle paper,
 * with two spot colors that each mean one thing.
 *
 *   voice  tangerine  where your voice is
 *   tune   buff       in tune; it floods the pitch field as you hold a note
 *
 * The buff is Cinnamon Buff from Sanzo Wada's A Dictionary of Color
 * Combinations (#FDC57E in the open dataset of the book), which pairs it
 * with a deep blue. Matthew suggested it in place of the first yellow
 * (2026-11-16).
 *
 * Nothing is black, white or grey. Dark mode swaps ink and paper and keeps
 * the spot colors.
 */
export const Colors = {
  light: {
    /** Ink: all text and rules. */
    text: '#1C1660',
    /** Paper: the ground of every screen. */
    background: '#ECEEFB',
    /** A quiet tint of ink on paper, for tracks and resting surfaces. */
    backgroundElement: '#DBDFF7',
    backgroundSelected: '#DBDFF7',
    textSecondary: '#55518F',
    /** The pitch field at rest. Pale in both modes, so its ink marks always show. */
    field: '#DBDFF7',
    /** In tune: Cinnamon Buff. A fill, never a text color: it is too faint on paper to read. */
    tune: '#FDC57E',
    /** Text and marks that sit on the field or the buff. Indigo in both modes. */
    onTune: '#1C1660',
    /** Where your voice is. A fill. */
    voice: '#FF5A36',
    /** Off the note, as text. Darker than `voice` so it reads on paper. */
    off: '#C2381A',
  },
  dark: {
    text: '#E9EBFF',
    background: '#17114F',
    backgroundElement: '#261E74',
    backgroundSelected: '#261E74',
    textSecondary: '#A9A8E0',
    field: '#DBDFF7',
    tune: '#FDC57E',
    onTune: '#1C1660',
    voice: '#FF6E4E',
    off: '#FF9A82',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** The poster typeface, used for titles, note names and buttons. Loaded in the root layout. */
export const DisplayFont = 'BigShoulders_800ExtraBold';

export const MaxContentWidth = 560;
