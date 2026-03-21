import { createStudioAssistantMessage, createStudioRun } from '../domain/factories'
import type {
  StudioMessagePart,
  StudioRun,
  StudioRuntimeTurnPlan,
  StudioSession
} from '../domain/types'
import { buildStudioSubagentPrompt } from '../prompts/subagent-prompt'
import type { StudioResolvedSkill } from './tool-runtime-context'

export function buildDraftRun(session: StudioSession, inputText: string): StudioRun {
  return createStudioRun({
    sessionId: session.id,
    inputText,
    activeAgent: session.agentType
  })
}

export function buildDraftAssistantMessage(session: StudioSession) {
  return createStudioAssistantMessage({
    sessionId: session.id,
    agent: session.agentType
  })
}

export function buildSubagentPrompt(input: {
  agentType: 'reviewer' | 'designer'
  inputText: string
  files?: string[]
  skillName?: string
  skill?: StudioResolvedSkill
}): string {
  return buildStudioSubagentPrompt({
    agentType: input.agentType,
    workflowInput: input.inputText,
    files: input.files,
    skill: input.skill,
    requestedSkillName: input.skillName
  })
}

export function finalizeRunState(input: {
  run: StudioRun
  outcome: 'continue' | 'stop' | 'compact'
}): StudioRun {
  return {
    ...input.run,
    status: input.outcome === 'stop' ? 'failed' : 'completed',
    completedAt: new Date().toISOString(),
    error: input.outcome === 'stop' ? 'Run stopped after tool failure or rejection' : undefined
  }
}

export function failRunState(run: StudioRun, error: string): StudioRun {
  return {
    ...run,
    status: 'failed',
    completedAt: new Date().toISOString(),
    error
  }
}

export function extractLatestAssistantText(parts: StudioMessagePart[]): string {
  const textPart = [...parts].reverse().find((part) => part.type === 'text')
  return textPart?.type === 'text' ? textPart.text : ''
}

export function withResolvedPlan<T extends { plan: StudioRuntimeTurnPlan }>(input: T): T {
  return input
}

