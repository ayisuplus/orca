import { ipcRenderer } from 'electron'
import type { ComputerAwakeStatus } from '../../../shared/app-lifecycle/computer-awake-mode'
import type { PreloadApi } from '../../api-types'
import type { WslHostAwakeStatus } from '../../../shared/agent-status/wsl-host-awake-status'

export const agentAwakeApi = {
  getStatus: (): Promise<ComputerAwakeStatus> => ipcRenderer.invoke('agentAwake:getStatus'),
  setWslHostStatuses: (statuses: WslHostAwakeStatus[]): void =>
    ipcRenderer.send('agentAwake:setWslHostStatuses', statuses),
  onChanged: (callback: (status: ComputerAwakeStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ComputerAwakeStatus): void =>
      callback(status)
    ipcRenderer.on('agentAwake:changed', listener)
    return () => ipcRenderer.removeListener('agentAwake:changed', listener)
  }
} satisfies PreloadApi['agentAwake']
