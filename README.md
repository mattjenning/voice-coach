# Voice Coach

A singing coach for the phone. The aim: pick one song that challenges you, work on it every day, and get told exactly where your pitch is off.

Everything in the app is built from one move. The app plays a note for three seconds, then listens for 3.5 seconds while you sing it back. Hold the note in tune for two seconds and it counts as matched.

![A report card after one octave](docs/report.png)

## Modes

| Mode | What it does | State |
| --- | --- | --- |
| Today's practice | The big button on the start screen. One guided session of about three minutes, built around your home note: a five-note warm-up, three runs of notes, four slides and one long note. The runs and slides are different every day and set their own difficulty: 90% or better moves that part up a level next time, under 70% moves it down. Finishing a session counts a day toward a streak. A first-time singer finds their home note here first. | Built 2026-11-24. Not yet run on a phone. |
| Free practice (called Quick practice until 2026-11-24) | Four kinds of practice, each ending in a report card with a percent score and a letter grade. **Scale mode** (called Step mode until 2026-11-23): eight notes up a major scale from one of six starting notes, one attempt each. **Slide mode:** seven glides, rising, falling or random, at three difficulties. The app plays each glide first while a ring rides its path; on your turn, after a one-second countdown, the ring sets off at once and a ball shows your voice against it. Each slide starts on its own note and has its own speed and lead-in. **Hit the Notes** (first in the list since 2026-11-25): five short tunes of solid notes on the scale; the app plays each tune, then after the countdown you sing it back note for note. Since 2026-11-25 every tune is a complete phrase in the major key, picked from a hand-written list in `src/lib/hits.ts`: it ends on do, arrives there by a step or small skip, sends ti on to do, fills in after a leap, and holds its last note longest. Each other note gets its own random length within the level's range. Easy: four notes of 0.5 to 1.1 seconds, steps and skips of one note (one scale note apart until 2026-11-25, which allowed only two tunes; Matthew kept the skips), all one way, inside five notes. Medium: six notes of 0.4 to 1.2 seconds, up to two apart, turning once, across the octave. Hard: eight notes of 0.4 to 1.3 seconds (0.3 until Matthew raised it on 2026-11-25), jumps of up to four, any direction. **Volume match:** no note plays; the microphone comes on straight away, and each step opens with the same countdown. The app learns your softest and loudest singing, then asks for five loudness targets between them. | Scale and Slide have run on a phone. The on-cue start and varied slides, and all of Hit the Notes, have not been tried on a phone (2026-11-23). Volume match ran on a phone on 2026-11-23 but was unreliable; the fix has not been tried on a phone. |
| Progression | Fifteen guided levels, ordered easy to hard by what studies of singing found (see "What makes a line hard"). Level 1 finds your home note, the note you sing when asked for an easy one. Every later level is built from it. Levels go from one note, to notes near home, to two notes in a row, to four-note patterns, the octave, jumps, slides, long holds, the ends of your range, and last quick lines with wide jumps. Progress and achievements are saved on the phone. | The first ten levels ran on a phone and save their progress (2026-11-23). The five new ones (Notes near home, Two notes in a row, Four-note patterns, Slides, Leaping lines) have not been tried on a phone. |
| Song mode | Amazing Grace, a line at a time. The app plays a line, you sing it back, and it scores how much was on the notes and in time. Three clean passes master a line. Mastery is saved on the phone. | Runs on a phone. The ball follows the voice (Matthew, 2026-11-24). Mastery surviving a restart is not yet proven. |

Every report card for a single set now opens with one line from the coach, "Try next": the single most useful thing to change, such as "You sang a little flat, about 30 cents under" or "The high notes cost you most". In Free practice, a slide or Hit the Notes set that scores 90% or better offers the next difficulty up, and one that does not pass offers the one below. Where your home note is known, the list of starting notes opens with "Your voice", the octave around it.

## What makes a line hard

Worked out from published studies on 2026-11-24. This is what the levels and difficulties are built on.

