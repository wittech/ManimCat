import { createStudioWorkResult } from '../domain/factories'
import type {
  StudioFileAttachment,
  StudioTask,
  StudioWork,
  StudioWorkResult,
  StudioWorkResultStore,
  StudioWorkStore
} from '../domain/types'
import type { JobResult } from '../../types'

export interface StudioRenderWorkSyncStores {
  workStore: StudioWorkStore
  workResultStore: StudioWorkResultStore
}

export async function syncRenderWorkFromTask(
  stores: StudioRenderWorkSyncStores,
  task: StudioTask
): Promise<{ work: StudioWork; result?: StudioWorkResult } | null> {
  if (!task.workId) {
    return null
  }

  const work = await stores.workStore.getById(task.workId)
  if (!work) {
    return null
  }

  const nextStatus = toWorkStatus(task.status)
  const nextMetadata = {
    ...(work.metadata ?? {}),
    ...(task.metadata ?? {})
  }

  const renderResult = getRenderResult(task)
  if (!renderResult) {
    const updatedWork = await stores.workStore.update(work.id, {
      latestTaskId: task.id,
      status: nextStatus,
      metadata: nextMetadata
    })
    return updatedWork ? { work: updatedWork } : { work }
  }

  const nextWorkResult = buildRenderWorkResult(work.id, task, renderResult)
  const persistedResult = work.currentResultId
    ? await stores.workResultStore.update(work.currentResultId, nextWorkResult)
    : await stores.workResultStore.create(createStudioWorkResult(nextWorkResult))

  const updatedWork = await stores.workStore.update(work.id, {
    latestTaskId: task.id,
    currentResultId: persistedResult?.id ?? work.currentResultId,
    status: nextStatus,
    metadata: nextMetadata
  })

  return {
    work: updatedWork ?? work,
    result: persistedResult ?? undefined
  }
}

function getRenderResult(task: StudioTask): JobResult | null {
  const candidate = task.metadata?.result
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const status = (candidate as { status?: unknown }).status
  if (status !== 'completed' && status !== 'failed') {
    return null
  }

  return candidate as JobResult
}

function buildRenderWorkResult(
  workId: string,
  task: StudioTask,
  result: JobResult
): Omit<StudioWorkResult, 'id' | 'createdAt'> {
  if (result.status === 'completed') {
    const outputMode = result.data.outputMode
    const attachments = buildCompletedAttachments(result)
    const summary = outputMode === 'video'
      ? `Render completed${result.data.videoUrl ? `: ${result.data.videoUrl}` : ''}`
      : `Render completed with ${result.data.imageCount ?? result.data.imageUrls?.length ?? 0} image output(s)`

    return {
      workId,
      kind: 'render-output',
      summary,
      attachments,
      metadata: {
        taskId: task.id,
        jobId: task.metadata?.jobId,
        outputMode,
        quality: result.data.quality,
        generationType: result.data.generationType,
        usedAI: result.data.usedAI,
        renderPeakMemoryMB: result.data.renderPeakMemoryMB,
        timings: result.data.timings,
        manimCode: result.data.manimCode,
        imageCount: result.data.imageCount
      }
    }
  }

  return {
    workId,
    kind: 'failure-report',
    summary: result.data.error,
    metadata: {
      taskId: task.id,
      jobId: task.metadata?.jobId,
      outputMode: result.data.outputMode,
      error: result.data.error,
      details: result.data.details,
      cancelReason: result.data.cancelReason,
      stage: task.metadata?.stage,
      bullStatus: task.metadata?.bullStatus
    }
  }
}

function buildCompletedAttachments(result: Extract<JobResult, { status: 'completed' }>): StudioFileAttachment[] | undefined {
  const attachments: StudioFileAttachment[] = []

  if (result.data.videoUrl) {
    attachments.push({
      kind: 'file',
      path: result.data.videoUrl,
      name: fileNameFromPath(result.data.videoUrl),
      mimeType: 'video/mp4'
    })
  }

  for (const imageUrl of result.data.imageUrls ?? []) {
    attachments.push({
      kind: 'file',
      path: imageUrl,
      name: fileNameFromPath(imageUrl),
      mimeType: 'image/png'
    })
  }

  return attachments.length > 0 ? attachments : undefined
}

function toWorkStatus(taskStatus: StudioTask['status']): StudioWork['status'] {
  switch (taskStatus) {
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'running'
  }
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
