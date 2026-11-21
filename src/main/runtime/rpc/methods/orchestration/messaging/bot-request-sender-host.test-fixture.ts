import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import { setStructuredAgentSessionHost } from '../../../../../native-chat/agent-session-wire/host/structured-agent-session-registry'

/** A session host whose store holds these open, host-local chats, as a running Orca's does. */
export function installSenderHost(
  sessionIds: string[],
  /** What every chat's usage-limit continue reads. */
  status?: { usageLimitContinue: { state: 'scheduled' } },
  /** Every chat's journal rows for the turns a read names. */
  journal?: (turnIds: readonly string[]) => AgentJournalRenderItem[]
): void {
  const conversations = sessionIds.map((sessionId) => ({
    sessionId,
    location: { executionHostId: 'local' },
    providerHandleChain: []
  }))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: sender resolution reads only the host's record store and usage-limit continue.
  setStructuredAgentSessionHost({
    readUsageLimitContinue: async () => status?.usageLimitContinue,
    journalReads: async () => ({
      operationWindow: async ({ turnIds = [] }: { turnIds?: readonly string[] }) => ({
        snapshot: { items: journal?.(turnIds) ?? [] },
        complete: true
      })
    }),
    deps: {
      store: {
        getConversation: (id: string) => conversations.find((c) => c.sessionId === id) ?? null,
        listConversations: () => conversations,
        getVisibleSessionTabIndex: () => ({ present: true, sessionIds })
      }
    }
  } as never)
}

export function removeSenderHost(): void {
  setStructuredAgentSessionHost(null)
}