| What changes | Effect | Source |
| --- | --- | --- |
| How many different notes | The biggest effect measured. Untrained adults sang 74% of single notes within half a semitone, 60% of two-note sequences and 46% of four-note patterns. | Demorest and Pfordresher 2015, *Music Perception* 32(3) |
| How far from your comfortable note | Weaker singers drift back toward it: flat above it, sharp below it. | Pfordresher and Brown 2007, *Music Perception* 25(2) |
| How big the jumps are | Everyone shrinks jumps: good singers by about 12%, weak singers by about 31%. A bigger jump lands further off. | Pfordresher and Brown 2007 |
| A moving pitch | A steady glide was followed about 15 cents less exactly than a still note. | Dai and Dixon 2016, ISMIR |
| How short the notes are | A sung note starts with an unsteady scoop that usually lasts more than 0.2 seconds, so a very short note is mostly scoop. Longer notes were slightly more accurate. | Dai and Dixon 2016 |
| Which way the line turns | Very little. Good and weak singers alike got the direction right 92% of the time. | Pfordresher and Brown 2007 |

Two more findings shaped the design. Seeing your pitch on screen while you sing was the only kind of 20-minute training that gave a significant gain in adults who sing off pitch (Berglin, Pfordresher and Demorest 2022, *Psychology of Music* 50(4)), which is what the pitch field and the ball already do. And practising across a full octave helped more than practising inside five notes (Pfordresher and Greenspon 2025, *Musicae Scientiae* 29(2)), which is why sets span the octave around the home note. Both studies were read as abstracts only.

Not confirmed from a source this session, so treated as a working rule and not a fact: that learning is fastest at roughly 85% success. The 70% to 90% band for moving difficulty up and down is Claude's own choice in that spirit.

## Run it

```
npm install
npx expo start
```

Scan the QR code with an iPhone that has Expo Go. The computer and the phone must be signed in to the same Expo account and on the same Wi-Fi.

It needs a real phone. The microphone stream this app uses does not exist in the web version of `expo-audio`.

## Check it

```
node scripts/check.mts                          # all the logic, tested with made-up sound
node node_modules/typescript/bin/tsc --noEmit   # type check
npx expo lint                                   # lint: code mistakes such as unused variables
```

All three must pass before any change counts as done. The type check needs `expo-env.d.ts`, which `npx expo start` writes the first time it runs.

The check builds every note from C2 to C6 as four kinds of tone (pure, voice-like, voice-like with hiss, and a weak fundamental) and requires each reading to land within 10 cents. The worst case today is 5.6 cents. A cent is one hundredth of a semitone. It then plays whole exercises, report cards and the progression path through with made-up singing.

## Layout

