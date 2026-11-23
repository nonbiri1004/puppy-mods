import type { ThemeColorInputs, ThemeStyle } from 'claude-code'

import type { Palette } from './palette'

// How the conversation's own rows look. The words stay the app's text.
//
// Your messages are small pixel cards: corners cut in 2-point steps like the
// puppy's own pixel art, a card grey inside a one-pixel line. Replies stay
// plain on the page, a little airier. Tool rows are quiet code-font strips.

// The message colors per mode: named in the style, so it follows light and dark.
export const messageColors = (p: Palette): Record<'light' | 'dark', ThemeColorInputs> => ({
  light: { 'bg-user-message': p.light.card, 'text-user-message': p.light.text },
  dark: { 'bg-user-message': p.dark.card, 'text-user-message': p.dark.text },
})

// A 24-unit box, a unit a point: the outline, then the card inside it.
const OUTLINE = 'M4 0H20V2H22V4H24V20H22V22H20V24H4V22H2V20H0V4H2V2H4Z'
const CARD = 'M4 2H20V4H22V20H20V22H4V20H2V4H4Z'

export const STYLE: ThemeStyle = {
  Text: { fontSize: 15, lineHeight: 24 },
  Heading: { fontWeight: 'semibold' },
  UserMessage: {
    color: 'text-user-message',
    backgroundColor: 'bg-user-message',
    paddingX: 16,
    paddingY: 12,
    fill: {
      vector: {
        viewBox: 24,
        slice: 8,
        paths: [
          { d: OUTLINE, color: 'border-strong' },
          { d: CARD, color: 'bg-user-message' },
        ],
      },
    },
  },
  ToolUse: {
    color: 'text-secondary',
    fontFamily: ['code'],
    backgroundColor: 'surface-1',
    borderColor: 'border',
    borderWidth: 1,
    radius: 2,
    paddingX: 8,
  },
}
