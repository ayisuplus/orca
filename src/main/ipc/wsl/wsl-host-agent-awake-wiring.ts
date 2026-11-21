/** Production wiring for keep-awake's WSL-host agents: each ready host's own session-tabs stream. */
import type { AgentAwakeService } from '../../power/agent-awake-service'
import { WslHostAgentAwake } from '../../power/wsl-host-agent-awake'
import {
  getWslHostService,
  onWslHostStatusesChanged
} from '../../wsl/host-lifecycle/wsl-host-service-instance'
import { subscribeRuntimeEnvironment } from '../runtime-environments/requests/runtime-environment-subscription-routing'
import { getRuntimeEnvironmentRegistryRoot } from '../runtime-environments/catalog/runtime-environment-registry-root'

const STREAM_OPEN_TIMEOUT_MS = 15_000

export function startWslHostAgentAwake(service: AgentAwakeService): () => void {
  const watcher = new WslHostAgentAwake({
    listHosts: () => getWslHostService()?.getStatuses() ?? [],
    onHostsChanged: onWslHostStatusesChanged,
    openStream: async (environmentId, handlers) => {
      let ended = false
      const end = (): void => {
        if (!ended) {
          ended = true
          handlers.onEnd()
        }
      }
      const subscription = await subscribeRuntimeEnvironment(
        getRuntimeEnvironmentRegistryRoot(),
        environmentId,
        'session.tabs.subscribeAll',
        {},
        STREAM_OPEN_TIMEOUT_MS,
        {
          onEvent: (payload) => {
            if (ended) {
              return
            }
            if (payload.type === 'response' && payload.response.ok) {
              handlers.onFrame(payload.response.result)
            } else if (payload.type !== 'binary') {
              // An error response, transport error or close leaves the stream unable to report.
              end()
            }
          },
          onClose: end
        },
        () => !ended,
        undefined,
        // Why: keep-awake only listens to a running host; it must never boot a distro.
        { wslStart: 'never' }
      )
      return {
        close: () => {
          ended = true
          subscription.close()
        }
      }
    },
    report: (environmentId, statuses) => service.setWslHostStatuses(environmentId, statuses),
    now: Date.now
  })
  return () => watcher.dispose()
}
