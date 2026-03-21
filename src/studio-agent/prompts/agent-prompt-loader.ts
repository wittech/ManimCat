import fs from 'node:fs'
import path from 'node:path'
import type { StudioAgentType } from '../domain/types'

const TEMPLATE_ROOT = path.join(process.cwd(), 'src', 'studio-agent', 'prompts', 'templates')
const templateCache = new Map<string, string>()

function readTemplate(filePath: string): string {
  const cached = templateCache.get(filePath)
  if (cached) {
    return cached
  }

  const content = fs.readFileSync(filePath, 'utf8')
  templateCache.set(filePath, content)
  return content
}

export function clearStudioAgentPromptCache(): void {
  templateCache.clear()
}

export function getStudioAgentSystemPrompt(agentType: StudioAgentType): string {
  const filePath = path.join(TEMPLATE_ROOT, 'roles', `${agentType}.system.md`)
  return readTemplate(filePath).trim()
}
