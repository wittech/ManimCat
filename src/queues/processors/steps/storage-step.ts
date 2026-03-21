/**
 * 结果存储步骤
 * 存储任务结果到 Redis，并写入持久化历史记录
 */

import { storeJobResult } from '../../../services/job-store'
import { ensureJobNotCancelled } from '../../../services/job-cancel'
import { createHistory } from '../../../database'
import type { RenderResult } from './render-step-types'
import { createLogger } from '../../../utils/logger'
import { normalizeTimings } from '../../../utils/timings'

const logger = createLogger('StorageStep')

/**
 * 存储结果
 */
export async function storeResult(
  renderResult: RenderResult,
  timings: Record<string, number>,
  clientId?: string
): Promise<void> {
  const {
    jobId,
    concept,
    outputMode,
    manimCode,
    usedAI,
    generationType,
    quality,
    videoUrl,
    imageUrls,
    imageCount,
    workspaceVideoPath,
    workspaceImagePaths,
    renderPeakMemoryMB
  } = renderResult

  // 存储到 Redis（用于 API 查询）
  const normalizedTimings = normalizeTimings(timings)
  await ensureJobNotCancelled(jobId)

  await storeJobResult(jobId, {
    status: 'completed',
    data: {
      outputMode,
      videoUrl,
      imageUrls,
      imageCount,
      workspaceVideoPath,
      workspaceImagePaths,
      manimCode,
      usedAI,
      quality: quality as any,
      generationType: generationType as any,
      renderPeakMemoryMB,
      timings: normalizedTimings
    }
  })
  logger.info('Result stored', { jobId, outputMode, videoUrl, imageCount })

  // 写入持久化历史记录（静默失败，不影响主流程）
  if (clientId) {
    try {
      await createHistory({
        client_id: clientId,
        prompt: concept,
        code: manimCode || null,
        output_mode: outputMode as 'video' | 'image',
        quality: quality as 'low' | 'medium' | 'high',
        status: 'completed'
      })
    } catch (err) {
      logger.warn('Failed to write history record', { jobId, error: err })
    }
  }
}
