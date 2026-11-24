import type { ThemeColorInputs, ThemeMessageRule, ThemeStyle } from 'claude-code'

import type { MessageStyle } from '../types'
import type { Palette } from './palette'

// How the conversation's own rows look. The words stay the app's text.
//
// Three ways to draw your messages, picked in /look; replies stay plain on the
// page in the app's own size, and tool rows are quiet code-font strips in a
// small pixel frame in all three.
// Each drawing is a nine-slice: the corners draw once, a unit a point, and the
// edges and middle stretch to fit the message.

// The message colors per mode: named in the style, so it follows light and dark.
// Only the person's messages take them: Claude's replies already draw in
// text-primary, and a bg-assistant-message turns each reply into a padded
// bubble, out of line with the tool rows.
export const messageColors = (p: Palette): Record<'light' | 'dark', ThemeColorInputs> => ({
  light: { 'bg-user-message': p.light.card, 'text-user-message': p.light.text },
  dark: { 'bg-user-message': p.dark.card, 'text-user-message': p.dark.text },
})

// Raw colors used in both modes. When the words are under 3:1 on any color of a
// sliced drawing, the app lays the rule's backgroundColor (here the card) under
// the words alone, so they stay readable. Tape holds 3:1 in every palette and
// mode; the bookmark holds it with baibai's words and falls under with eye care's
// softer ones (one raw color can't do both). tests/look.test.tsx checks them.
export const TAPE = '#9b98916b' // grey tape, 42% over the card; never orange
export const BOOKMARK = '#6d7a89' // slate blue, the look's accent family
export const PAPER_SHADOW = '#00000024'

// pixel: the puppy's pixel card, corners cut in 2-point steps, with a stepped
// tail at the bottom right that points at you. A 24×32 box: the outline, then
// the card inside it; the tail sits in the bottom-right slice.
const PIXEL: ThemeMessageRule = {
  color: 'text-user-message',
  backgroundColor: 'bg-user-message',
  paddingX: 16,
  paddingTop: 12,
  paddingBottom: 22, // the tail takes the last 10 points
  fill: {
    vector: {
      viewBox: [24, 32],
      slice: [8, 10, 16, 8],
      paths: [
        { d: 'M4 0H20V2H22V4H24V32H22V30H20V28H18V26H16V24H14V22H4V20H2V18H0V4H2V2H4Z', color: 'border-strong' },
        { d: 'M4 2H20V4H22V28H20V26H18V24H16V22H14V20H4V18H2V4H4Z', color: 'bg-user-message' },
      ],
    },
  },
}

// tape: a square paper note with a strip of grey tape, tilted a little; two
// notes take turns, taped on the left and on the right.
const note = (tape: string, rotate: number): ThemeMessageRule => ({
  color: 'text-user-message',
  backgroundColor: 'bg-user-message',
  paddingX: 16,
  paddingTop: 18,
  paddingBottom: 12,
  rotate,
  shadow: { y: 1, blur: 4, color: PAPER_SHADOW },
  fill: {
    vector: {
      viewBox: 56,
      slice: 26,
      paths: [
        { d: 'M0 5H56V56H0Z', color: 'bg-user-message' },
        { d: tape, color: TAPE },
      ],
    },
  },
})
const TAPED = [note('M5 1L23 0L24 11L6 12Z', -1), note('M32 0L50 1L49 12L31 11Z', 0.8)] as const

// bookmark: the card in a 1-point line, with a 3-point slate blue strip down its left side.
const BOOKMARKED: ThemeMessageRule = {
  color: 'text-user-message',
  backgroundColor: 'bg-user-message',
  paddingX: 16,
  paddingY: 12,
  fill: {
    vector: {
      viewBox: 16,
      slice: [4, 4, 4, 6],
      paths: [
        { d: 'M0 0H16V16H0Z', color: 'border' },
        { d: 'M1 1H15V15H1Z', color: 'bg-user-message' },
        { d: 'M1 1H4V15H1Z', color: BOOKMARK },
      ],
    },
  },
}

// No Text size or line height: the look goes on a moment after a session
// opens, and a new size made every paragraph wrap again, so the page jumped.
const ROWS: Omit<ThemeStyle, 'UserMessage'> = {
  Heading: { fontWeight: 'semibold' },
  // a quiet code-font strip in a small pixel frame: a 1-point line, corners cut in
  // 2-point steps like the message card's
  ToolUse: {
    color: 'text-secondary',
    fontFamily: ['code'],
    backgroundColor: 'surface-1',
    paddingX: 8,
    fill: {
      vector: {
        viewBox: 12,
        slice: 4,
        paths: [
          { d: 'M2 0H10V2H12V10H10V12H2V10H0V2H2Z', color: 'border' },
          { d: 'M2 1H10V2H11V10H10V11H2V10H1V2H2Z', color: 'surface-1' },
        ],
      },
    },
  },
}

export const STYLES: Record<Exclude<MessageStyle, 'app'>, ThemeStyle> = {
  pixel: { ...ROWS, UserMessage: PIXEL },
  tape: { ...ROWS, UserMessage: TAPED },
  bookmark: { ...ROWS, UserMessage: BOOKMARKED },
}

/** The style for a pick; 'app' keeps the app's own rows. */
export const styleFor = (pick: MessageStyle): ThemeStyle | undefined => (pick === 'app' ? undefined : STYLES[pick])
