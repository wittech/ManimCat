import type { StudioAgentType } from '../domain/types'
import type { StudioResolvedSkill } from '../runtime/tool-runtime-context'
import { getStudioAgentSystemPrompt } from './agent-prompt-loader'

interface BuildStudioSubagentPromptInput {
  agentType: Extract<StudioAgentType, 'reviewer' | 'designer'>
  workflowInput: string
  files?: string[]
  skill?: StudioResolvedSkill
  requestedSkillName?: string
}

const WORKFLOW_INPUT_PATTERN = /<workflow_input>\s*([\s\S]*?)\s*<\/workflow_input>/i

export function buildStudioSubagentPrompt(input: BuildStudioSubagentPromptInput): string {
  const sections = [
    `<agent_prompt role="${input.agentType}">`,
    getStudioAgentSystemPrompt(input.agentType),
    '</agent_prompt>',
    '',
    '<workflow_input>',
    input.workflowInput.trim(),
    '</workflow_input>'
  ]

  if (input.files?.length) {
    sections.push(
      '',
      '<relevant_files>',
      ...input.files.map((file) => `<file>${file}</file>`),
      '</relevant_files>'
    )
  }

  if (input.skill) {
    sections.push(
      '',
      `<skill_augment name="${input.skill.name}">`,
      input.skill.content.trim(),
      '',
      `Base directory: ${input.skill.directory}`,
      `Preferred agent: ${input.skill.preferredAgent ?? input.agentType}`,
      '</skill_augment>'
    )
  } else if (input.requestedSkillName) {
    sections.push(
      '',
      `<skill_request name="${input.requestedSkillName}">`,
      `Load the local Studio skill "${input.requestedSkillName}" if it is relevant to this workflow.`,
      '</skill_request>'
    )
  }

  return sections.join('\n').trim()
}

export function extractStudioWorkflowInput(inputText: string): string {
  const match = inputText.match(WORKFLOW_INPUT_PATTERN)
  if (!match) {
    return inputText.trim()
  }

  return match[1].trim()
}
