import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SHIFTS, canShift } from '@/lib/quick';

/**
 * The five choices after a set: down half an octave, down one note, stay,
 * up one note, up half an octave. A choice with no tones that far is greyed out.
 */
export function ShiftButtons({ start, onChoose }: { start: number; onChoose: (start: number) => void }) {
  return (
    <View style={styles.row}>
      {SHIFTS.map((shift) => (
        <View key={shift.label} style={styles.cell}>
          <Button
            compact
            label={shift.label}
            primary={shift.by === 0}
            disabled={!canShift(start, shift.by)}
            accessibilityLabel={shift.spoken}
            onPress={() => onChoose(start + shift.by)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
