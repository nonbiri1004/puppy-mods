# puppy mods style

How every puppy mod looks, so they feel like one family. `puppy-console` is the reference: when this file and that mod disagree, fix one of them.

## Panes are cards

- The pane is one column: `<Box flexDirection="column" gap={1}>`.
- The first row is the pane's own status: a short dim line on the left (when it last looked, or the puppy's line), the `refresh` button on the right.
- Each part of the pane is a card:

  ```tsx
  <Box key="card-…" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap="xs">
    <Box flexDirection="row" justifyContent="space-between">
      <Text weight="semibold">name</Text>
      <Text dimColor>state · time</Text>
    </Box>
    …
  </Box>
  ```

- The card header: the name on the left in `weight="semibold"`, and on the right, dim, the state, a count or a time, joined by ` · `.
- A pane with only one card may leave its header out: the first row already says what it is (`3 to-do`).
- Give each card a `key` that starts with `card-`, so tests can find it.
- Lists inside a card get a dim label above each group, not another border. One border level only.
- Extra lists (done items, old things) stay folded below the cards: a dim button `▸ done 3`, `▾` when open.
- A list cut at a limit ends in a dim button `▸ 2 more` that opens the rest, never a line of text: what the pane leaves out must be one press away.
- What waits for you is said in one place (the top card), once. Other cards don't list or count it again.
- Counts are per group (`conversations · 3`, `music · 1`). Don't add up things of different kinds into one total: one item may be 41 songs.
- A card that shows the state of a piece of work (a pipeline) is short: its header (name, state, time), one headline, and two or three summary lines. The rest (the computer it runs on, the last output, what comes next, a picture) folds behind a dim `▸ details` button.
- A summary line is plain text, the same on every surface, so it never needs a picture: `plan 2 › clips 2 › final 3 › done 2`. Use `›` only where things really flow from one step into the next; counts that sit side by side get ` · `. Give each number that waits for you the `warning` color: the one place a line may hold that color twice (two review gates).
- Long text: on the terminal, clip by columns (a card has 4 fewer than the pane: border and padding). On the desktop, give the `Text` `wrap="truncate-end"` and let it cut at the edge; counting columns there cuts too early, most of all for Chinese. In a row, the Box around that Text needs `flexShrink={1} minWidth={0}`; without `minWidth={0}` it never gets narrower than its text and runs past the card.
- Rows with a mark in front (○, ↗, ✓): put the mark in a `<Box width={3} flexShrink={0}>`, so the words line up.
- Facts on the right of a row (a state, a link, an age) sit in one `<Box flexShrink={0}>`: they never wrap, the words in the middle give way. On the terminal a `Link` prints its whole address, so show a short name there (`#16`).

## Colors

- In `Text` and `Box`, use only the app's color names. Never a hex color: the app picks them for light and dark.
  - `warning`: something waits for you.
  - `error`: something broke.
  - `success`: something is working right now.
  - Everything else: `dimColor`, or the normal text color.
- One color word per line at most. Color the word that matters (the state, the label), not the whole line.
- No color per project or per group: groups are told apart by cards and names, in greys. Something old or important gets the full text color, bold, and a small mark, not a new color.
- A grey bar down a list's left edge is a dim `▎` on each row, not a Box with a `backgroundColor`: a theme's grey fill turns white in 16-color themes.

## Pictures (SVG)

- Only where the surface has `Svg` (the desktop app). The terminal gets the same facts as text lines: never drop a fact because there is no picture.
- Decide the facts once, in one place (`puppy-console/hooks/view.ts`), and let each surface only lay them out. Two code paths that each pick their own facts drift apart.
- A picture of a piece of work goes inside `▸ details`, never in place of the summary. A picture that only repeats the summary's numbers is not drawn.
- No node graph for a straight line of steps: a row of text says the same in less room.
- Emoji (⏰, ✓…) keep their own colors; they are not our drawings. The greys-only rule is for icons we draw.
- Small icons are 14×14 pixel drawings in greys only, like lofipuppy.app's `PixelIcon`; the terminal shows a text mark in their place.
- Warm greys, light by day and dark by night with `prefers-color-scheme`. Copy the palette from `puppy-console/hooks/draw.ts` (`--card`, `--line`, `--text`, `--muted`, and the soft `--ok` / `--listen` / `--reject`).
- Pixel art keeps `shape-rendering="crispEdges"`.
- The puppy's drawing comes from baibai-brand (generated, see `brand.lock.json`). Never draw or edit the puppy by hand here.
- These mods are coding tools: the puppy keeps you company like a mascot beside you. It wears **no headphones** here; its prop is a small laptop. It types at the laptop (`typing0..5`), sits when idle and sleeps when nothing is going on. All frames come from baibai-brand's `puppy-svg.ts` (bare frames only).
- Where the surface has no `Svg` (the terminal), draw the same puppy from baibai-brand's `puppy-blocks.ts`: block characters, two pixels to a character, the way Claude Code draws its mascot. 34 columns × 13 rows, one still frame per mood (`typing0`, `sit`, `sleep0`). Its runs carry the puppy's own hex colors: the one place a `Text` may use hex, since the brand fixes those colors.
- Never a text face (`•ᴥ•` and the like) and never a smaller puppy: a scaled-down puppy is a new drawing. If 13 rows don't fit, leave the puppy out.
- Our own drawings use no orange (the orange is only for headphones, which these mods don't draw).
- Motion is slow and small (a blink, breathing, floating notes). Nothing flashes.

## Words

- lowercase, short, plain words: `refresh`, `add a to-do…`, `waiting for you`.
- Quiet: a toast only for something new that waits for you, and only once.
- When something fails, say it in one dim or `error` line in the pane. Never hide a card or a file without a word.
- Loading: one dim line, like `loading…`.

## Code

- Draw with `$.ui.resolve(e)`; check for an element before using it (`'Svg' in ui`, `'Input' in table`): the phone and the terminal have fewer.
- Buttons have a `key`. Plain buttons (`plain`) for small icons like ☐ and ✕.
- A part that can fail to draw (a picture from outside data) is wrapped, so one bad file loses its picture, not the pane.
- Shared code: none yet. When a third mod needs the same code, add a small script that copies it from one place (like `brand.lock.json` does for the puppy).
