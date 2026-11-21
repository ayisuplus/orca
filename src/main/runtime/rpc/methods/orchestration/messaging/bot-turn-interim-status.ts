// The words a bot's ended turn closed on, read for a request it took and queued instead of answering.
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { JournalSqlReads } from '../../../../../native-chat/agent-session-journal/journal-sql-reads'
import { requireStructuredHost } from '../../../../../bots/bot-chat-session'
import { turnClosingText } from '../../../../../bots/bot-turn-rows'
import { botRequestInterimLine } from '../../../../../bots/bot-request-interim'
import { redactFailure } from '../../../../orchestration/workers/turn-stops/worker-turn-stop-wording'

/** The ended turn's line saying it took and queued the request; null for any other ending. */
export async function readBotTurnInterimStatus(
  runtime: OrcaRuntimeService,
  sessionId: string,
  turnId: string
): Promise<string | null> {
  const host = await requireStructuredHost(runtime)
  return readTurnInterimLine(await host.journalReads(sessionId), turnId)
}

/** Read from that turn's message and turn rows alone, never its tool output or the chat before it. */
export async function readTurnInterimLine(
  reads: Pick<JournalSqlReads, 'operationWindow'>,
  turnId: string
): Promise<string | null> {
  const { snapshot } = await reads.operationWindow({
    turnIds: [turnId],
    anchorsOnly: true,
    withoutTurnAhead: true,
    turnShape: true
  })
  const line = botRequestInterimLine(turnClosingText(snapshot.items, turnId))
  // Mailed to other agents and paired computers, as a failure's reason is.
  return line ? redactFailure(line) : null
}
