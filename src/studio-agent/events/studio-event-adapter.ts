import type { StudioAgentEvent } from '../domain/types'

export interface StudioExternalEvent {
  type: string
  properties: Record<string, unknown>
}

export function adaptStudioEvent(event: StudioAgentEvent): StudioExternalEvent | null {
  switch (event.type) {
    case 'task_updated':
      return {
        type: 'task.updated',
        properties: {
          sessionId: event.sessionId,
          runId: event.runId,
          task: event.task
        }
      }

    case 'work_updated':
      return {
        type: 'work.updated',
        properties: {
          sessionId: event.sessionId,
          runId: event.runId,
          work: event.work
        }
      }

    case 'work_result_updated':
      return {
        type: 'work-result.updated',
        properties: {
          sessionId: event.sessionId,
          runId: event.runId,
          result: event.result
        }
      }

    case 'permission.asked':
      return {
        type: 'permission.asked',
        properties: {
          id: event.properties.id,
          sessionID: event.properties.sessionID,
          permission: event.properties.permission,
          patterns: event.properties.patterns,
          metadata: event.properties.metadata,
          always: event.properties.always,
          tool: event.properties.tool
        }
      }

    case 'permission.replied':
      return {
        type: 'permission.replied',
        properties: {
          sessionID: event.properties.sessionID,
          requestID: event.properties.requestID,
          reply: event.properties.reply
        }
      }

    case 'question_requested':
      return {
        type: 'question.requested',
        properties: {
          sessionId: event.sessionId,
          runId: event.runId,
          question: event.question,
          details: event.details
        }
      }

    case 'run_updated':
      return {
        type: 'run.updated',
        properties: {
          run: event.run
        }
      }

    case 'assistant_text':
      return {
        type: 'assistant.text',
        properties: {
          sessionId: event.sessionId,
          runId: event.runId,
          text: event.text
        }
      }

    default:
      return null
  }
}
