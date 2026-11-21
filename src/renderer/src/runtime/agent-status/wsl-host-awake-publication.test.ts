import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import {
  collectWslHostAwakeStatuses,
  wslHostAwakeStatusesChanged,
  wslHostEnvironmentIds
} from './wsl-host-awake-publication'

function row(overrides: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 500,
    stateStartedAt: 400,
    paneKey: 'tab:leaf',
    stateHistory: [],
    ...overrides
  }
}

const ports = { localPort: 4100, remotePort: 4200 }
const environments: Parameters<typeof wslHostEnvironmentIds>[0] = [
  { id: 'wsl-env', orcadDeployment: { kind: 'wsl', distro: 'Ubuntu', ...ports } },
  {
    id: 'ssh-env',
    orcadDeployment: { kind: 'ssh', sshTargetId: 't', sshTargetGeneration: 1, ...ports }
  },
  { id: 'net-env' }
]

describe('WSL-host keep-awake publication', () => {
  it('recognizes only WSL hosts', () => {
    expect([...wslHostEnvironmentIds(environments)]).toEqual(['wsl-env'])
  })

  it('reports live working WSL-host agents and nothing else', () => {
    const worktreeEnvironment = (worktreeId: string | undefined): string | null =>
      worktreeId === 'wsl-worktree' ? 'wsl-env' : null
    const statuses = collectWslHostAwakeStatuses(
      [
        row({ paneKey: 'mirrored', connectionId: 'wsl-env' }),
        row({ paneKey: 'byte-derived', worktreeId: 'wsl-worktree' }),
        row({ paneKey: 'ssh', connectionId: 'ssh-env' }),
        row({ paneKey: 'local', worktreeId: 'local-worktree' }),
        row({ paneKey: 'idle', connectionId: 'wsl-env', state: 'done' }),
        row({ paneKey: 'restored', connectionId: 'wsl-env', restoredUnconfirmed: true }),
        row({ paneKey: 'asleep', connectionId: 'wsl-env', paneSleep: { ptyId: 'p' } })
      ],
      wslHostEnvironmentIds(environments),
      worktreeEnvironment
    )
    expect(statuses).toEqual([
      { paneKey: 'mirrored', receivedAt: 500 },
      { paneKey: 'byte-derived', receivedAt: 500 }
    ])
  })

  it('republishes on membership changes and once receipts move a minute on', () => {
    const sent = [{ paneKey: 'a', receivedAt: 1_000 }]
    expect(wslHostAwakeStatusesChanged(sent, [{ paneKey: 'a', receivedAt: 30_000 }])).toBe(false)
    expect(wslHostAwakeStatusesChanged(sent, [{ paneKey: 'a', receivedAt: 61_000 }])).toBe(true)
    expect(wslHostAwakeStatusesChanged(sent, [{ paneKey: 'b', receivedAt: 1_000 }])).toBe(true)
    expect(wslHostAwakeStatusesChanged(sent, [])).toBe(true)
  })
})
