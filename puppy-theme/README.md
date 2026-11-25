# puppy-theme

the lofi puppy's look for the claude desktop app: warm colors, a small framed sky on the wall that follows the time of day, your messages as little pixel cards, and soft sounds.

```
look                kept on this computer, for every session
╭─────────────────────────────────────────────╮
│ look                                    on  │
│ ☑  wear the puppy look                      │
│ ↺ back to the puppy's defaults              │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ colors                              baibai  │
│ ● baibai · the brand greys                  │
│ ○ eye care · softer text, warmer light paper│
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ wall                            framed sky  │
│ ● framed sky                                │
│ ○ plain wall                                │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ glass                                clear  │
│ the panels over the framed sky              │
│ ○ frosted · the frame a little soft         │
│ ● clear · the sky as it is                  │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ messages            pixel card with a tail  │
│ your messages; replies and tool rows stay   │
│ quiet                                       │
│ ● pixel card with a tail                    │
│ ○ taped paper notes                         │
│ ○ card with a blue bookmark                 │
│ ○ the app's own rows                        │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ sounds                   lofi room · 7 of 7 │
│ play once the speaker in the title bar is on│
│ ● lofi room · hum, vinyl, a far-off key     │
│ ○ wood · a fan and a marimba                │
│ ○ rain · rain on the window, slow piano;    │
│   the sky rains too                         │
│ ○ 8-bit · little game sounds                │
│ when each one plays                         │
│ ☑  send          you send a message         │
│ ☑  tool          a tool starts              │
│ …                                           │
╰─────────────────────────────────────────────╯
```

## install

in a claude code session in your terminal:

```
/plugin install puppy-theme --marketplace nonbiri1004/puppy-mods
```

then open the desktop app's code tab: the look draws there.

## what you do

- **open the settings**: `/look`. every pick is worn at once and kept on this computer, for every session; sessions already open take it within a few seconds.
- **colors**: **baibai** is the lofi puppy's own warm greys, paper grey in light mode and warm charcoal in dark mode, exactly as the brand gives them. **eye care** is worked out from those: softer text, and a warmer, slightly deeper wall in light mode. the git status colors come from the same family: no bright system colors, no orange.
- **wall**: a small framed sky hung beside the sidebar, where the right pane doesn't cover it while the sidebar is open (a slim upright frame, or a wide one on big screens), or the plain wall color. the sky follows your local time: grey-blue dawn, a pale day with slow clouds, a violet dusk with a few stars, and the brand's night screen with twinkling pixel stars and a shooting star now and then. with the **rain** sounds picked, it rains over a small town. in dark mode the wall around the frame is the card grey, so the chat is as bright as with the plain wall, and a day sky is shaded to an overcast grey (a clear dawn a little too), so it doesn't glare, while the town and its windows keep their colors; in light mode the town under a day rain is a soft grey, not black. on a small window the frame stays hidden; with the sidebar folded and the pane open it can sit under the words, and **plain wall** is the way out.
- **glass**: how the panels sit over the framed sky. **frosted** blurs the frame a little, as if behind glass; **clear**, the default, shows it sharp. neither tints the panels: the veil is 5% in both, one step at most. with the plain wall there is nothing behind the panels, so it waits for the sky.
- **messages**: how your messages are drawn: a small pixel card with a stepped tail, paper notes held by grey tape (two take turns, tilted a little), or a card in a thin line with a slate blue bookmark strip. replies keep the app's own text size, so the page doesn't jump when the look comes on, and tool rows are quiet code-font lines with no box in all three. in dark mode your messages sit one grey step above the chat, so a note reads as a note. **the app's own rows** turns the message style off.
- **look on or off**: off shows the app as it comes, and keeps your picks for when you turn it back on (picks made while it is off wait for that). **back to the puppy's defaults** resets every pick and turns the look on.
- **sounds**: pick one of four sets, and turn each of the seven moments on or off. the sounds play only once you press the speaker in the session's title bar.

## the seven sounds

the app plays them by itself at these moments; a mod can't play them on demand, so to hear one, let it happen.

| sound | when |
| --- | --- |
| send | you send a message |
| tool | a tool starts (the softest, it comes often) |
| compact | the conversation is compacted |
| done | claude finishes its turn |
| ask | a permission prompt or a question waits for you |
| error | a turn ends in an error |
| click | you click the bare wall behind the chat (left is low, right is high) |

every set also has a quiet background (a hum, a fan, rain); the speaker's own menu turns it off and keeps the seven.

## what it doesn't do

- the terminal and editors draw no theme. `/look` still opens there, and what you pick counts in the desktop app.
- permission prompts, questions, code blocks and the message box keep the app's own look.
- your accessibility settings win over the message style (a bigger font, more contrast).
- it reads nothing of yours and sends nothing anywhere. the picks are one small entry in the mod's own store.

## the sounds are numbers

there are no sound files. each sound is a few numbers (notes, a wave, how fast it fades), and the app makes the sound from them on your computer.

## how it works

- **starts from**: `session.start`, not a command. it reads your picks, puts the look on, and registers `/look`, which only opens the pane.
- **reads**: your picks, one entry (`prefs`) in the mod's own store, read field by field: a missing or out-of-range field falls back to its default. the local hour decides the sky (dawn, day, dusk, night).
- **makes**: the colors come from the brand's two palettes (`brand-colors.ts`; eye care is worked out from them in `palette.ts`) through `make-colors.js`, then the git status colors and the message colors are added. the sky is an svg named by palette, time of day and weather (rain when the rain sounds are picked). the message style and the seven sounds are plain data; only the cues you kept are sent.
- **draws**: it hands the whole look to `$.theme.set(…)`, and the app paints it. the sky is drawn by a `Backdrop` render that answers only on the desktop and mobile surfaces; the `/look` pane is its own `ui.render`.
- **writes back**: a pick in the pane reads the store again, changes that one thing, writes it back (fields a newer version added are kept) and wears the result at once. turning the look off calls `$.theme.clear()`, and only on your own off, never on a session start or reload.
- **keeps up**: every five seconds a watch reads the store again. it wears the look again when another session changed a pick, or when the hour crossed into another part of the day.
- **when it fails**: if style or sound is refused, the colors still go on and one line says so. a look that fails to go on is tried again by the watch. "not drawn" (the window has not attached yet) goes to the debug log only. if the colors would not paint (a contrast problem), a note shows once per palette.
- **where**: [register.tsx](hooks/register.tsx) (events, watch, the pane, backdrop), [look.ts](hooks/look.ts) (putting colors, sky, style and sound together), [prefs.ts](hooks/prefs.ts) (reading and keeping picks), [palette.ts](hooks/palette.ts) and [brand-colors.ts](hooks/brand-colors.ts) (colors), [scene.ts](hooks/scene.ts) (the sky), [style.ts](hooks/style.ts), [sound.ts](hooks/sound.ts). `make-colors.js` is generated: don't edit it.
