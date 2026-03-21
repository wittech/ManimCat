import { createLogger } from '../../utils/logger'
import { createStudioToolPart } from '../domain/factories'
import type {
  StudioAssistantMessage,
  StudioMessageStore,
  StudioPartStore,
  StudioProcessorStreamEvent,
  StudioRun,
  StudioSession,
  StudioToolPart,
  StudioToolResult
} from '../domain/types'
import { isDoomLoop } from './doom-loop'
import { StudioPartSynchronizer } from './part-synchronizer'
import { StudioTextStreamAccumulator } from './text-stream-accumulator'
import {
  getToolInput,
  getToolTimeStart,
  mergeToolMetadata,
  mergeToolStateMetadata
} from './tool-state'

const logger = createLogger('StudioRunProcessor')

export type StudioProcessorOutcome = 'continue' | 'stop' | 'compact'

interface StudioRunProcessorOptions {
  messageStore: StudioMessageStore
  partStore: StudioPartStore
}

export class StudioRunProcessor {
  private readonly partStore: StudioPartStore
  private readonly sync: StudioPartSynchronizer
  private readonly textStream: StudioTextStreamAccumulator

  constructor(options: StudioRunProcessorOptions) {
    this.partStore = options.partStore
    this.sync = new StudioPartSynchronizer(options.messageStore, options.partStore)
    this.textStream = new StudioTextStreamAccumulator(options.partStore, this.sync)
  }

  async processStream(input: {
    session: StudioSession
    run: StudioRun
    assistantMessage: StudioAssistantMessage
    events: AsyncIterable<StudioProcessorStreamEvent>
    shouldCompact?: (usage?: { tokens?: number }, assistantMessage?: StudioAssistantMessage) => Promise<boolean>
    onDoomLoop?: (toolName: string, toolInput: Record<string, unknown>) => Promise<boolean>
  }): Promise<StudioProcessorOutcome> {
    const toolCalls = new Map<string, StudioToolPart>()
    let activeTextPartId: string | null = null
    let activeReasoningPartId: string | null = null
    let blocked = false
    let needsCompaction = false

    for await (const event of input.events) {
      switch (event.type) {
        case 'tool-input-start': {
          const part = createStudioToolPart({
            messageId: input.assistantMessage.id,
            sessionId: input.assistantMessage.sessionId,
            tool: event.toolName,
            callId: event.id,
            raw: event.raw
          })
          await this.sync.appendPart(input.assistantMessage, part)
          toolCalls.set(event.id, part)
          break
        }

        case 'tool-call': {
          const match = toolCalls.get(event.toolCallId)
          if (!match) {
            break
          }

          const allowed = await this.allowToolCall({
            assistantMessage: input.assistantMessage,
            toolName: event.toolName,
            toolInput: event.input,
            onDoomLoop: input.onDoomLoop
          })

          if (!allowed) {
            blocked = true
            await this.updateToolState(match.id, {
              status: 'error',
              input: event.input,
              error: `Doom loop rejected for tool "${event.toolName}"`,
              time: { start: Date.now(), end: Date.now() }
            })
            toolCalls.delete(event.toolCallId)
            break
          }

          await this.updateToolState(match.id, {
            status: 'running',
            input: event.input,
            title: undefined,
            metadata: undefined,
            time: { start: Date.now() }
          })
          break
        }

        case 'tool-result': {
          await this.completeToolCall(toolCalls, event)
          break
        }

        case 'tool-error': {
          blocked = await this.failToolCall(toolCalls, event)
          break
        }

        case 'text-start': {
          activeTextPartId = await this.textStream.startPart(input.assistantMessage, 'text')
          break
        }

        case 'text-delta': {
          await this.textStream.appendDelta(activeTextPartId, event.text, 'text')
          break
        }

        case 'text-end': {
          activeTextPartId = null
          break
        }

        case 'reasoning-start': {
          activeReasoningPartId = await this.textStream.startPart(input.assistantMessage, 'reasoning')
          break
        }

        case 'reasoning-delta': {
          await this.textStream.appendDelta(activeReasoningPartId, event.text, 'reasoning')
          break
        }

        case 'reasoning-end': {
          activeReasoningPartId = null
          break
        }

        case 'finish-step': {
          if (!input.assistantMessage.summary && input.shouldCompact) {
            needsCompaction = await input.shouldCompact(event.usage, input.assistantMessage)
          }
          break
        }
      }
    }

    if (blocked) {
      return 'stop'
    }
    if (needsCompaction) {
      return 'compact'
    }
    return 'continue'
  }

