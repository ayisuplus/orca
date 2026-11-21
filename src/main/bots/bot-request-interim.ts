// A bot's turn on a request can end on an interim status ("accepted, queued, verdict follows")
// written in its own chat instead of mailed: that is the request taken and pending, not dropped.
import { BOT_QUIET_MARKER } from '../../shared/bot-quiet-result'

const LINE_MAX = 240
// Only the end of a long turn is its closing status.
const TAIL_MAX = 4000

// A cue that the work is still ahead: queued behind something, no verdict yet, one to follow. A bare
// "accepted" or "queued" is not one: a verdict can say "all findings accepted" or "nothing is queued".
const PENDING =
  /\b(?:queued (?:fifo|behind|for|until|as|at|on)|(?:in|on) (?:the |my )?queue|queue position|no (?:verdict|answer|review|findings|result)s? yet|not started yet|(?:hasn't|haven't|has not|have not) started|(?:verdict|answer|findings|result|review)s? (?:will )?(?:follows?|comes? back|to follow))\b/i

// A turn that says it can't take the request is no pending one, even if it also says "queued".
const REFUSAL =
  /\b(?:can(?:no|')t|could(?:n't| not)|won't|will not|unable to) (?:take|do|handle|accept|review|answer|help)\b|\bdeclin(?:e|ed|ing)\b|\brefus(?:e|ed|ing)\b/i

// A verdict written in chat (and not mailed) is an answer the sender never got, not a pending one.
const VERDICT = /\bverdict\s*:|\bno (?:P[0-3] )?findings\b|\bnothing (?:is )?queued\b/i
const VERDICT_WORD = /\b(?:PASS(?:ED)?|CHANGES REQUIRED|LGTM|APPROVED)\b/

/** The line saying the request is taken and pending, cut for a notice; null for any other ending. */
export function botRequestInterimLine(text: string): string | null {
  // Model prose often writes a typographic apostrophe: "can’t".
  const tail = text.trim().slice(-TAIL_MAX).replaceAll('\u2019', "'")
  if (
    !tail ||
    tail === BOT_QUIET_MARKER ||
    REFUSAL.test(tail) ||
    VERDICT.test(tail) ||
    VERDICT_WORD.test(tail)
  ) {
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
