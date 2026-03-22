import type { StudioRun, StudioSession, StudioSessionEvent, StudioTask, StudioWork, StudioWorkResult } from './core-types'
import type { StudioFileAttachment } from './message-types'
import type { StudioPermissionDecision, StudioPermissionRequest } from './tool-types'

export interface StudioAssistantTextEvent {
  type: 'assistant_text'
  sessionId: string
  runId: string
  text: string
}

export interface StudioToolInputStartEvent {
  type: 'tool_input_start'
  sessionId: string
  runId: string
  toolName: string
  callId: string
  raw?: string
}

export interface StudioToolCallEvent {
  type: 'tool_call'
  sessionId: string
  runId: string
  toolName: string
  callId: string
  input: unknown
}

export interface StudioToolResultEvent {
  type: 'tool_result'
  sessionId: string
  runId: string
  toolName: string
  callId: string
  status: 'completed' | 'failed'
  title?: string
  output?: string
  metadata?: Record<string, unknown>
  attachments?: StudioFileAttachment[]
  error?: string
}

export interface StudioPermissionAskedEvent {
  type: 'permission.asked'
  properties: StudioPermissionRequest
}

export interface StudioPermissionRepliedEvent {
  type: 'permission.replied'
  properties: {
    sessionID: string
    requestID: string
    reply: StudioPermissionDecision
  }
}

export interface StudioQuestionRequestedEvent {
  type: 'question_requested'
  sessionId: string
  runId: string
  question: string
  details?: string
}

export interface StudioTaskEvent {
  type: 'task_updated'
  sessionId: string
  runId?: string
  task: StudioTask
}

export interface StudioWorkEvent {
  type: 'work_updated'
  sessionId: string
  runId?: string
  work: StudioWork
}

export interface StudioWorkResultEvent {
  type: 'work_result_updated'
  sessionId: string
  runId?: string
  result: StudioWorkResult
}

export interface StudioSessionEventQueuedEvent {
  type: 'session_event_queued'
  sessionId: string
  runId?: string
  event: StudioSessionEvent
}

export interface StudioRunEvent {
  type: 'run_updated'
  run: StudioRun
}

export type StudioAgentEvent =
  | StudioAssistantTextEvent
  | StudioToolInputStartEvent
  | StudioToolCallEvent
  | StudioToolResultEvent
  | StudioPermissionAskedEvent
  | StudioPermissionRepliedEvent
  | StudioQuestionRequestedEvent
  | StudioTaskEvent
  | StudioWorkEvent
  | StudioWorkResultEvent
  | StudioSessionEventQueuedEvent
  | StudioRunEvent

export interface StudioEventBus {
  publish: (event: StudioAgentEvent) => void
  list: () => StudioAgentEvent[]
  clear: () => void
}
