import { ipcMain } from 'electron'
import type { AgentAwakeService } from './agent-awake-service'
import { sanitizeWslHostAwakeStatuses } from '../../shared/agent-status/wsl-host-awake-status'

/** WSL-host agents report through the renderer's host stream, never main's hook server. */
export function registerWslHostAwakeHandlers(agentAwakeService: AgentAwakeService): void {
  const sources = new Set<number>()
  ipcMain.removeAllListeners('agentAwake:setWslHostStatuses')
  ipcMain.on('agentAwake:setWslHostStatuses', (event, statuses: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) {
      return
    }
    const sender = event.sender
    const sourceId = sender.id
    if (!sources.has(sourceId)) {
      sources.add(sourceId)
      // Why: a closed or crashed window cannot send its own clear.
      sender.once('destroyed', () => {
        sources.delete(sourceId)
        agentAwakeService.setWslHostStatuses(sourceId, [])
      })
    }
    agentAwakeService.setWslHostStatuses(sourceId, sanitizeWslHostAwakeStatuses(statuses))
  })
}