| Path | What it holds |
| --- | --- |
| `src/app/index.tsx` | The start screen: Today's practice, then three modes |
| `src/modes/today.tsx` | Today's practice: the guided daily session |
| `src/modes/quick.tsx`, `progression.tsx`, `song.tsx` | One file per mode, holding all its pages |
| `src/app/<mode>/` | Each mode's routes: `_layout.tsx` (its own stack), `index.tsx` (its first page), `[page].tsx` (any other page) |
| `src/hooks/mode-pages.tsx` | Turns a mode's views into real pages, so a swipe back shows the page underneath |
| `src/components/exercise-player.tsx` | Runs an exercise from first step to last: tone, listen, next tone |
| `src/components/run-view.tsx` | What a running exercise looks like: the note, the meter, the hold bar |
| `src/components/report-card.tsx` | A report card for one set or a whole session |
| `src/lib/exercise.ts` | The engine. An exercise is a list of steps; this is every way one can unfold. Pure logic. |
| `src/lib/quick.ts` | The scale, the six starting notes, the shifts |
| `src/lib/slide.ts` | Slide mode: the sets, the difficulties, and the sound of a slide or phrase worked out as numbers |
| `src/lib/hits.ts` | Hit the Notes: the runs of notes and the three difficulties |
| `src/lib/song.ts` | Song mode: Amazing Grace written out as notes, and the rules of mastery |
| `src/hooks/slide-sounds.ts` | Saves the sound of a slide or phrase on the phone and plays it |
| `src/hooks/use-passes.ts` | Saves Song mode's clean passes on the phone |
| `src/lib/progression.ts` | Progression: the levels, the pass marks, the achievements |
| `src/lib/daily.ts` | Today's practice: the sets, the self-adjusting difficulty, the streak |
| `src/lib/coach.ts` | The coach's line: one thing to try next, from a finished set |
| `src/lib/report.ts` | What a list of results adds up to |
| `src/lib/pitch.ts` | Pitch detection (the YIN method) and smoothing. Pure maths. |
| `src/lib/notes.ts` | Notes, frequencies and cents. Pure maths. |
| `src/lib/frames.ts` | Regroups the microphone's buffers into even slices for the detector |
| `src/lib/hold.ts` | Compares a sung pitch with a note and counts how long it is held |
| `src/lib/melody.ts` | Turns a recording of one voice into a melody map: notes with start and end times |
| `src/lib/wav.ts` | Reads and writes WAV sound files |
| `src/hooks/use-pitch.ts` | The only file that touches the microphone. Plays the tone, then listens. |
| `src/hooks/tone-players.ts` | Keeps one sound player per reference tone |
| `src/hooks/use-progress.ts` | Saves progression progress on the phone |
| `src/hooks/use-daily.ts` | Saves the streak and the daily difficulty on the phone |
| `src/data/tones.ts`, `assets/tones/` | Reference tones, one per note. Generated by `scripts/make-tones.mts`. |
| `scripts/melody.mts` | Command line: a WAV of one voice in, a melody map out |
| `scripts/check.mts` | Checks for everything under `src/lib` |

## Make a melody map

```
node scripts/melody.mts recording.wav map.json
```

The recording must be a WAV file of a voice on its own, with no instruments. The script prints each note with its start and end time and saves the map as JSON.

The check for this sings a made-up six-note phrase, with vibrato, a repeated note and two notes joined without a gap, and requires every note to come back in order with its edges within 70 milliseconds. It has not been tried on a real voice.

## The look

Always dark: pale periwinkle ink on deep indigo, whatever the phone is set to. Nothing is black, white or grey. Three spot colors each mean one thing: turquoise is what you press, tangerine is where your voice is, yellow is in tune. The turquoise is Turquoise Green from Sanzo Wada's *A Dictionary of Color Combinations*.

Type is the phone's own typeface, set large and light for titles and note names, with the weight saved for small text. Everything is flush left, with thin rules between rows and no boxes.

The one loud element is the pitch field. Pitch runs up and down it. While you hold the note, yellow floods in from the left, and when it reaches the far side the note is matched. Everything else stays quiet.

Matthew set the direction on 2026-11-16: dark with yellow over a light version and over three colors from Sanzo Wada's *A Dictionary of Color Combinations*, the phone's typeface over a condensed poster face, and no heavy rule under titles. The tokens are in `src/constants/theme.ts`.

## Decisions

