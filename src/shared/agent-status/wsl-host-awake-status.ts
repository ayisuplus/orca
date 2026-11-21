/** One agent working on a WSL host on this machine, as the renderer sees it live. */
export type WslHostAwakeStatus = {
  paneKey: string
  /** Last accepted status write for the pane; keep-awake drops it once stale. */
  receivedAt: number
}

/** A window's whole WSL-host set fits well below this; anything larger is malformed. */
export const MAX_WSL_HOST_AWAKE_STATUSES = 512

/** IPC payloads are untrusted shapes: keep only well-formed rows. */
export function sanitizeWslHostAwakeStatuses(value: unknown): WslHostAwakeStatus[] {
  if (!Array.isArray(value)) {
    return []
  }
  const statuses: WslHostAwakeStatus[] = []
  for (const candidate of value.slice(0, MAX_WSL_HOST_AWAKE_STATUSES)) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.paneKey === 'string' &&
      candidate.paneKey.length > 0 &&
      typeof candidate.receivedAt === 'number' &&
      Number.isFinite(candidate.receivedAt)
    ) {
      statuses.push({ paneKey: candidate.paneKey, receivedAt: candidate.receivedAt })
    }
  }
  return statuses
}
