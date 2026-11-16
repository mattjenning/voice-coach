import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Label, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/**
 * Song mode is designed but not built. This screen says what it will do, so
 * the design can be argued with before any of it is code.
 */
const PLAN: { title: string; line: string }[] = [
  {
    title: '1. Bring one song',
    line: 'A song you own as a file, with no copy protection. A script on your computer turns it into a melody map: every sung note with its start and end time.',
  },
  {
    title: '2. The song is cut into phrases',
    line: 'A phrase is what you sing on one breath. The app finds them from the gaps in the melody.',
  },
  {
    title: '3. Call and response',
    line: 'The app plays one phrase of the melody. Then you sing it back, and it scores every note for pitch and timing.',
  },
  {
    title: '4. Mastery',
    line: 'Sing a phrase cleanly three times and it is mastered. Master every phrase and the song is yours.',
  },
  {
    title: '5. The hard parts come first',
    line: 'Each day starts with the phrases you miss most, and turns the worst notes into short exercises.',
  },
];

const STATUS: { label: string; line: string }[] = [
  {
    label: 'Built',
    line: 'Turning a recording of a voice on its own into a melody map. Checked with made-up singing, not yet with a real voice.',
  },
  {
    label: 'Not built',
    line: 'Playing a phrase, scoring a sung phrase against it, mastery, and this screen doing anything.',
  },
  {
    label: 'Not solved',
    line: 'Lifting the voice out of a full song with instruments. This decides which songs can be used.',
  },
];

export default function SongScreen() {
  return (
    <Screen
      back
      title="Song mode"
      subtitle="Pick one song that challenges you and master it. This mode is a design, not yet a feature.">
      <Card>
        <Label>How it will work</Label>
        {PLAN.map((item) => (
          <View key={item.title} style={styles.item}>
            <ThemedText style={styles.title}>{item.title}</ThemedText>
            <ThemedText themeColor="textSecondary">{item.line}</ThemedText>
          </View>
        ))}
      </Card>

      <Card>
        <Label>Why call and response, not singing along</Label>
        <ThemedText themeColor="textSecondary">
          An iPhone running this app cannot play music and listen to you in the same moment. Taking
          turns also means the app hears only your voice, so the scoring is fair.
        </ThemedText>
      </Card>

      <Card>
        <Label>Where it stands</Label>
        {STATUS.map((item) => (
          <View key={item.label} style={styles.item}>
            <ThemedText style={styles.title}>{item.label}</ThemedText>
            <ThemedText themeColor="textSecondary">{item.line}</ThemedText>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: Spacing.half,
  },
  title: {
    fontWeight: 600,
  },
});
