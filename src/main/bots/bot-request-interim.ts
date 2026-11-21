// A bot's turn on a request can end on an interim status ("accepted, queued, verdict follows")
// written in its own chat instead of mailed: that is the request taken and pending, not dropped.
import { BOT_QUIET_MARKER } from '../../shared/bot-quiet-result'

const LINE_MAX = 240
// Only the end of a long turn is its closing status.
const TAIL_MAX = 4000

const PENDING =
  /\b(?:queued|in (?:the |my )?queue|queue position|fifo|accepted|took (?:it |this )?over|taking (?:it |this )?over|picked (?:it |this )?up|no verdict yet|not started yet|(?:verdict|answer|findings|result|review)s? (?:will )?(?:follows?|comes? back))\b/i

// A turn that says it can't take the request is no pending one, even if it also says "queued".
const REFUSAL =
  /\b(?:can(?:no|')t|could(?:n't| not)|won't|will not|unable to) (?:take|do|handle|accept|review|answer|help)\b|\bdeclin(?:e|ed|ing)\b|\brefus(?:e|ed|ing)\b/i

/** The line saying the request is taken and pending, cut for a notice; null for any other ending. */
export function botRequestInterimLine(text: string): string | null {
  const tail = text.trim().slice(-TAIL_MAX)
  if (!tail || tail === BOT_QUIET_MARKER || REFUSAL.test(tail)) {
    return null
  }
  const line = tail
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find((part) => PENDING.test(part))
  if (!line) {
    return null
  }
  return line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1)}…` : line
}
