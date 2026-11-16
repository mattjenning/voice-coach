import { Colors } from '@/constants/theme';

/**
 * The app's colors.
 *
 * The app is always dark: pale ink on deep indigo, whatever the phone is set
 * to. Matthew picked that look over the light one (2026-11-16). The light
 * palette is still in the theme file, so offering a choice later is a small
 * change here.
 */
export function useTheme() {
  return Colors.dark;
}
