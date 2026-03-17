import OpenAI from 'openai'
import type { CustomApiConfig } from '../types'

const OPENAI_TIMEOUT = parseInt(process.env.OPENAI_TIMEOUT || '600000', 10)

interface OpenAIBaseConfig {
  timeout: number
  defaultHeaders: {
    'User-Agent': string
  }
}

function createBaseConfig(): OpenAIBaseConfig {
  return {
    timeout: OPENAI_TIMEOUT,
    defaultHeaders: {
      'User-Agent': 'ManimCat/1.0'
    }
  }
}

export function createCustomOpenAIClient(config: CustomApiConfig): OpenAI {
  return new OpenAI({
    ...createBaseConfig(),
    baseURL: config.apiUrl.trim().replace(/\/+$/, ''),
    apiKey: config.apiKey
  })
}
