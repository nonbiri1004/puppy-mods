# puppy-theme

the lofi puppy's look for the claude desktop app: warm colors, a small framed sky on the wall that follows the time of day, your messages as little pixel cards, and soft sounds.

```
look                                         kept on this computer
╭─────────────────────────────────────────────╮
│ look                                    on  │
│ ☑  wear the puppy look                      │
│ ↺ back to the puppy's defaults              │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ colors                              baibai  │
│ ● baibai · the brand greys                  │
│ ○ eye care · softer text                    │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ wall                            framed sky  │
│ ● framed sky                                │
│ ○ plain wall                                │
│ ☑  frosted glass   off: the sky shows clear │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ messages            pixel card with a tail  │
│ your messages; replies and tool rows stay … │
│ ● pixel card with a tail                    │
│ ○ taped paper notes                         │
│ ○ card with a blue bookmark                 │
│ ○ the app's own rows                        │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ sounds                        lofi · 7 of 7 │
│ ● lofi room · hum, vinyl, a far-off key     │
│ ○ wood · a fan and a marimba                │
│ ○ rain · rain on the window, slow piano     │
│ ○ 8-bit · little game sounds                │
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

- **open the settings**: `/look`. every pick is worn at once and kept on this computer, for every session.
- **colors**: **baibai** is the lofi puppy's own warm greys, paper grey by day and warm charcoal by night, exactly as the brand gives them. **eye care** is worked out from those: softer text, and a warmer, slightly deeper wall by day. both follow light and dark mode.
- **wall**: a small framed sky hung beside the sidebar, where the right pane never covers it (a slim upright frame, or a wide one on big screens), or the plain wall color. the sky follows your local time: grey-blue dawn, a pale day with slow clouds, a violet dusk, and night with twinkling pixel stars and a shooting star now and then. with the **rain** sounds picked, it rains in the frame. on a small window the frame stays hidden; with the sidebar folded and the pane open it can sit under the words, and **plain wall** is the way out. **frosted glass** puts a thin veil and a faint blur on the panels over the sky, so words stay easy to read; off lets the sky show through clear.
- **messages**: how your messages are drawn: a small pixel card with a stepped tail, paper notes held by grey tape (two take turns, tilted a little), or a card with a slate blue bookmark strip. replies get a little more room between lines and tool rows are quiet code-font strips in a small pixel frame in all three. **the app's own rows** turns the message style off.
- **look on or off**: off shows the app as it comes, and keeps your picks for when you turn it back on. **back to the puppy's defaults** resets every pick.
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
