// @vitest-environment happy-dom

import React, { type ComponentProps } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NativeChatQueuedMessageCard } from './NativeChatQueuedMessageCard'
import { projectQueuedMessageCards } from '../../../../../shared/agent-session/view/structured-agent-session-queued-cards'
import type { AgentSessionQueuedMessage } from '../../../../../shared/agent-session/requests/agent-session-queued-message-wire'

vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef<
    HTMLButtonElement,
    ComponentProps<'button'> & { variant?: string; size?: string }
  >(({ variant: _variant, size: _size, ...props }, ref) => <button ref={ref} {...props} />)
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => children,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => children,
  TooltipContent: () => null
}))
// The ⋯ menu portals in the app; inline here so its items can be read.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => children,
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children }: React.PropsWithChildren) => (
    <button type="button" role="menuitem">
      {children}
    </button>
  )
}))

afterEach(cleanup)

function queued(
  messageId: string,
  body: Partial<AgentSessionQueuedMessage['body']>
): AgentSessionQueuedMessage {
  return {
    messageId,
    position: 1,
    state: 'waiting',
    body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Check CI' }], ...body }
  }
}

function editItem(message: AgentSessionQueuedMessage): HTMLElement | null {
  const [card] = projectQueuedMessageCards([message], [], { agentWorking: true })
  const view = render(
    <NativeChatQueuedMessageCard
      card={card!}
      chatWorktreeId={null}
      showsSteerShortcut={false}
      agentWorking
      onSteer={() => {}}
      onDelete={() => {}}
      onEdit={() => {}}
    />
  )
  // ⋯ always holds Show full message and Delete; only Edit depends on the host accepting the edit.
  return view.queryByRole('menuitem', { name: 'Edit message' })
}

it("offers Edit on the owner's queued message but never on an automation's queued run", () => {
  expect(editItem(queued('mine', {}))).not.toBeNull()
  cleanup()
  expect(editItem(queued('run', { origin: 'automation-run' }))).toBeNull()
})
