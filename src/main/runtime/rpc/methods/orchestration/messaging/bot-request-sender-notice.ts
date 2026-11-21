// Telling a bot request's sender how it stands: by mail on this computer, or over the conversation a
// paired computer's request came on, once per outcome and once that it's queued.
import type { MessageRow } from '../../../../orchestration/db/orchestration-records'
import type { OrchestrationDb } from '../../../../orchestration/db/orchestration-db'
import type { BotRequestOutcome } from '../../../../orchestration/db/bot-requests/bot-request-outcomes'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import {
  botRequestPendingText,
  botRequestUnansweredText
} from '../../../../../bots/bot-request-view'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { awaitsAnswer } from '../../../../../bots/bot-request-policy'
import { botRequestRecord } from './bot-request-record'
import { resolveReplyRecipient } from './recipient-routing'
import { mayNameSession } from './session-recipient'
import {
  peerMailSender,
  peerMailSenderLabel,
  queuePeerMailReply
} from '../../../../orchestration/federation/peer-mail/peer-mail-delivery'
import { notifyPeerMailQueued } from '../../../../orchestration/federation/peer-mail/peer-mail-waiters'
import { generateId } from '../../../../orchestration/db/generated-id'
import { readAgentSessionRecordStore } from '../../../../orchestration/addressing/session-lineage/structured-session-lineage'

// Session senders resolve against the session records, which a restart leaves uninstalled until asked.
export async function ensureSenderRecords(
  runtime: OrcaRuntimeService,
  requests: readonly (MessageRow | null | undefined)[]
): Promise<void> {
  if (requests.some((request) => request && mayNameSession(request.from_handle))) {
    await runtime.ensureStructuredAgentSessionHost().catch(() => undefined)
  }
}

/** How a request stands for its sender: ended with this outcome, or taken and queued, in the bot's words. */
export type SenderNotice =
  | {
      outcome: BotRequestOutcome
      why: Parameters<typeof botRequestUnansweredText>[1]
      reason?: string
    }
  | { pending: string }

/** False leaves the request as it was: its sender cannot be verified yet, so a later end retries. */
export function tellSender(
  runtime: OrcaRuntimeService,
  db: OrchestrationDb,
  request: MessageRow,
  notice: SenderNotice
): boolean {
  const record = botRequestRecord(db, request.id)
  if (!record || !awaitsAnswer(record.purpose)) {
    return true
  }
  const body =
    'pending' in notice
      ? botRequestPendingText(record, notice.pending)
      : botRequestUnansweredText(record, notice.why, notice.reason)
  // True the first time only: Orca tells the sender each outcome, and that it's queued, once.
  const firstTime = () =>
    'pending' in notice
      ? db.recordBotRequestPendingNotice(request.id)
      : db.recordBotRequestOutcome(request.id, notice.outcome)
  if (tellPeerSender(runtime, db, request, firstTime, body)) {
    return true
  }
  const sender = reachableSender(runtime, db, request)
  if (sender === 'unverified') {
    return false
  }
  if (!firstTime() || sender === 'gone') {
    return true
  }
  const recipient = sender
  const told = db.insertMessage({
    from: request.to_handle,
    to: recipient.to,
    subject: `Re: ${request.subject}`,
    body,
    threadId: request.thread_id ?? request.id,
    runId: recipient.runId
  })
  runtime.notifyMessageArrived(told.to_handle, told.type)
  return true
}

/** A request from a paired computer is told over the conversation it came on, from the bot's own address. */
function tellPeerSender(
  runtime: OrcaRuntimeService,
  db: OrchestrationDb,
  request: MessageRow,
  firstTime: () => boolean,
  body: string
): boolean {
  const route = db.getPeerMailMessage(request.id)
  const conversation = route ? db.getPeerMailConversation(route.conversation_id) : undefined
  if (conversation?.role !== 'peer') {
    return false
  }
  if (firstTime()) {
    queuePeerMailReply(db, conversation.conversation_id, generateId('msg'), {
      senderLabel: peerMailSenderLabel(runtime, request.to_handle),
      fromAddress: request.to_handle,
      subject: `Re: ${request.subject}`,
      body,
      threadId: request.thread_id ?? request.id,
      sender: peerMailSender(runtime, request.to_handle)
    })
    notifyPeerMailQueued(db.db)
  }
  return true
}

// 'gone': the sender is proven closed, unknown or on another host, so nothing would read a notice.
// 'unverified': the session records are not installed, which proves neither.
function reachableSender(
  runtime: OrcaRuntimeService,
  db: OrchestrationDb,
  request: MessageRow
): ReturnType<typeof resolveReplyRecipient> | 'gone' | 'unverified' {
  if (mayNameSession(request.from_handle) && !readAgentSessionRecordStore()) {
    return 'unverified'
  }
  try {
    return resolveReplyRecipient({
      runtime,
      db,
      originalFrom: request.from_handle,
      originalRunId: request.run_id,
      // A bot request comes from a chat or a worker, never a terminal agent.
      terminalRecipient: null
    })
  } catch (error) {
    if (error instanceof OrchestrationError) {
      return 'gone'
    }
    throw error
  }
}
