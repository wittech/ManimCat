import type {
  StudioAssistantMessage,
  StudioPermissionRequest,
  StudioProcessorStreamEvent,
  StudioRun,
  StudioRuntimeTurnPlan,
  StudioSession,
  StudioSessionStore,
  StudioTaskStore,
  StudioToolDefinition,
  StudioWorkResultStore,
  StudioWorkStore
} from '../domain/types'
import { evaluatePermission } from '../permissions/policy'
import type { StudioPermissionService } from '../permissions/permission-service'
import type { StudioToolRegistry } from '../tools/registry'
import { createPermissionAskBridge, StudioPermissionRejectedError } from './permission-bridge'
import type {
  StudioResolvedSkill,
  StudioRuntimeBackedToolContext,
  StudioSubagentRunRequest,
  StudioSubagentRunResult
} from './tool-runtime-context'

interface StudioTurnExecutionOptions {
  projectId: string
  session: StudioSession
  run: StudioRun
  assistantMessage: StudioAssistantMessage
  plan: StudioRuntimeTurnPlan
  registry: StudioToolRegistry
  eventBus: StudioRuntimeBackedToolContext['eventBus']
  permissionService?: StudioPermissionService
  sessionStore?: StudioSessionStore
  taskStore?: StudioTaskStore
  workStore?: StudioWorkStore
  workResultStore?: StudioWorkResultStore
  askForConfirmation?: (request: StudioPermissionRequest) => Promise<'once' | 'always' | 'reject'>
  runSubagent?: (input: StudioSubagentRunRequest) => Promise<StudioSubagentRunResult>
  resolveSkill?: (name: string, session: StudioSession) => Promise<StudioResolvedSkill>
  setToolMetadata: (callId: string, metadata: { title?: string; metadata?: Record<string, unknown> }) => void
}

export async function* createStudioTurnExecutionStream(
  input: StudioTurnExecutionOptions
): AsyncGenerator<StudioProcessorStreamEvent> {
  if (input.plan.assistantText) {
    yield { type: 'text-start' }
    yield { type: 'text-delta', text: input.plan.assistantText }
    yield { type: 'text-end' }
  }

  for (const toolCall of input.plan.toolCalls ?? []) {
    const toolInput = asToolInput(toolCall.input)
    const tool = input.registry.get(toolCall.toolName)

    yield {
      type: 'tool-input-start',
      id: toolCall.callId,
      toolName: toolCall.toolName,
      raw: JSON.stringify(toolInput)
    }

    yield {
      type: 'tool-call',
      toolCallId: toolCall.callId,
      toolName: toolCall.toolName,
      input: toolInput
    }

    if (!tool) {
      yield createToolErrorEvent(toolCall.callId, `Tool not found: ${toolCall.toolName}`)
      continue
    }

    const permissionAction = evaluatePermission(
      input.session.permissionRules,
      tool.permission,
      resolvePermissionPattern(toolInput)
    )

    if (permissionAction === 'deny') {
      yield createToolErrorEvent(toolCall.callId, `Permission denied for tool "${toolCall.toolName}"`, {
        permission: tool.permission
      })
      continue
    }

    try {
      const result = await executeTool({
        tool,
        toolInput,
        toolCall,
        options: input
      })

      yield {
        type: 'tool-result',
        toolCallId: toolCall.callId,
        title: result.title,
        output: result.output,
        metadata: result.metadata,
        attachments: result.attachments
      }
    } catch (error) {
      yield createToolErrorEvent(
        toolCall.callId,
        error instanceof Error ? error.message : String(error),
        error instanceof StudioPermissionRejectedError ? { rejected: true } : undefined
      )
    }
  }

  yield { type: 'finish-step' }
}

async function executeTool(input: {
  tool: StudioToolDefinition
  toolInput: Record<string, unknown>
  toolCall: { toolName: string; callId: string; input: unknown }
  options: StudioTurnExecutionOptions
}) {
  const ask = createPermissionAskBridge({
    permissionService: input.options.permissionService,
    fallback: input.options.askForConfirmation
      ? async (request) =>
          input.options.askForConfirmation?.({
            id: `fallback_${input.toolCall.callId}`,
            sessionID: input.options.session.id,
            permission: request.permission,
            patterns: request.patterns,
            metadata: request.metadata,
            always: request.always ?? request.patterns,
            tool: {
              messageID: input.options.assistantMessage.id,
              callID: input.toolCall.callId
            }
          }) ?? 'reject'
      : undefined,
    session: input.options.session,
    run: input.options.run,
    messageId: input.options.assistantMessage.id,
    toolName: input.toolCall.toolName,
    callId: input.toolCall.callId
  })

  const toolContext = {
    projectId: input.options.projectId,
    session: input.options.session,
    run: input.options.run,
    assistantMessage: input.options.assistantMessage,
    eventBus: input.options.eventBus,
    taskStore: input.options.taskStore,
    workStore: input.options.workStore,
    workResultStore: input.options.workResultStore,
    askForConfirmation: async (request: StudioPermissionRequest) => {
      if (!input.options.permissionService) {
        return input.options.askForConfirmation?.(request) ?? 'reject'
      }
      return input.options.permissionService.ask(request)
    },
    setToolMetadata: (metadata: { title?: string; metadata?: Record<string, unknown> }) => {
      input.options.setToolMetadata(input.toolCall.callId, metadata)
    },
    sessionStore: input.options.sessionStore,
    ask,
    runSubagent: input.options.runSubagent,
    resolveSkill: input.options.resolveSkill
  } as StudioRuntimeBackedToolContext

  return input.tool.execute(input.toolInput, toolContext)
}

function createToolErrorEvent(
  toolCallId: string,
  error: string,
  metadata?: Record<string, unknown>
): StudioProcessorStreamEvent {
  return {
    type: 'tool-error',
    toolCallId,
    error,
    metadata
  }
}

function resolvePermissionPattern(input: Record<string, unknown>): string {
  const candidate = input as { file?: unknown; path?: unknown; pattern?: unknown; directory?: unknown }
  if (typeof candidate.file === 'string' && candidate.file) {
    return candidate.file
  }
  if (typeof candidate.path === 'string' && candidate.path) {
    return candidate.path
  }
  if (typeof candidate.directory === 'string' && candidate.directory) {
    return candidate.directory
  }
  if (typeof candidate.pattern === 'string' && candidate.pattern) {
    return candidate.pattern
  }
  return '*'
}

function asToolInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return {}
}
