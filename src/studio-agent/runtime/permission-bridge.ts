import { randomUUID } from 'node:crypto'
import type { StudioPermissionDecision, StudioRun, StudioSession } from '../domain/types'
import { StudioPermissionService } from '../permissions/permission-service'
import {
  type StudioToolPermissionRequest,
  toPermissionRequest
} from './tool-runtime-context'

export class StudioPermissionRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudioPermissionRejectedError'
  }
}

export function createPermissionAskBridge(input: {
  permissionService?: StudioPermissionService
  fallback?: (decisionRequest: {
    permission: string
    patterns: string[]
    metadata?: Record<string, unknown>
    always?: string[]
  }) => Promise<StudioPermissionDecision>
  session: StudioSession
  run: StudioRun
  messageId: string
  toolName: string
  callId: string
}): (request: StudioToolPermissionRequest) => Promise<StudioPermissionDecision> {
  return async (request) => {
    const decision = input.permissionService
      ? await input.permissionService.ask(
          toPermissionRequest(
            request,
            {
              id: `permission_${randomUUID()}`,
              sessionID: input.session.id
            },
            {
              messageID: input.messageId,
              callID: input.callId
            }
          )
        )
      : await input.fallback?.(request)

    if (!decision || decision === 'reject') {
      throw new StudioPermissionRejectedError(
        `Permission rejected for tool "${input.toolName}"`
      )
    }

    return decision
  }
}
