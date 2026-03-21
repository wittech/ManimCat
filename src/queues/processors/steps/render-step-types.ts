import type { OutputMode } from '../../../types'

export interface RenderResult {
  jobId: string
  concept: string
  outputMode: OutputMode
  manimCode: string
  usedAI: boolean
  generationType: string
  quality: string
  videoUrl?: string
  imageUrls?: string[]
  imageCount?: number
  workspaceVideoPath?: string
  workspaceImagePaths?: string[]
  renderPeakMemoryMB?: number
}
