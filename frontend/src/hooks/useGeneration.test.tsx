import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGeneration } from './useGeneration'
import { cancelJob, generateAnimation, getJobStatus, modifyAnimation } from '../lib/api'

vi.mock('../lib/api', () => ({
  generateAnimation: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
  modifyAnimation: vi.fn(),
}))

vi.mock('../lib/settings', () => ({
  loadSettings: () => ({
    video: { timeout: 1200 },
    api: {},
  }),
}))

vi.mock('../lib/ai-providers', () => ({
  getActiveProvider: () => null,
  providerToCustomApiConfig: () => null,
}))

vi.mock('./usePrompts', () => ({
  loadPrompts: () => undefined,
}))

const mockedGenerateAnimation = vi.mocked(generateAnimation)
const mockedGetJobStatus = vi.mocked(getJobStatus)
const mockedCancelJob = vi.mocked(cancelJob)
const mockedModifyAnimation = vi.mocked(modifyAnimation)

describe('useGeneration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockedGenerateAnimation.mockResolvedValue({
      success: true,
      jobId: 'job-1',
      message: 'ok',
      status: 'processing',
    })
    mockedModifyAnimation.mockResolvedValue({
      success: true,
      jobId: 'job-1',
      message: 'ok',
      status: 'processing',
    })
    mockedCancelJob.mockResolvedValue()
    mockedGetJobStatus.mockResolvedValue({
      jobId: 'job-1',
      status: 'processing',
      stage: 'analyzing',
      message: 'running',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not cancel the job when polling hits a non-network error', async () => {
    mockedGetJobStatus.mockRejectedValueOnce(new Error('Unexpected JSON parse failure'))

    const { result } = renderHook(() => useGeneration())

    await act(async () => {
      await result.current.generate({ concept: 'test', outputMode: 'video' })
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })
    expect(result.current.error).toBe('Unexpected JSON parse failure')
    expect(mockedCancelJob).not.toHaveBeenCalled()
  })
})