  async applyToolMetadata(input: {
    assistantMessage: StudioAssistantMessage
    callId: string
    title?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const part = await this.findToolPart(input.assistantMessage, input.callId)
    if (!part) {
      return
    }

    await this.sync.updatePart(part.id, {
      ...part,
      metadata: {
        ...(part.metadata ?? {}),
        ...(input.metadata ?? {})
      },
      state: mergeToolStateMetadata(part.state, input.title, input.metadata)
    })
  }

  async materializeToolResult(input: {
    session: StudioSession
    run: StudioRun
    assistantMessage: StudioAssistantMessage
    callId: string
    toolName: string
    toolInput: Record<string, unknown>
    result: StudioToolResult
  }): Promise<void> {
    const part = createStudioToolPart({
      messageId: input.assistantMessage.id,
      sessionId: input.assistantMessage.sessionId,
      tool: input.toolName,
      callId: input.callId
    })
    const created = await this.sync.appendPart(input.assistantMessage, part)

    await this.updateToolState(created.id, {
      status: 'completed',
      input: input.toolInput,
      output: input.result.output,
      title: input.result.title,
      metadata: input.result.metadata,
      attachments: input.result.attachments,
      time: { start: Date.now(), end: Date.now() }
    })

    logger.info('Materialized direct tool result into assistant message', {
      sessionId: input.session.id,
      runId: input.run.id,
      toolName: input.toolName,
      callId: input.callId
    })
  }

  private async allowToolCall(input: {
    assistantMessage: StudioAssistantMessage
    toolName: string
    toolInput: Record<string, unknown>
    onDoomLoop?: (toolName: string, toolInput: Record<string, unknown>) => Promise<boolean>
  }): Promise<boolean> {
    if (!input.onDoomLoop) {
      return true
    }

    const doomLoop = await isDoomLoop({
      assistantMessage: input.assistantMessage,
      partStore: this.partStore,
      toolName: input.toolName,
      toolInput: input.toolInput
    })

    return doomLoop ? input.onDoomLoop(input.toolName, input.toolInput) : true
  }

  private async completeToolCall(
    toolCalls: Map<string, StudioToolPart>,
    event: Extract<StudioProcessorStreamEvent, { type: 'tool-result' }>
  ): Promise<void> {
    const match = toolCalls.get(event.toolCallId)
    if (!match) {
      return
    }

    const runningState = await this.partStore.getById(match.id)
    await this.updateToolState(match.id, {
      status: 'completed',
      input: getToolInput(runningState),
      output: event.output,
      title: event.title ?? `Completed ${match.tool}`,
      metadata: mergeToolMetadata(runningState, event.metadata),
      attachments: event.attachments,
      time: {
        start: getToolTimeStart(runningState),
        end: Date.now()
      }
    })
    toolCalls.delete(event.toolCallId)
  }

  private async failToolCall(
    toolCalls: Map<string, StudioToolPart>,
    event: Extract<StudioProcessorStreamEvent, { type: 'tool-error' }>
  ): Promise<boolean> {
    const match = toolCalls.get(event.toolCallId)
    if (!match) {
      return false
    }

    const runningState = await this.partStore.getById(match.id)
    await this.updateToolState(match.id, {
      status: 'error',
      input: getToolInput(runningState),
      error: event.error,
      metadata: mergeToolMetadata(runningState, event.metadata),
      time: {
        start: getToolTimeStart(runningState),
        end: Date.now()
      }
    })
    toolCalls.delete(event.toolCallId)
    return true
  }

  private async findToolPart(
    assistantMessage: StudioAssistantMessage,
    callId: string
  ): Promise<StudioToolPart | null> {
    const parts = await this.partStore.listByMessageId(assistantMessage.id)
    const part = [...parts]
      .reverse()
      .find((candidate) => candidate.type === 'tool' && candidate.callId === callId)

    return part?.type === 'tool' ? part : null
  }

  private async updateToolState(partId: string, state: StudioToolPart['state']): Promise<void> {
    const current = await this.partStore.getById(partId)
    if (!current || current.type !== 'tool') {
      return
    }

    await this.sync.updatePart(partId, {
      ...current,
      state,
      metadata: mergeToolMetadata(current, 'metadata' in state ? state.metadata : undefined)
    })
  }
}
