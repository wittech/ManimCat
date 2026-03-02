import OpenAI from 'openai'
import { createLogger } from '../utils/logger'

interface ChatCompletionTextOptions {
  fallbackToNonStream?: boolean
  allowPartialOnStreamError?: boolean
}

type ChatCompletionRequest = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParams, 'stream'>

export interface ChatCompletionTextResult {
  content: string
  mode: 'stream' | 'stream-partial' | 'non-stream'
  response?: OpenAI.Chat.Completions.ChatCompletion
}

const logger = createLogger('OpenAIStream')

interface MessageStats {
  messageCount: number
  textChars: number
  imageParts: number
}

function getMessageStats(messages: unknown): MessageStats {
  if (!Array.isArray(messages)) {
    return { messageCount: 0, textChars: 0, imageParts: 0 }
  }

  let textChars = 0
  let imageParts = 0

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue
    }

    const content = (message as { content?: unknown }).content
    if (typeof content === 'string') {
      textChars += content.length
      continue
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== 'object') {
          continue
        }
        const typedPart = part as { type?: unknown; text?: unknown }
        if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
          textChars += typedPart.text.length
        } else if (typedPart.type === 'image_url') {
          imageParts += 1
        }
      }
    }
  }

  return {
    messageCount: messages.length,
    textChars,
    imageParts
  }
}

function getErrorMeta(error: unknown): Record<string, unknown> {
  const meta: Record<string, unknown> = {}

  if (error instanceof OpenAI.APIError) {
    meta.errorName = error.name
    meta.status = error.status
    meta.code = error.code
    meta.type = error.type
    meta.errorMessage = error.message
    if (error.headers) {
      meta.cfRay =
        error.headers['cf-ray'] ||
        error.headers['CF-Ray'] ||
        error.headers['x-request-id'] ||
        error.headers['X-Request-ID']
    }
    return meta
  }

  if (error instanceof Error) {
    meta.errorName = error.name
    meta.errorMessage = error.message
    return meta
  }

  meta.errorMessage = String(error)
  return meta
}

export async function createChatCompletionText(
  client: OpenAI,
  request: ChatCompletionRequest,
  options: ChatCompletionTextOptions = {}
): Promise<ChatCompletionTextResult> {
  const startedAt = Date.now()
  const stats = getMessageStats((request as { messages?: unknown }).messages)
  const model = String((request as { model?: unknown }).model || '')
  // Policy: force pure streaming mode, never fallback to non-stream.
  const effectiveFallback = false
  const allowPartialOnStreamError = options.allowPartialOnStreamError ?? true

  logger.info('OpenAI chat request started', {
    model,
    requestType: 'chat.completions',
    stream: true,
    fallbackEnabled: effectiveFallback,
    ...stats,
    maxTokens: (request as { max_tokens?: unknown }).max_tokens
  })

  let receivedContent = false
  let chunkCount = 0
  let firstChunkAt: number | null = null
  let content = ''

  try {
    const stream = await client.chat.completions.create({
      ...request,
      stream: true
    })

    for await (const chunk of stream) {
      chunkCount += 1
      const delta = chunk.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        if (firstChunkAt === null) {
          firstChunkAt = Date.now()
        }
        content += delta
        receivedContent = true
      }
    }

    logger.info('OpenAI chat stream completed', {
      model,
      mode: 'stream',
      elapsedMs: Date.now() - startedAt,
      firstChunkMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
      chunkCount,
      contentLength: content.length
    })

    return {
      content: content.trim(),
      mode: 'stream'
    }
  } catch (error) {
    logger.warn('OpenAI chat stream failed', {
      model,
      elapsedMs: Date.now() - startedAt,
      firstChunkMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
      chunkCount,
      receivedContent,
      partialContentLength: content.trim().length,
      willFallback: effectiveFallback && !receivedContent,
      ...getErrorMeta(error)
    })

    if (allowPartialOnStreamError && receivedContent) {
      const partial = content.trim()
      if (partial.length > 0) {
        logger.warn('OpenAI chat returning partial streamed content after stream error', {
          model,
          mode: 'stream-partial',
          contentLength: partial.length
        })
        return {
          content: partial,
          mode: 'stream-partial'
        }
      }
    }

    throw error
  }
}
