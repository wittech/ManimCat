import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_MAX_OUTPUT_CHARS = 16000
const DEFAULT_MAX_WALK_FILES = 2000

export async function readWorkspaceFile(baseDirectory: string, targetPath: string): Promise<{ absolutePath: string; content: string }> {
  const absolutePath = resolveWorkspacePath(baseDirectory, targetPath)
  const content = await readFile(absolutePath, 'utf8')
  return {
    absolutePath,
    content
  }
}

export async function listWorkspaceDirectory(baseDirectory: string, targetPath?: string): Promise<{ absolutePath: string; entries: string[] }> {
  const absolutePath = resolveWorkspacePath(baseDirectory, targetPath ?? '.')
  const entries = await readdir(absolutePath, { withFileTypes: true })

  return {
    absolutePath,
    entries: entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`)
  }
}

export async function walkWorkspaceFiles(baseDirectory: string, startPath = '.'): Promise<string[]> {
  const root = resolveWorkspacePath(baseDirectory, startPath)
  const results: string[] = []
  await walkDirectory(baseDirectory, root, results)
  return results
}

export function resolveWorkspacePath(baseDirectory: string, targetPath: string): string {
  const workspaceRoot = path.resolve(baseDirectory)
  const resolved = path.resolve(workspaceRoot, targetPath)
  const relative = path.relative(workspaceRoot, resolved)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${targetPath}`)
  }

  return resolved
}

export function toWorkspaceRelativePath(baseDirectory: string, absolutePath: string): string {
  const workspaceRoot = path.resolve(baseDirectory)
  const relative = path.relative(workspaceRoot, absolutePath)
  return relative || '.'
}

export function wildcardToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regexSource = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${regexSource}$`, 'i')
}

export function truncateToolText(value: string, maxChars = DEFAULT_MAX_OUTPUT_CHARS): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false }
  }

  return {
    text: `${value.slice(0, maxChars)}\n\n[truncated]`,
    truncated: true
  }
}

async function walkDirectory(baseDirectory: string, directory: string, results: string[]): Promise<void> {
  if (results.length >= DEFAULT_MAX_WALK_FILES) {
    return
  }

  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (results.length >= DEFAULT_MAX_WALK_FILES) {
      return
    }

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walkDirectory(baseDirectory, absolutePath, results)
      continue
    }

    results.push(toWorkspaceRelativePath(baseDirectory, absolutePath).replace(/\\/g, '/'))
  }
}
