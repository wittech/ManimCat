import OpenAI from 'openai'
import { createLogger } from '../../utils/logger'
import { cleanManimCode } from '../../utils/manim-code-cleaner'
import { getClient } from './client'
import { extractCodeFromResponse } from './utils'
import type { CodeRetryContext } from './types'
import { buildRetryPrompt, getCodeRetrySystemPrompt } from './prompt-builder'
import { dedupeSharedBlocksInMessages } from '../prompt-dedup'
import { createChatCompletionText } from '../openai-stream'

const logger = createLogger('CodeRetryCodeGen')

const AI_TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE || '0.7')
const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '1200', 10)

function getModel(customApiConfig?: unknown): string {
  const model = (customApiConfig as { model?: string } | undefined)?.model
  const trimmed = model?.trim() || ''
  if (!trimmed) {
    throw new Error('No model available')
  }
  return trimmed
}

export async function generateInitialCode(
  context: CodeRetryContext,
  customApiConfig?: unknown
): Promise<string> {
  const client = getClient(customApiConfig as any)
  if (!client) {
    throw new Error('No upstream AI is configured for this request')
  }

  try {
    const requestMessages = dedupeSharedBlocksInMessages(
      [
        { role: 'system', content: getCodeRetrySystemPrompt(context.promptOverrides) },
        { role: 'user', content: context.originalPrompt }
      ],
      context.promptOverrides
    )

    const { content, mode } = await createChatCompletionText(
      client,
      {
        model: getModel(customApiConfig),
        messages: requestMessages,
        temperature: AI_TEMPERATURE,
        max_tokens: MAX_TOKENS
      },
      { fallbackToNonStream: true, usageLabel: 'retry-initial' }
    )

    if (!content) {
      throw new Error('AI 返回空内容')
    }

    const code = extractCodeFromResponse(content, context.outputMode)
    const cleaned = cleanManimCode(code)

    logger.info('首次代码生成成功', {
      concept: context.concept,
      mode,
      codeLength: cleaned.code.length
    })

    return cleaned.code
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logger.error('OpenAI API 错误', {
        status: error.status,
        message: error.message
      })
    }
    throw error
  }
}

export async function retryCodeGeneration(
  context: CodeRetryContext,
  errorMessage: string,
  attempt: number,
  currentCode: string,
  customApiConfig?: unknown
): Promise<string> {
  const client = getClient(customApiConfig as any)
  if (!client) {
    throw new Error('No upstream AI is configured for this request')
  }

  const retryPrompt = buildRetryPrompt(context, errorMessage, attempt, currentCode)

  try {
    const requestMessages = dedupeSharedBlocksInMessages(
      [
        { role: 'system', content: getCodeRetrySystemPrompt(context.promptOverrides) },
        { role: 'user', content: retryPrompt }
      ],
      context.promptOverrides
    )

    const { content, mode } = await createChatCompletionText(
      client,
      {
        model: getModel(customApiConfig),
        messages: requestMessages,
        temperature: AI_TEMPERATURE,
        max_tokens: MAX_TOKENS
      },
      { fallbackToNonStream: true, usageLabel: `retry-${attempt}` }
    )

    if (!content) {
      throw new Error('AI 返回空内容')
    }

    const code = extractCodeFromResponse(content, context.outputMode)
    const cleaned = cleanManimCode(code)

    logger.info('代码重试生成成功', {
      concept: context.concept,
      attempt,
      mode,
      codeLength: cleaned.code.length
    })

    return cleaned.code
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logger.error('OpenAI API 错误（重试）', {
        attempt,
        status: error.status,
        message: error.message
      })
    }
    throw error
  }
}
