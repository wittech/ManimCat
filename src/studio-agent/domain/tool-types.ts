import type { StudioAgentType, StudioRun, StudioSession } from './core-types'
import type { StudioAssistantMessage, StudioFileAttachment } from './message-types'
import type { StudioEventBus } from './event-types'
import type {
  StudioSessionStore,
  StudioTaskStore,
  StudioWorkResultStore,
  StudioWorkStore
} from './store-types'

export type StudioToolCategory =
  | 'safe-read'
  | 'edit'
  | 'agent'
  | 'shell'
  | 'review'
  | 'render'
  | 'external'
  | 'question'

export interface StudioToolResult {
  title: string
  output: string
  metadata?: Record<string, unknown>
  attachments?: StudioFileAttachment[]
}

export interface StudioToolFailure {
  error: string
  metadata?: Record<string, unknown>
}

export interface StudioPermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata?: Record<string, unknown>
  always: string[]
  tool?: {
    messageID: string
    callID: string
  }
}

export type StudioPermissionDecision = 'once' | 'always' | 'reject'

export interface StudioPermissionReply {
  requestID: string
  reply: StudioPermissionDecision
  message?: string
  directory?: string
}

export interface StudioToolContext {
  projectId: string
  session: StudioSession
  run: StudioRun
  assistantMessage: StudioAssistantMessage
  eventBus: StudioEventBus
  taskStore?: StudioTaskStore
  workStore?: StudioWorkStore
  workResultStore?: StudioWorkResultStore
  askForConfirmation: (request: StudioPermissionRequest) => Promise<StudioPermissionDecision>
  setToolMetadata?: (metadata: { title?: string; metadata?: Record<string, unknown> }) => void
}

export interface StudioToolDefinition<TInput = unknown> {
  name: string
  description: string
  category: StudioToolCategory
  permission: string
  allowedAgents: StudioAgentType[]
  requiresTask: boolean
  execute: (input: TInput, context: StudioToolContext) => Promise<StudioToolResult>
}

export interface StudioSkillDefinition {
  name: string
  description: string
  directory: string
  entryFile: string
  manifestPath?: string
  preferredAgent?: StudioAgentType
  allowedTools?: string[]
}
