import type { StudioToolChoice } from '../domain/types'

export type StudioAgentLoopAction =
  | { type: 'continue' }
  | { type: 'finish' }
  | { type: 'abort'; message: string }

interface DetermineStudioAgentLoopActionInput {
  finishReason?: string | null
  toolCallCount: number
  step: number
  maxSteps: number
}

export function determineStudioAgentLoopAction(
  input: DetermineStudioAgentLoopActionInput
): StudioAgentLoopAction {
  if (input.toolCallCount > 0) {
    if (input.step + 1 >= input.maxSteps) {
      return {
        type: 'abort',
        message: `Stopped after reaching the Studio agent step limit (${input.maxSteps}).`
      }
    }

    return { type: 'continue' }
  }

  if (input.finishReason === 'length') {
    return {
      type: 'abort',
      message: 'Studio agent response hit the model output limit before finishing.'
    }
  }

  if (input.finishReason === 'content_filter') {
    return {
      type: 'abort',
      message: 'Studio agent response was blocked by the provider content filter.'
    }
  }

  return { type: 'finish' }
}


