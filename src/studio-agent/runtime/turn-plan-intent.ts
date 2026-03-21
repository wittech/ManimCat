import { randomUUID } from 'node:crypto'
import { extractStudioWorkflowInput } from '../prompts/subagent-prompt'

export interface StudioParsedTaskIntent {
  subagentType: 'reviewer' | 'designer'
  description: string
  input: string
  skillName?: string
  files?: string[]
}

export interface StudioParsedDirectToolIntent {
  toolName: 'read' | 'glob' | 'grep' | 'ls' | 'skill' | 'task'
  input: Record<string, unknown>
}

export interface StudioParsedTurnIntent {
  skillName?: string
  task?: StudioParsedTaskIntent
  directTool?: StudioParsedDirectToolIntent
  requestedToolNames: string[]
  explicitCommand: boolean
  cleanedInput: string
}

const SLASH_COMMAND_PATTERN = /^\/(skill|task|review|design|read|glob|grep|ls)\b.*$/gim
const FILE_REFERENCE_PATTERN = /@([^\s,;]+?\.[A-Za-z0-9_]+)/g
const SKILL_PATTERN = /(?:^\/skill\s+|(?:use|load)\s+skill\s+|技能\s*[:：]\s*|skill\s*[:：]\s*)([A-Za-z0-9._-]+)/im

export function parseStudioTurnIntent(inputText: string): StudioParsedTurnIntent {
  const normalized = extractStudioWorkflowInput(inputText)
  const requestedToolNames = collectRequestedTools(normalized)
  const skillName = extractSkillName(normalized)
  const cleanedInput = stripCommandLines(normalized) || normalized
  const task = parseTaskIntent({
    originalInput: normalized,
    cleanedInput,
    skillName
  })
  const directTool = task ? undefined : parseDirectToolIntent(normalized, cleanedInput, skillName)

  return {
    skillName,
    task,
    directTool,
    requestedToolNames,
    explicitCommand: /^\//m.test(normalized),
    cleanedInput
  }
}

export function createPlannedCallId(toolName: string): string {
  return `${toolName}_${randomUUID()}`
}

function parseTaskIntent(input: {
  originalInput: string
  cleanedInput: string
  skillName?: string
}): StudioParsedTaskIntent | undefined {
  const explicit = parseExplicitTask(input.originalInput, input.cleanedInput, input.skillName)
  if (explicit) {
    return explicit
  }

  if (looksLikeReviewerTask(input.cleanedInput)) {
    return {
      subagentType: 'reviewer',
      description: buildDefaultTaskDescription('reviewer', input.cleanedInput),
      input: input.cleanedInput,
      skillName: input.skillName,
      files: extractFileReferences(input.cleanedInput)
    }
  }

  if (looksLikeDesignerTask(input.cleanedInput)) {
    return {
      subagentType: 'designer',
      description: buildDefaultTaskDescription('designer', input.cleanedInput),
      input: input.cleanedInput,
      skillName: input.skillName,
      files: extractFileReferences(input.cleanedInput)
    }
  }

  return undefined
}

function parseDirectToolIntent(
  originalInput: string,
  cleanedInput: string,
  skillName?: string
): StudioParsedDirectToolIntent | undefined {
  const readMatch = originalInput.match(/^\/read\s+(.+)$/im)
  if (readMatch) {
    return {
      toolName: 'read',
      input: { path: stripWrappingQuotes(readMatch[1].trim()) }
    }
  }

  const globMatch = originalInput.match(/^\/glob\s+(.+)$/im)
  if (globMatch) {
    return {
      toolName: 'glob',
      input: { pattern: stripWrappingQuotes(globMatch[1].trim()) }
    }
  }

  const grepMatch = originalInput.match(/^\/grep\s+(.+)$/im)
  if (grepMatch) {
    const [query, scope] = splitDescriptionAndBody(grepMatch[1].trim())
    return {
      toolName: 'grep',
      input: {
        query: stripWrappingQuotes(query),
        path: scope ? stripWrappingQuotes(scope) : '.'
      }
    }
  }

  const lsMatch = originalInput.match(/^\/ls(?:\s+(.+))?$/im)
  if (lsMatch) {
    return {
      toolName: 'ls',
      input: { path: stripWrappingQuotes(lsMatch[1]?.trim() || '.') }
    }
  }

  if (skillName) {
    return {
      toolName: 'skill',
      input: { name: skillName }
    }
  }

  const fileReferences = extractFileReferences(cleanedInput)
  if (fileReferences?.length === 1 && /\b(read|读取|看看|打开)\b/i.test(cleanedInput)) {
    return {
      toolName: 'read',
      input: { path: fileReferences[0] }
    }
  }

  if (/\b(ls|list)\b/i.test(cleanedInput) || cleanedInput.includes('列出')) {
    return {
      toolName: 'ls',
      input: { path: '.' }
    }
  }

  return undefined
}

