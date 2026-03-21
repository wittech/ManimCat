import fs from 'node:fs'

export const DEFAULT_STUDIO_WORKSPACE_DIRNAME = '.'

export function getDefaultStudioWorkspacePath(): string {
  return process.cwd()
}

export function ensureDefaultStudioWorkspaceExists(): string {
  const directory = getDefaultStudioWorkspacePath()
  fs.mkdirSync(directory, { recursive: true })
  return directory
}
