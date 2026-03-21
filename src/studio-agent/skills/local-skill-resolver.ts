import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { StudioSession } from '../domain/types'
import type { StudioResolvedSkill } from '../runtime/tool-runtime-context'

const DEFAULT_MAX_FILES = 10

export function createLocalStudioSkillResolver(options?: { maxFiles?: number }) {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES

  return async function resolveSkill(name: string, session: StudioSession): Promise<StudioResolvedSkill> {
    const skillsRoot = path.join(session.directory, '.manimcat', 'skills')
    const directories = await collectSkillDirectories(skillsRoot)

    for (const directory of directories) {
      const directMatch = path.basename(directory).toLowerCase() === name.toLowerCase()
      const manifest = await readManifest(directory)
      const manifestName = typeof manifest?.name === 'string' ? manifest.name : undefined
      if (!directMatch && manifestName?.toLowerCase() !== name.toLowerCase()) {
        continue
      }

      const entryFile = typeof manifest?.entry === 'string' ? manifest.entry : 'SKILL.md'
      const entryPath = path.join(directory, entryFile)
      await assertExists(entryPath)
      const content = await readFile(entryPath, 'utf8')
      const files = await sampleFiles(directory, maxFiles)
      const description =
        (typeof manifest?.description === 'string' && manifest.description) ||
        inferDescriptionFromSkill(content) ||
        `Local Studio skill ${name}`

      return {
        name: manifestName ?? path.basename(directory),
        description,
        directory,
        entryFile: entryPath,
        content,
        manifestPath: manifest ? path.join(directory, 'skill.json') : undefined,
        manifest: manifest ?? undefined,
        preferredAgent: asAgentType(manifest?.preferredAgent),
        allowedTools: Array.isArray(manifest?.allowedTools)
          ? manifest.allowedTools.filter((item): item is string => typeof item === 'string')
          : undefined,
        files
      }
    }

    throw new Error(`Skill not found: ${name}`)
  }
}

async function collectSkillDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const directories = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const fullPath = path.join(root, entry.name)
          const childDirectories = await collectSkillDirectories(fullPath)
          const skillPath = path.join(fullPath, 'SKILL.md')
          try {
            await assertExists(skillPath)
            return [fullPath, ...childDirectories]
          } catch {
            return childDirectories
          }
        })
    )

    return directories.flat()
  } catch {
    return []
  }
}

async function readManifest(directory: string): Promise<Record<string, unknown> | null> {
  const manifestPath = path.join(directory, 'skill.json')
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

async function sampleFiles(root: string, maxFiles: number): Promise<string[]> {
  const results: string[] = []
  await walkFiles(root, results, maxFiles)
  return results
}

async function walkFiles(directory: string, results: string[], maxFiles: number): Promise<void> {
  if (results.length >= maxFiles) {
    return
  }

  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (results.length >= maxFiles) {
      return
    }

    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(fullPath, results, maxFiles)
      continue
    }

    results.push(fullPath)
  }
}

async function assertExists(targetPath: string): Promise<void> {
  await access(targetPath)
}

function inferDescriptionFromSkill(content: string): string | undefined {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('#')) {
      continue
    }
    return line.slice(0, 160)
  }

  return undefined
}

function asAgentType(value: unknown): StudioResolvedSkill['preferredAgent'] | undefined {
  return value === 'builder' || value === 'reviewer' || value === 'designer' ? value : undefined
}
