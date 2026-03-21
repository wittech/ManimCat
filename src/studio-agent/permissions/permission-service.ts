import { createLogger } from '../../utils/logger'
import type {
  StudioPermissionDecision,
  StudioPermissionReply,
  StudioPermissionRequest,
  StudioPermissionAskedEvent,
  StudioPermissionRepliedEvent
} from '../domain/types'

const logger = createLogger('StudioPermissionService')

interface PendingPermissionRequest {
  request: StudioPermissionRequest
  resolve: (decision: StudioPermissionDecision) => void
}

export class StudioPermissionService {
  private readonly pending = new Map<string, PendingPermissionRequest>()
  private listener?: (event: StudioPermissionAskedEvent | StudioPermissionRepliedEvent) => void

  onEvent(listener: (event: StudioPermissionAskedEvent | StudioPermissionRepliedEvent) => void): void {
    this.listener = listener
  }

  onRequested(listener: (event: StudioPermissionAskedEvent) => void): void {
    this.listener = (event) => {
      if (event.type === 'permission.asked') {
        listener(event)
      }
    }
  }

  async ask(request: StudioPermissionRequest): Promise<StudioPermissionDecision> {
    return new Promise<StudioPermissionDecision>((resolve) => {
      this.pending.set(request.id, {
        request,
        resolve
      })

      const event: StudioPermissionAskedEvent = {
        type: 'permission.asked',
        properties: request
      }

      this.listener?.(event)
    })
  }

  reply(input: StudioPermissionReply): boolean {
    const pending = this.pending.get(input.requestID)
    if (!pending) {
      logger.warn('Studio permission reply ignored because request was not found', {
        requestId: input.requestID,
        reply: input.reply
      })
      return false
    }

    this.pending.delete(input.requestID)
    pending.resolve(input.reply)

    this.listener?.({
      type: 'permission.replied',
      properties: {
        sessionID: pending.request.sessionID,
        requestID: input.requestID,
        reply: input.reply
      }
    })

    return true
  }

  listPending(): StudioPermissionRequest[] {
    return [...this.pending.values()].map((item) => item.request)
  }
}
