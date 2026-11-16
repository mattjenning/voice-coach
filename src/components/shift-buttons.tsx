import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SHIFTS, canShift } from '@/lib/quick';

/**
 * The five choices after a set: down an octave, down half, stay, up half,
 * up an octave. A choice with no tones that far is greyed out.
 */
export function ShiftButtons({ start, onChoose }: { start: number; onChoose: (start: number) => void }) {
  return (
    <View style={styles.row}>
      {SHIFTS.map((shift) => (
        <View key={shift.label} style={styles.cell}>
          <Button
            compact
            // Two short lines fit five across a phone: "Down" over "½".
            label={shift.label.replace(' ', '\n')}
            primary={shift.by === 0}
            disabled={!canShift(start, shift.by)}
            accessibilityLabel={shift.by === 0 ? 'Stay on the same octave' : `${shift.label} octave`}
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
    gap: Spacing.one,
  },
  cell: {
    flex: 1,
  },
});
