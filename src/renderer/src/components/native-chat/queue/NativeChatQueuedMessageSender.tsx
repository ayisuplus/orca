import { NativeChatAgentMessageSenders } from '@/components/native-chat/messages/agent-senders/NativeChatAgentMessageSenders'
import {
  NativeChatTypedByQueuedLine,
  NativeChatTypedByTag
} from '@/components/native-chat/NativeChatTypedByTag'
import type { QueuedMessageCard } from '../../../../../shared/agent-session/view/structured-agent-session-queued-cards'

/** Who queued a card that is not the person's own: an agent, or another person on their paired computer.
 *  `inline` is the one-line row's chip, hidden in narrow panes; otherwise the editor's "From" line. */
export function NativeChatQueuedMessageSender({
  card,
  chatWorktreeId,
  inline = false
}: {
  card: QueuedMessageCard
  chatWorktreeId: string | null
  inline?: boolean
}): React.JSX.Element | null {
  if (!inline) {
    return card.from ? (
      <NativeChatAgentMessageSenders from={card.from} chatWorktreeId={chatWorktreeId} queued />
    ) : card.typedByOther ? (
      <NativeChatTypedByQueuedLine typist={card.typedByOther} />
    ) : null
  }
  if (!card.from && !card.typedByOther) {
    return null
  }
  return (
    <span className="max-w-[20%] min-w-0 shrink-0 @max-[460px]:hidden">
      {card.from ? (
        <NativeChatAgentMessageSenders from={card.from} chatWorktreeId={chatWorktreeId} inline />
      ) : card.typedByOther ? (
        <NativeChatTypedByTag typist={card.typedByOther} />
      ) : null}
    </span>
  )
}
