import { describe, expect, it, vi } from 'vitest'
import { AgentAwakeService } from './agent-awake-service'

vi.mock('electron', () => ({
  powerMonitor: { on: vi.fn(), off: vi.fn() },
  powerSaveBlocker: { start: vi.fn(), stop: vi.fn(), isStarted: vi.fn() }
}))

function createService(now = 10_000_000_000) {
  const assertion = { start: vi.fn(() => true), stop: vi.fn(), dispose: vi.fn() }
  const blocker = { start: vi.fn(() => 1), stop: vi.fn(), isStarted: vi.fn(() => true) }
  const service = new AgentAwakeService({
    blocker,
    linuxAssertion: assertion,
    macosAssertion: assertion,
    logger: { debug: vi.fn(), warn: vi.fn() },
    now: () => now,
    platform: 'win32',
    powerMonitor: null
  })
  service.setMode('auto')
  return { service, blocker }
}

describe('AgentAwakeService WSL-host agents', () => {
  it('keeps the machine awake while a WSL-host agent works', () => {
    const { service, blocker } = createService()
    service.setWslHostStatuses(7, [{ paneKey: 'tab:leaf', receivedAt: 10_000_000_000 }])

    expect(service.getStatus().active).toBe(true)
    expect(service.getWorkingAgentCount()).toBe(1)
    expect(blocker.start).toHaveBeenCalledWith('prevent-display-sleep')

    service.setWslHostStatuses(7, [])
    expect(service.getStatus().active).toBe(false)
    expect(blocker.stop).toHaveBeenCalledWith(1)
    service.dispose()
  })

  it('keeps each window’s entries apart and ignores stale rows', () => {
    const { service } = createService()
    service.setWslHostStatuses(1, [{ paneKey: 'tab:leaf', receivedAt: 10_000_000_000 }])
    service.setWslHostStatuses(2, [{ paneKey: 'tab:leaf', receivedAt: 10_000_000_000 }])
    service.setWslHostStatuses(1, [])
    expect(service.getWorkingAgentCount()).toBe(1)

    service.setWslHostStatuses(2, [{ paneKey: 'tab:leaf', receivedAt: 0 }])
    expect(service.getWorkingAgentCount()).toBe(0)
    service.dispose()
  })
})
