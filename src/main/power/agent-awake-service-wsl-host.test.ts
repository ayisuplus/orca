import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentAwakeService } from './agent-awake-service'
import { WslHostAgentAwake } from './wsl-host-agent-awake'

vi.mock('electron', () => ({
  powerMonitor: { on: vi.fn(), off: vi.fn() },
  powerSaveBlocker: { start: vi.fn(), stop: vi.fn(), isStarted: vi.fn() }
}))

const NOW = 10_000_000_000

function createService() {
  const assertion = { start: vi.fn(() => true), stop: vi.fn(), dispose: vi.fn() }
  const blocker = { start: vi.fn(() => 1), stop: vi.fn(), isStarted: vi.fn(() => true) }
  const service = new AgentAwakeService({
    blocker,
    linuxAssertion: assertion,
    macosAssertion: assertion,
    logger: { debug: vi.fn(), warn: vi.fn() },
    now: () => NOW,
    platform: 'win32',
    powerMonitor: null
  })
  service.setMode('auto')
  return service
}

function terminalTab(id: string, agentStatus: Record<string, unknown> | null) {
  return { type: 'terminal', id, agentStatus }
}

function workingStatus(hostUpdatedAt: number) {
  return { state: 'working', updatedAt: hostUpdatedAt }
}

/** A WSL host service and host stream with no renderer involved. */
function createHost(service: AgentAwakeService) {
  let hostState = 'ready'
  let hostsChanged = (): void => {}
  let frame = (_frame: unknown): void => {}
  let streamEnd = (): void => {}
  const close = vi.fn()
  const watcher = new WslHostAgentAwake({
    listHosts: () => [{ environmentId: 'wsl-env', state: hostState }],
    onHostsChanged: (listener) => {
      hostsChanged = listener
      return () => {}
    },
    openStream: async (_environmentId, handlers) => {
      frame = handlers.onFrame
      streamEnd = handlers.onEnd
      return { close }
    },
    report: (environmentId, statuses) => service.setWslHostStatuses(environmentId, statuses),
    now: () => NOW
  })
  return {
    watcher,
    close,
    send: (value: unknown) => frame(value),
    endStream: () => streamEnd(),
    setHostState: (state: string) => {
      hostState = state
      hostsChanged()
    }
  }
}

const watchers: WslHostAgentAwake[] = []
afterEach(() => {
  for (const watcher of watchers.splice(0)) {
    watcher.dispose()
  }
})

describe('keep-awake for agents on WSL hosts', () => {
  it('keeps the machine awake while a host agent works, with no window involved', async () => {
    const service = createService()
    const host = createHost(service)
    watchers.push(host.watcher)
    await Promise.resolve()

    host.send({
      type: 'snapshots',
      snapshots: [
        {
          worktree: 'wt-1',
          tabs: [terminalTab('t1', workingStatus(NOW)), terminalTab('t2', null)]
        }
      ]
    })
    expect(service.getStatus().active).toBe(true)

    host.send({ type: 'updated', worktree: 'wt-1', tabs: [terminalTab('t1', { state: 'done' })] })
    expect(service.getStatus().active).toBe(false)
    service.dispose()
  })

  it('stops counting as soon as the host disconnects or its stream drops', async () => {
    const service = createService()
    const host = createHost(service)
    watchers.push(host.watcher)
    await Promise.resolve()
    const working = {
      type: 'snapshots',
      snapshots: [{ worktree: 'wt-1', tabs: [terminalTab('t1', workingStatus(NOW))] }]
    }

    host.send(working)
    expect(service.getStatus().active).toBe(true)
    host.endStream()
    expect(service.getStatus().active).toBe(false)

    const other = createHost(service)
    watchers.push(other.watcher)
    await Promise.resolve()
    other.send(working)
    expect(service.getStatus().active).toBe(true)
    other.setHostState('reconnecting')
    expect(other.close).toHaveBeenCalled()
    expect(service.getStatus().active).toBe(false)
    service.dispose()
  })

  it('times a host agent by this machine’s receipt, not the host clock', async () => {
    const service = createService()
    const host = createHost(service)
    watchers.push(host.watcher)
    await Promise.resolve()

    // A host clock hours behind this machine must not make a live agent look stale.
    host.send({
      type: 'snapshots',
      snapshots: [{ worktree: 'wt-1', tabs: [terminalTab('t1', workingStatus(0))] }]
    })
    expect(service.getStatus().active).toBe(true)
    service.dispose()
  })

  it('does not defer local repo maintenance for host agents', () => {
    const service = createService()
    service.setWslHostStatuses('wsl-env', [{ paneKey: 'p', receivedAt: NOW }])
    expect(service.getStatus().active).toBe(true)
    expect(service.getWorkingAgentCount()).toBe(0)
    service.setWslHostStatuses('wsl-env', [])
    expect(service.getStatus().active).toBe(false)
    service.dispose()
  })
})
