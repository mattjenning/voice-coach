/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * The look: two inks and two spot colors. Deep indigo and pale periwinkle,
 * with two spot colors that each mean one thing.
 *
 *   voice  tangerine  where your voice is
 *   tune   yellow     in tune; it floods the pitch field as you hold a note
 *
 * Nothing is black, white or grey.
 *
 * The app ships dark: `dark` below is the look in use. `light` is the same
 * poster printed on pale paper, kept in case a choice is offered later.
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
    /** In tune. A fill, never a text color: yellow on paper is too faint to read. */
    tune: '#FFCB1F',
    /** Text and marks that sit on the field or the yellow. Indigo in both modes. */
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
    tune: '#FFCB1F',
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

/**
 * Type. The app uses the phone's own typeface throughout, so every screen
 * matches from the first instant and nothing has to load.
 *
 * Big text is set light and given room: a line height well above the letter
 * size, so tall letters and tails are never cut off. Small text carries the
 * weight instead.
 */
export const Type = {
  /** A screen's name. */
  title: { fontSize: 46, lineHeight: 56, fontWeight: '400' },
  /** A row in a list, or a section's main line. */
  heading: { fontSize: 30, lineHeight: 38, fontWeight: '400' },
  /** The note to sing. The largest thing on the screen. */
  note: { fontSize: 72, lineHeight: 86, fontWeight: '500' },
  /** The note being sung, and other mid-sized figures. */
  figure: { fontSize: 40, lineHeight: 48, fontWeight: '500' },
  /** A letter grade. */
  grade: { fontSize: 92, lineHeight: 110, fontWeight: '500' },
  /** The name of a section, such as "Where to start". Clearly bigger than the text under it. */
  section: { fontSize: 23, lineHeight: 30, fontWeight: '600' },
  /** The words on a button. */
  action: { fontSize: 19, lineHeight: 24, fontWeight: '600' },
} as const;

export const MaxContentWidth = 560;