function parseExplicitTask(
  originalInput: string,
  cleanedInput: string,
  skillName?: string
): StudioParsedTaskIntent | undefined {
  const taskMatch = originalInput.match(/^\/task\s+(reviewer|designer)\s+(.+)$/im)
  if (taskMatch) {
    const subagentType = taskMatch[1] as 'reviewer' | 'designer'
    const payload = taskMatch[2].trim()
    const [description, body] = splitDescriptionAndBody(payload)
    const taskInput = body || cleanedInput || description

    return {
      subagentType,
      description,
      input: taskInput,
      skillName,
      files: extractFileReferences(taskInput)
    }
  }

  const reviewMatch = originalInput.match(/^\/review\s+(.+)$/im)
  if (reviewMatch) {
    const payload = reviewMatch[1].trim()
    const [description, body] = splitDescriptionAndBody(payload)
    const taskInput = body || cleanedInput || description
    return {
      subagentType: 'reviewer',
      description,
      input: taskInput,
      skillName,
      files: extractFileReferences(taskInput)
    }
  }

  const designMatch = originalInput.match(/^\/design\s+(.+)$/im)
  if (designMatch) {
    const payload = designMatch[1].trim()
    const [description, body] = splitDescriptionAndBody(payload)
    const taskInput = body || cleanedInput || description
    return {
      subagentType: 'designer',
      description,
      input: taskInput,
      skillName,
      files: extractFileReferences(taskInput)
    }
  }

  return undefined
}

function splitDescriptionAndBody(value: string): [string, string] {
  const [description, ...rest] = value.split(/\s*::\s*/)
  return [description.trim(), rest.join(' :: ').trim()]
}

function extractSkillName(inputText: string): string | undefined {
  return inputText.match(SKILL_PATTERN)?.[1]
}

function stripCommandLines(inputText: string): string {
  return inputText.replace(SLASH_COMMAND_PATTERN, '').trim()
}

function collectRequestedTools(inputText: string): string[] {
  const tools = new Set<string>()
  const lower = inputText.toLowerCase()

  if (/\b(read|读取|打开|看看)\b/i.test(inputText)) tools.add('read')
  if (/\bglob\b/i.test(lower) || inputText.includes('通配')) tools.add('glob')
  if (/\b(grep|search|搜索)\b/i.test(lower)) tools.add('grep')
  if (/\b(ls|list)\b/i.test(lower) || inputText.includes('列出')) tools.add('ls')
  if (/\b(question|clarify)\b/i.test(lower) || inputText.includes('问我')) tools.add('question')
  if (/\b(static-check|lint|check)\b/i.test(lower) || inputText.includes('静态检查')) tools.add('static-check')
  if (/\b(render)\b/i.test(lower) || inputText.includes('渲染')) tools.add('render')
  if (/\b(skill)\b/i.test(lower) || inputText.includes('技能')) tools.add('skill')
  if (/\b(task|review|reviewer|design|designer)\b/i.test(lower) || inputText.includes('审查') || inputText.includes('设计')) {
    tools.add('task')
  }

  return [...tools]
}

function extractFileReferences(inputText: string): string[] | undefined {
  const matches = [...inputText.matchAll(FILE_REFERENCE_PATTERN)].map((match) => match[1])
  return matches.length ? [...new Set(matches)] : undefined
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function looksLikeReviewerTask(inputText: string): boolean {
  return /\b(review|reviewer|audit|critic)\b/i.test(inputText) || inputText.includes('审查') || inputText.includes('评审')
}

function looksLikeDesignerTask(inputText: string): boolean {
  return /\b(design|designer|storyboard|scene\s+plan)\b/i.test(inputText) || inputText.includes('设计') || inputText.includes('分镜')
}

function buildDefaultTaskDescription(
  subagentType: 'reviewer' | 'designer',
  inputText: string
): string {
  const summary = inputText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 72)

  return summary
    ? `${subagentType === 'reviewer' ? 'Review' : 'Design'}: ${summary}`
    : subagentType === 'reviewer'
      ? 'Review request'
      : 'Design request'
}
