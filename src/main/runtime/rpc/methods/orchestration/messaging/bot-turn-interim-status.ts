// The words a bot's ended turn closed on, read for a request it took and queued instead of answering.
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { requireStructuredHost } from '../../../../../bots/bot-chat-session'
import { turnClosingText } from '../../../../../bots/bot-turn-rows'
import { botRequestInterimLine } from '../../../../../bots/bot-request-interim'
import { redactFailure } from '../../../../orchestration/workers/turn-stops/worker-turn-stop-wording'

/** The ended turn's line saying it took and queued the request, from that turn's message rows
 *  alone; null for any other ending. */
export async function readBotTurnInterimStatus(
  runtime: OrcaRuntimeService,
  sessionId: string,
  turnId: string
): Promise<string | null> {
  const host = await requireStructuredHost(runtime)
  const { snapshot } = await (
    await host.journalReads(sessionId)
  ).operationWindow({
    turnIds: [turnId],
    anchorsOnly: true,
    withoutTurnAhead: true,
    turnShape: true
  })
  const line = botRequestInterimLine(turnClosingText(snapshot.items, turnId))
  // Mailed to other agents and paired computers, as a failure's reason is.
  return line ? redactFailure(line) : null
}
