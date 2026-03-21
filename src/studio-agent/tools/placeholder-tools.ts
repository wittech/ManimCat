import type { StudioToolDefinition } from '../domain/types'
import { createStudioAiReviewTool } from './ai-review-tool'
import { createStudioApplyPatchTool } from './apply-patch-tool'
import { createStudioEditTool } from './edit-tool'
import { createStudioGlobTool } from './glob-tool'
import { createStudioGrepTool } from './grep-tool'
import { createStudioLsTool } from './ls-tool'
import { createStudioQuestionTool } from './question-tool'
import { createStudioReadTool } from './read-tool'
import { createStudioRenderTool } from './render-tool'
import { createStudioSkillTool } from './skill-tool'
import { createStudioStaticCheckTool } from './static-check-tool'
import { createStudioTaskTool } from './task-tool'
import { createStudioWriteTool } from './write-tool'

export function createPlaceholderStudioTools(): StudioToolDefinition[] {
  return [
    createStudioReadTool() as StudioToolDefinition,
    createStudioGlobTool() as StudioToolDefinition,
    createStudioGrepTool() as StudioToolDefinition,
    createStudioLsTool() as StudioToolDefinition,
    createStudioWriteTool() as StudioToolDefinition,
    createStudioEditTool() as StudioToolDefinition,
    createStudioApplyPatchTool() as StudioToolDefinition,
    createStudioQuestionTool() as StudioToolDefinition,
    createStudioTaskTool() as StudioToolDefinition,
    createStudioSkillTool() as StudioToolDefinition,
    createStudioStaticCheckTool() as StudioToolDefinition,
    createStudioAiReviewTool() as StudioToolDefinition,
    createStudioRenderTool() as StudioToolDefinition
  ]
}