- **Expo and Expo Go.** Built on Windows, previewed on an iPhone, no Mac needed. `expo-audio` in SDK 58 can stream live microphone samples, which is what pitch detection needs.
- **Logic apart from the screen and the microphone.** Everything under `src/lib` is plain logic with no phone code, so it is tested on a computer with made-up sound.
- **One engine under every mode.** A scale, a level and a long hold are all lists of steps run by the same code.
- **Pitch detection is written here, not imported.** It is about a hundred lines, it is the heart of the app, and owning it means it can be tuned for singing.
- **Any octave counts.** A low voice can practice a note written for a high one. Reports still show the octave that was really sung.
- **Progression starts from the singer, not from a chart.** Finding a home note first means no one is asked their voice type.
- **The voice stays on the phone.** Sound is analyzed a slice at a time and thrown away. Nothing is recorded or sent anywhere.
- **The tone and the microphone never overlap.** On an iPhone, `expo-audio`'s microphone stream puts the phone in record-only mode, and nothing can play until the stream stops. Taking turns also keeps the app from scoring its own speaker. This is why Song mode is designed as call and response.
- **The speaker is reset before every tone.** The microphone stream leaves the phone in a quiet "measurement" setting, and a sound that has played once sits at its end. Both made the second tone silent on a real iPhone.
- **The microphone stays on between steps that have no sound.** When `expo-audio` stops the microphone stream, it switches the phone's sound system off a tenth of a second later, and a stream started in that gap is cut off and hears nothing. Volume match stopped and restarted the stream between steps, which is why it worked only some of the time. Now the stream keeps running from one silent step to the next, and a stream that does have to restart waits 0.3 seconds after the last one stopped.
- **Reference tones are rich in overtones.** A phone speaker is silent below about 300 Hz, so a plain low note would not be heard.
- **Slide sounds are made on the phone.** There are too many possible slides to ship a file for each, so the app works the sound out as numbers, saves it as a small file in the phone's throwaway storage, and plays that. Song mode will need the same trick to play phrases.
- **A slide's clock starts when the singer does.** The score is the share of the slide sung within 50 cents of the moving pitch, so a slow start costs nothing but stopping early does.
- **Slides and song lines are the same thing to the engine: a path.** A path is a pitch that moves over time. One piece of code plays it, draws it and scores it, which is why Song mode took little new code.
- **The ball holds through short breaks.** Sung words break the voice at every consonant and breath. On a slide or a song line the ball stays at the last pitch heard for 0.3 seconds, so it does not blink out at each one. Only real readings are scored.
- **Song mode is call and response.** The phone cannot play and listen at once, so the app sings a line and then the singer does. A line's clock starts when the singer starts.
- **Loudness is measured against the singer's own range.** How loud a phone hears you depends on the phone and how far away it is, so Volume match first listens to your softest and loudest singing and sets its targets between them.
- **A new note gets 0.2 seconds to settle** (2026-11-24). In a run of notes or a song line, a reading that is off the note during the first 0.2 seconds of that note is left out of the score; one that is already on the note still counts. A voice scoops into a note before it steadies, and that scoop usually lasts more than 0.2 seconds (Dai and Dixon 2016). Without this, the shortest notes in Hit the Notes could not be scored fairly. It makes Hit the Notes and Song mode a little more forgiving than before.
- **Slides are scored for a voice that trails a little** (2026-11-24, after Matthew found slides "a little awkward"). A voice follows a glide a moment behind it, and the app hears each pitch a little late. So a slide reading counts against wherever the glide was in the last quarter second, whichever is closest. The first half second after the cue is for finding the first note: silence or an off reading there is left out. Each slide now holds its first note 0.6 to 1 second before it moves (was 0.3 to 0.9). A faint band along the path showed how close counts; Matthew found it looked odd, so it was taken out on 2026-11-25 and the path is dots alone.
- **The countdown runs the yellow backwards** (Matthew, 2026-11-25, replacing three dots over the field from 2026-11-24). The field starts full of yellow and empties in time with the one-second countdown, with "Get ready." under it; then the yellow fills again as you sing, as before. It is animated on its own, because the run is only redrawn ten times a second.
- **One tip, after the set.** The coach's line gives a single instruction when the set is over, never during it.
- **Difficulty follows the singer.** In Today's practice the runs and slides move up after 90% or better and down after a score under 70%, so most sets are passed but few are perfect.
- **The streak counts days, not sessions,** in the phone's own time. It holds through the day after the last session and is gone once a whole day is missed. The longest streak is kept.
- **A passed level stays open** even when a new level is added in front of it.
- **Each mode is a stack of real pages** (Matthew, 2026-11-25). A mode's list, a set being sung and its report card used to be views inside one page, so the phone's swipe from the edge slid the whole mode away to the start screen. Catching the swipe still showed the start screen for a moment, so now every view is a page of its own in a stack that belongs to the mode (`src/hooks/mode-pages.tsx`; the screens live in `src/modes/`, and `src/app/<mode>/` has the three route files). A swipe slides the page off and shows the real page underneath. A set and its report card take the place of the page they came from, so a swipe back lands on Free practice's list, Progression's levels, Song mode's lines, or the Today page. State the pages share, such as this session's sets, lives in the mode's layout and lasts while the mode is open.
- **Missed notes earn partial credit.** A matched note scores 100. A missed one gets up to 50 for how close the best attempt came (full marks on the note, nothing a semitone away) and up to 50 for how much of the hold was done in tune. The set's score is the average, graded on the school scale: A from 90, B from 80, C from 70, D from 60. A C or better passes. The grade sits on a block colored by the grade: green for an A, yellow for a B, orange for a C, red for a D or an F. Since 2026-11-24 each note's own square, during a set and in the list on its report card, is colored by that note's grade the same way, and Today's practice shows each part's grade block between parts. A Progression level is passed by its pass mark or by a C or better; finding the home note still needs a matched note.
- **"One note" is one semitone**, the next piano key. That is how singers walk a warm-up scale up and down.
- **Round timings came from trying it** (Matthew, 2026-11-16): a 3 second tone, 3.5 seconds of listening, 2 seconds held.

