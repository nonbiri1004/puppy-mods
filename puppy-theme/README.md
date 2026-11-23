# puppy-theme

the lofi puppy's look for the claude desktop app: warm colors, a small framed night sky on the wall, your messages as little pixel cards, and soft sounds.

```
look                                         kept on this computer
╭─────────────────────────────────────────────╮
│ palette                          warm grey  │
│ ● warm grey                                 │
│ ○ gruvbox hard                              │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ wall                       night sky frame  │
│ ● night sky frame                           │
│ ○ plain wall                                │
╰─────────────────────────────────────────────╯
╭─────────────────────────────────────────────╮
│ messages                                on  │
│ ☑  pixel cards, airier text, quiet tool rows│
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
- **palette**: warm grey (the lofi puppy's own paper and charcoal greys) or gruvbox hard (retro cream and brown-black, the "hard" contrast of the open [gruvbox](https://github.com/morhetz/gruvbox) palette, its orange included). both follow light and dark mode.
- **wall**: a small framed night sky in the top right corner, with slow twinkling pixel stars, or the plain wall color.
- **messages**: your messages as small pixel cards, a little more room between lines, quiet code-font tool rows. off keeps the app's own rows.
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
