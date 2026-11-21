import type { WslHostAwakeStatus } from './agent-awake-service'

type HostConnection = { environmentId: string; state: string }
type HostStream = { close: () => void }

export type WslHostAgentAwakeDeps = {
  listHosts: () => readonly HostConnection[]
  onHostsChanged: (listener: () => void) => () => void
  /** Opens the host's session-tabs inventory stream; `onEnd` fires once when it can carry no more. */
  openStream: (
    environmentId: string,
    handlers: { onFrame: (frame: unknown) => void; onEnd: () => void }
  ) => Promise<HostStream>
  report: (environmentId: string, statuses: WslHostAwakeStatus[]) => void
  now: () => number
}

/** One working pane: the host's evidence clock, kept only to tell a new observation from a repeat. */
type PaneReceipt = { hostObservedAt: number; receivedAt: number }

type HostWatch = {
  stream: HostStream | null
  /** Working panes per host worktree, as the current stream last described them. */
  worktrees: Map<string, Map<string, PaneReceipt>>
  /** First local receipt of each pane's current evidence, kept across stream reconnects. */
  receipts: Map<string, PaneReceipt>
  retryTimer: ReturnType<typeof setTimeout> | null
  retryAttempt: number
  reported: string
}

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 300_000]

/** Counts agents working on this machine's WSL hosts from the host's own session stream, so a
 *  hidden or tray-parked window never hides them from keep-awake. */
export class WslHostAgentAwake {
  private readonly watches = new Map<string, HostWatch>()
  private readonly stopListening: () => void
  private disposed = false

  constructor(private readonly deps: WslHostAgentAwakeDeps) {
    this.stopListening = deps.onHostsChanged(() => this.reconcile())
    this.reconcile()
  }

  dispose(): void {
    this.disposed = true
    this.stopListening()
    for (const environmentId of this.watches.keys()) {
      this.stop(environmentId)
    }
  }

  private reconcile(): void {
    if (this.disposed) {
      return
    }
    const ready = new Set(
      this.deps
        .listHosts()
        .filter((host) => host.state === 'ready')
        .map((host) => host.environmentId)
    )
    for (const environmentId of this.watches.keys()) {
      if (!ready.has(environmentId)) {
        this.stop(environmentId)
      }
    }
    for (const environmentId of ready) {
      if (!this.watches.has(environmentId)) {
        const watch: HostWatch = {
          stream: null,
          worktrees: new Map(),
          receipts: new Map(),
          retryTimer: null,
          retryAttempt: 0,
          reported: ''
        }
        this.watches.set(environmentId, watch)
        this.open(environmentId, watch)
      }
    }
  }

  private open(environmentId: string, watch: HostWatch): void {
    let ended = false
    const isCurrent = (): boolean => !ended && this.watches.get(environmentId) === watch
    const end = (): void => {
      if (!isCurrent()) {
        return
      }
      ended = true
      watch.stream?.close()
      watch.stream = null
      // Why: a dropped stream proves nothing is known any more; stop counting now, not at expiry.
      watch.worktrees.clear()
      this.publish(environmentId, watch)
      this.scheduleRetry(environmentId, watch)
    }
    this.deps
      .openStream(environmentId, {
        onFrame: (frame) => {
          if (isCurrent() && this.applyFrame(watch, frame)) {
            watch.retryAttempt = 0
            this.publish(environmentId, watch)
          } else if (isCurrent() && isEndFrame(frame)) {
            end()
          }
        },
        onEnd: end
      })
      .then(
        (stream) => {
          if (isCurrent()) {
            watch.stream = stream
          } else {
            stream.close()
          }
        },
        () => end()
      )
  }

  private scheduleRetry(environmentId: string, watch: HostWatch): void {
    const delay = RETRY_DELAYS_MS[Math.min(watch.retryAttempt, RETRY_DELAYS_MS.length - 1)]
    watch.retryAttempt += 1
    watch.retryTimer = setTimeout(() => {
      watch.retryTimer = null
      if (this.watches.get(environmentId) === watch) {
        this.open(environmentId, watch)
      }
    }, delay)
    watch.retryTimer.unref?.()
  }

  private stop(environmentId: string): void {
    const watch = this.watches.get(environmentId)
    if (!watch) {
      return
    }
    this.watches.delete(environmentId)
    if (watch.retryTimer) {
      clearTimeout(watch.retryTimer)
    }
    watch.stream?.close()
    this.deps.report(environmentId, [])
  }

  /** Returns whether the frame described host worktrees. */
  private applyFrame(watch: HostWatch, frame: unknown): boolean {
    if (!isRecord(frame)) {
      return false
    }
    if (frame.type === 'snapshots' && Array.isArray(frame.snapshots)) {
      watch.worktrees.clear()
      for (const snapshot of frame.snapshots) {
        this.applySnapshot(watch, snapshot)
      }
      return true
    }
    if (frame.type === 'updated' || frame.type === 'snapshot') {
      this.applySnapshot(watch, frame)
      return true
    }
    return false
  }

  private applySnapshot(watch: HostWatch, snapshot: unknown): void {
    if (!isRecord(snapshot) || typeof snapshot.worktree !== 'string') {
      return
    }
    if (snapshot.removed === true || !Array.isArray(snapshot.tabs)) {
      watch.worktrees.delete(snapshot.worktree)
      return
    }
    const panes = new Map<string, PaneReceipt>()
    for (const tab of snapshot.tabs) {
      const hostObservedAt = workingHostObservedAt(tab)
      if (hostObservedAt === null || !isRecord(tab) || typeof tab.id !== 'string') {
        continue
      }
      const paneKey = `${snapshot.worktree}\0${tab.id}`
      const previous = watch.receipts.get(paneKey)
      // Why: a repeated observation keeps its first receipt, so resent frames never extend the lease.
      const receipt =
        previous?.hostObservedAt === hostObservedAt
          ? previous
          : { hostObservedAt, receivedAt: this.deps.now() }
      panes.set(paneKey, receipt)
    }
    watch.worktrees.set(snapshot.worktree, panes)
  }

  private publish(environmentId: string, watch: HostWatch): void {
    const statuses: WslHostAwakeStatus[] = []
    const receipts = new Map<string, PaneReceipt>()
    for (const panes of watch.worktrees.values()) {
      for (const [paneKey, receipt] of panes) {
        receipts.set(paneKey, receipt)
        statuses.push({ paneKey, receivedAt: receipt.receivedAt })
      }
    }
    // Keep receipts only for panes still working; a pane that stops and restarts is new evidence.
    if (watch.worktrees.size > 0 || statuses.length > 0) {
      watch.receipts = receipts
    }
    const reported = statuses.map((status) => `${status.paneKey}@${status.receivedAt}`).join('\n')
    if (reported === watch.reported) {
      return
    }
    watch.reported = reported
    this.deps.report(environmentId, statuses)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEndFrame(frame: unknown): boolean {
  return isRecord(frame) && frame.type === 'end'
}

/** The host's evidence clock for a live working terminal agent, or null when it should not count. */
function workingHostObservedAt(tab: unknown): number | null {
  if (!isRecord(tab) || tab.type !== 'terminal' || !isRecord(tab.agentStatus)) {
    return null
  }
  const status = tab.agentStatus
  // Restored and sleeping rows keep identity only, matching what local keep-awake ignores.
  if (status.state !== 'working' || status.restoredUnconfirmed === true || status.paneSleep) {
    return null
  }
  const observedAt =
    typeof status.evidenceObservedAt === 'number' ? status.evidenceObservedAt : status.updatedAt
  return typeof observedAt === 'number' && Number.isFinite(observedAt) ? observedAt : null
}
