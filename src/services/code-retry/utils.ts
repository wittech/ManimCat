import type { CodePatch, CodePatchSet } from './types'

function extractJsonObject(text: string): string {
  const normalized = text.trim()
  if (/^\s*<!DOCTYPE\s+html/i.test(normalized) || /^\s*<html/i.test(normalized)) {
    throw new Error('Code retry patch response was HTML, not JSON')
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1)
  }

  return text.trim()
}

function normalizePatch(candidate: unknown): CodePatch {
  const parsed = candidate as {
    original_snippet?: unknown
    replacement_snippet?: unknown
  }

  const originalSnippet = typeof parsed.original_snippet === 'string' ? parsed.original_snippet : ''
  const replacementSnippet = typeof parsed.replacement_snippet === 'string' ? parsed.replacement_snippet : ''

  if (!originalSnippet) {
    throw new Error('Code retry patch response missing original_snippet')
  }

  if (originalSnippet === replacementSnippet) {
    throw new Error('Code retry patch produced no change')
  }

  return { originalSnippet, replacementSnippet }
}

export function parsePatchResponse(text: string): CodePatchSet {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch (error) {
    throw new Error(`Failed to parse code retry patch JSON: ${String(error)}`)
  }

  const patchCandidates = Array.isArray((parsed as { patches?: unknown })?.patches)
    ? (parsed as { patches: unknown[] }).patches
    : [parsed]
  const patches = patchCandidates.map((item) => normalizePatch(item))
  if (patches.length === 0) {
    throw new Error('Code retry patch response missing patches')
  }

  return { patches }
}

function getLineNumberAtIndex(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

export function extractTargetLine(errorMessage: string): number | undefined {
  const match = errorMessage.match(/line\s+(\d+)/i) || errorMessage.match(/:(\d+)(?::\d+)?/)
  if (!match) {
    return undefined
  }

  const line = Number.parseInt(match[1], 10)
  return Number.isFinite(line) && line > 0 ? line : undefined
}

export function applyPatchToCode(code: string, patch: CodePatch, targetLine?: number): string {
  const matches: number[] = []
  let searchIndex = 0

  while (true) {
    const foundAt = code.indexOf(patch.originalSnippet, searchIndex)
    if (foundAt < 0) {
      break
    }
    matches.push(foundAt)
    searchIndex = foundAt + Math.max(1, patch.originalSnippet.length)
  }

  if (matches.length === 0) {
    throw new Error('Code retry patch original_snippet not found in code')
  }

  const bestIndex =
    typeof targetLine === 'number'
      ? matches.reduce((best, current) => {
          const bestDistance = Math.abs(getLineNumberAtIndex(code, best) - targetLine)
          const currentDistance = Math.abs(getLineNumberAtIndex(code, current) - targetLine)
          return currentDistance < bestDistance ? current : best
        })
      : matches[0]

  return `${code.slice(0, bestIndex)}${patch.replacementSnippet}${code.slice(bestIndex + patch.originalSnippet.length)}`
}

export function applyPatchSetToCode(code: string, patchSet: CodePatchSet, targetLine?: number): string {
  return patchSet.patches.reduce((currentCode, patch, index) => {
    const lineHint = index === 0 ? targetLine : undefined
    return applyPatchToCode(currentCode, patch, lineHint)
  }, code)
}

export function getErrorType(stderr: string): string {
  if (!stderr) return 'Unknown'

  const errorPatterns = [
    { name: 'NameError', pattern: /NameError/i },
    { name: 'SyntaxError', pattern: /SyntaxError/i },
    { name: 'AttributeError', pattern: /AttributeError/i },
    { name: 'ImportError', pattern: /ImportError/i },
    { name: 'TypeError', pattern: /TypeError/i },
    { name: 'ValueError', pattern: /ValueError/i },
    { name: 'RuntimeError', pattern: /RuntimeError/i },
    { name: 'IndentationError', pattern: /IndentationError/i }
  ]

  for (const { name, pattern } of errorPatterns) {
    if (pattern.test(stderr)) {
      return name
    }
  }

  return 'Unknown'
}

export function extractErrorMessage(stderr: string): string {
  if (!stderr) return 'Unknown error'

  const lines = stderr.trim().split('\n')
  const lastLine = lines[lines.length - 1]?.trim()

  return lastLine || stderr.slice(0, 500)
}
