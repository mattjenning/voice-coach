import type { useTheme } from '@/hooks/use-theme';
import type { Grade } from '@/lib/report';

/**
 * The color of a grade: green for an A, yellow for a B, orange for a C, and
 * red for a D or an F (Matthew, 2026-11-23). Red means not passed.
 *
 * Used for the big grade block on a report card, and for the small square of
 * every finished note, during a set and on its report.
 */
export function gradeColor(letter: Grade | null, theme: ReturnType<typeof useTheme>): string {
  switch (letter) {
    case 'A':
      return theme.gradeA;
    case 'B':
      return theme.tune;
    case 'C':
      return theme.gradeC;
    case 'D':
    case 'F':
      return theme.gradeFail;
    default:
      return theme.backgroundElement;
  }
}