## Proven on a phone

On Matthew's iPhone, 2026-11-16: the microphone stream in Expo Go, the reference tone on every round, the start screen, a full Step mode set with its report card, and Slide mode.

## Not yet proven

These need a real iPhone and have not been tried:

1. Volume match. Whether a phone's loudness readings are steady enough to hold a target has not been tried.
2. Song mode: that mastery is still there after the app is closed and opened again. The ball following the voice was confirmed on Matthew's iPhone on 2026-11-24.
3. Slide mode's medium and hard difficulties.
4. Progression. It has not been tried on a phone.
5. How accurate the detector is on a real voice. A real set scored 92% on a phone, but nobody has checked a reading against a tuner.
6. That progress and mastery are still there after the app is closed and opened again.
7. Today's practice, start to finish, and that its streak is still there the next day (2026-11-24).
8. The five new Progression levels, the coach's line on a report card, and the step-up and ease-off offers in Free practice (2026-11-24).
9. Whether the 0.2 second settling time feels fair or too generous on a real voice (2026-11-24).
10. Whether slides feel less awkward with the quarter-second allowance, the half-second start and the longer first note; the grade colors on each note's square (2026-11-24).
11. Swiping back inside every mode, and whether Hit the Notes' tunes now sound like finished phrases (2026-11-25).
12. The countdown as yellow that empties, and the path as dots with no band behind them (2026-11-25).

## Before beta

The app goes to beta testers when every line here is true. Today it is not.

- [x] Step mode (now Scale mode) has run start to finish on a phone.
- [x] Slide mode has run start to finish on a phone.
- [ ] Progression has run start to finish on a phone, and its progress survives closing the app.
- [ ] Volume match has run start to finish on a phone.
- [ ] Hit the Notes has run start to finish on a phone.
- [ ] Today's practice has run start to finish on a phone, and its streak survives closing the app.
- [ ] Song mode has run start to finish on a phone, and its mastery survives closing the app.
- [ ] A second person has tried it, ideally with a higher voice than Matthew's.
- [x] The app has its own icon (2026-11-21): a tangerine voice line that settles into a yellow held note, on indigo. Source: `assets/images/icon-source.svg`. It shows on the home screen only in a real build, not in Expo Go.
- [x] `npx expo lint` has run clean.
- [ ] Matthew has joined the Apple Developer Program. TestFlight needs it.
- [ ] A TestFlight build is installed on Matthew's own phone and works outside Expo Go.

## Roadmap

1. **Prove this build on a phone.** The items above.
2. **Beta.** The checklist above.
3. **Your own song.** Song mode plays one built-in tune. Next: turn a song the singer owns into lines the same way. The melody script handles a voice on its own; lifting a voice out of a full song with instruments is not researched and decides which songs can be used.
4. **More of Progression.** Slides across the bridge, loud and soft on one note, and lines from real songs. The pieces now exist in Free practice and Song mode.

Songs from streaming services cannot be analyzed, because their playback is protected. The first route is songs owned as files. Selling an app built on the melodies of commercial songs would likely need the rights cleared first; personal use does not.
