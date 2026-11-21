import { afterEach, expect, it } from 'vitest'
import type { AgentJournalItemBody } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import {
  domainLifecycleFixture,
  lifecycleIdentity as identity,
  lifecycleOptions as options
} from '../../../../../native-chat/agent-session-journal/journal-domain-lifecycle.test-fixture'
import { readJournalSqlPoint } from '../../../../../native-chat/agent-session-journal/journal-sql-point-read'
import { journalSqlReads } from '../../../../../native-chat/agent-session-journal/journal-sql-reads'
import { readTurnInterimLine } from './bot-turn-interim-status'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((close) => close()))

const said = (text: string): AgentJournalItemBody => ({
  kind: 'message',
  role: 'assistant',
  blocks: [{ type: 'text', text }]
})

/** A bot chat whose journal holds these turns, each its ask, its turn row and what it said, read
 *  through the reader worker's real point reads. */
async function chatWith(turns: [id: string, ...said: AgentJournalItemBody[]][]) {
  const f = domainLifecycleFixture(cleanup)
  for (const [id, ...work] of turns) {
    await f.run({
      kind: 'item',
      identity: identity(`${id}-ask`),
      options,
      body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'review this' }] }
    })
    await f.run({
      kind: 'item',
      identity: identity(`${id}-turn`),
      options,
      body: {
        kind: 'turn',
        turnId: `${id}-turn`,
        state: 'completed',
        outcome: 'success',
        completedAt: 1_000,
        userItemId: `orca:${id}-ask`
      }
    })
    for (const [index, body] of work.entries()) {
      await f.run({
        kind: 'item',
        identity: identity(`${id}-said-${index}`),
        options: { ...options, turnScope: { kind: 'turn', turnItemId: `orca:${id}-turn` } },
        body
      })
    }
  }
  return journalSqlReads({ point: async (request) => readJournalSqlPoint(f.db, request) }, 'chat')
}

it("reads the ended turn's own closing words from the journal, not another turn's", async () => {
  const reads = await chatWith([
    ['first', said('Your review is queued behind item 76.')],
    ['second', said('Looking now.'), said('Verdict: PASS, no findings.')],
    ['third', said('Queued as item 77; no verdict yet.')]
  ])
  expect(await readTurnInterimLine(reads, 'first-turn')).toBe(
    'Your review is queued behind item 76.'
  )
  expect(await readTurnInterimLine(reads, 'second-turn')).toBeNull()
  expect(await readTurnInterimLine(reads, 'third-turn')).toBe('Queued as item 77; no verdict yet.')
})
