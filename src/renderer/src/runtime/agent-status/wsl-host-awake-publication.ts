import type { AppState } from '@/store/types'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { WslHostAwakeStatus } from '../../../../shared/agent-status/wsl-host-awake-status'
import { classifyRuntimeEnvironmentHost } from '../../../../shared/remote-runtime/host-catalog/runtime-environment-host-kind'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'

// Why: keep-awake drops a row two hours after its receipt; a minute of slack costs nothing.
const RECEIVED_AT_REPUBLISH_MS = 60_000

type HostRecord = { id: string } & Parameters<typeof classifyRuntimeEnvironmentHost>[0]

export function wslHostEnvironmentIds(
  environments: readonly HostRecord[] | undefined
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const environment of environments ?? []) {
    if (classifyRuntimeEnvironmentHost(environment).kind === 'wsl') {
      ids.add(environment.id)
    }
  }
  return ids
}

/** Live working rows of agents that run under a WSL host's orcad on this machine. */
export function collectWslHostAwakeStatuses(
  rows: Iterable<AgentStatusEntry>,
  wslHostIds: ReadonlySet<string>,
  worktreeEnvironmentId: (worktreeId: string | undefined) => string | null
): WslHostAwakeStatus[] {
  const statuses: WslHostAwakeStatus[] = []
  for (const row of rows) {
    // Why: restored and sleeping rows keep UI only, matching what local keep-awake counts.
    if (row.state !== 'working' || row.restoredUnconfirmed === true || row.paneSleep) {
      continue
    }
    // Byte-derived rows of remote PTYs carry no connection id; their worktree names the host.
    const environmentId = row.connectionId ?? worktreeEnvironmentId(row.worktreeId)
    if (environmentId && wslHostIds.has(environmentId)) {
      statuses.push({ paneKey: row.paneKey, receivedAt: row.updatedAt })
    }
  }
  return statuses
}

/** Whether main's lease would read `next` differently from what it last received. */
export function wslHostAwakeStatusesChanged(
  previous: readonly WslHostAwakeStatus[],
  next: readonly WslHostAwakeStatus[]
): boolean {
  if (previous.length !== next.length) {
    return true
  }
  const previousByPane = new Map(previous.map((status) => [status.paneKey, status.receivedAt]))
  return next.some((status) => {
    const sentAt = previousByPane.get(status.paneKey)
    return sentAt === undefined || status.receivedAt - sentAt >= RECEIVED_AT_REPUBLISH_MS
  })
}

function* readRows(rows: AppState['agentStatusByPaneKey']): Iterable<AgentStatusEntry> {
  for (const key of rows.keys()) {
    const row = rows.get(key)
    if (row) {
      yield row
    }
  }
}

/** WSL-host agents never reach main's hook server, so this window reports them for keep-awake. */
export function startWslHostAwakePublication(
  store: {
    getState(): AppState
    subscribe(listener: (state: AppState, previous: AppState) => void): () => void
  },
  publish: (statuses: WslHostAwakeStatus[]) => void
): () => void {
  let sent: WslHostAwakeStatus[] = []
  let scheduled = false
  let stopped = false
  const flush = (): void => {
    scheduled = false
    if (stopped) {
      return
    }
    const state = store.getState()
    const wslHostIds = wslHostEnvironmentIds(state.runtimeEnvironments)
    if (wslHostIds.size === 0 && sent.length === 0) {
      return
    }
    const rows = state.agentStatusByPaneKey
    const next =
      wslHostIds.size === 0
        ? []
        : collectWslHostAwakeStatuses(readRows(rows), wslHostIds, (worktreeId) =>
            runtimeEnvironmentIdOrLocalUnlessTwin(state, worktreeId)
          )
    if (!wslHostAwakeStatusesChanged(sent, next)) {
      return
    }
    sent = next
    publish(next)
  }
  const schedule = (): void => {
    if (scheduled) {
      return
    }
    scheduled = true
    queueMicrotask(flush)
  }
  const unsubscribeRows = store.getState().agentStatusByPaneKey.subscribeChanges(schedule)
  const unsubscribeEnvironments = store.subscribe((state, previous) => {
    if (state.runtimeEnvironments !== previous.runtimeEnvironments) {
      schedule()
    }
  })
  schedule()
  return () => {
    stopped = true
    unsubscribeRows()
    unsubscribeEnvironments()
    if (sent.length > 0) {
      sent = []
      publish([])
    }
  }
}
