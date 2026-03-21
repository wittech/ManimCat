import { useEffect, useRef, useState } from 'react'
import type { StudioMessage, StudioSession } from '../protocol/studio-agent-types'

interface StudioCommandPanelProps {
  session: StudioSession | null
  messages: StudioMessage[]
  latestAssistantText: string
  isBusy: boolean
  disabled: boolean
  onRun: (inputText: string) => Promise<void> | void
  onExit: () => void
}

export function StudioCommandPanel({
  session,
  messages,
  latestAssistantText,
  isBusy,
  disabled,
  onRun,
  onExit,
}: StudioCommandPanelProps) {
  const [input, setInput] = useState('')
  const [animatedAssistantText, setAnimatedAssistantText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const streamRateRef = useRef(0)
  const latestTextMetaRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })

  const handleSubmit = async () => {
    const next = input.trim()
    if (!next || disabled) {
      return
    }
    setInput('')
    await onRun(next)
    inputRef.current?.focus()
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, animatedAssistantText, isBusy])

  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus()
    }
  }, [disabled, session?.id])

  useEffect(() => {
    if (!latestAssistantText) {
      streamRateRef.current = 0
      latestTextMetaRef.current = { text: '', at: 0 }
      setAnimatedAssistantText('')
      return
    }

    const now = Date.now()
    const prev = latestTextMetaRef.current
    if (prev.text && latestAssistantText.startsWith(prev.text) && latestAssistantText.length > prev.text.length) {
      const deltaChars = latestAssistantText.length - prev.text.length
      const deltaMs = Math.max(1, now - prev.at)
      const charsPerSecond = (deltaChars * 1000) / deltaMs
      streamRateRef.current = streamRateRef.current === 0
        ? charsPerSecond
        : streamRateRef.current * 0.68 + charsPerSecond * 0.32
    } else if (!prev.text) {
      streamRateRef.current = 0
    }
    latestTextMetaRef.current = { text: latestAssistantText, at: now }

    setAnimatedAssistantText((current) => {
      if (!latestAssistantText.startsWith(current)) {
        return ''
      }
      return current
    })
  }, [latestAssistantText])

  useEffect(() => {
    if (!latestAssistantText) {
      return
    }

    if (animatedAssistantText === latestAssistantText) {
      return
    }

    const timer = window.setTimeout(() => {
      setAnimatedAssistantText((current) => {
        if (!latestAssistantText.startsWith(current)) {
          return latestAssistantText.slice(0, 1)
        }

        const nextLength = current.length + nextTypeStep(latestAssistantText.length - current.length)
        return latestAssistantText.slice(0, nextLength)
      })
    }, nextTypeDelay(latestAssistantText, animatedAssistantText.length, streamRateRef.current))

    return () => window.clearTimeout(timer)
  }, [animatedAssistantText, latestAssistantText])

  const lastMessage = messages.at(-1) ?? null
  const streamIntoLastAssistant =
    Boolean(lastMessage && lastMessage.role === 'assistant' && (isBusy || latestAssistantText || animatedAssistantText))

  return (
    <section className="studio-terminal flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg-primary/30 shadow-[inset_0_0_40px_rgba(0,0,0,0.02)]">
      <header className="shrink-0 flex items-center justify-between gap-4 border-b border-border/10 px-8 py-4">
        <div className="font-mono text-sm text-text-secondary/60">
          {session?.directory ?? '...'}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="px-4 py-2 text-sm text-text-secondary/60 transition hover:text-rose-500/80"
        >
          退出
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 && (
          <div className="text-base leading-7 text-text-secondary/55">
            等待指令...<span className="studio-cursor">█</span>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {messages.map((message) => {
            const isUser = message.role === 'user'

            if (isUser) {
              return (
                <div key={message.id} className="animate-fade-in-soft flex justify-end py-1">
                  <div className="max-w-[88%] rounded-[22px] rounded-br-md bg-text-primary/6 px-5 py-3 text-[15px] leading-7 text-text-primary ring-1 ring-border/10">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-text-secondary/55">
                      User
                    </div>
                    <div className="whitespace-pre-wrap break-words">{message.text}</div>
                  </div>
                </div>
              )
            }

            const parts = message.role === 'assistant' ? message.parts : []
            const isStreamingTarget = streamIntoLastAssistant && lastMessage?.id === message.id
            const streamedText = (animatedAssistantText || latestAssistantText).trim()
            const textParts = parts.filter((part) => part.type === 'text' || part.type === 'reasoning')
            const toolParts = parts.filter((part) => part.type === 'tool')
            return (
              <div key={message.id} className={`${isStreamingTarget ? '' : 'animate-fade-in-soft '}flex justify-start py-1`}>
                <div className="max-w-[90%] rounded-[22px] rounded-bl-md bg-bg-secondary/55 px-5 py-4 text-text-primary ring-1 ring-border/10">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary/55">
                    Model
                  </div>
                {toolParts.map((part, i) => {
                  if (part.type === 'tool') {
                    const status = part.state.status === 'error' ? '✗' : part.state.status === 'completed' ? '✓' : '…'
                    const args = 'input' in part.state ? truncateArgs(part.state.input) : ''
                    return (
                      <div key={i} className={`font-mono text-[13px] leading-6 ${toolCallTone(part.state.status)}`}>
                        {'→ '}{part.tool}({args}) <span className={toolCallStatusTone(part.state.status)}>{status}</span>
                      </div>
                    )
                  }

                  if (part.type === 'text' || part.type === 'reasoning') {
                    const text = part.text.trim()
                    if (!text) return null
                    return (
                      <div key={i} className="text-[15px] leading-7 text-text-primary whitespace-pre-wrap">
                        {text.split('\n').map((line, j) => (
                          <div key={j}>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }

                  return null
                })}

                {isStreamingTarget && streamedText ? (
                  <div className="text-[15px] leading-7 text-text-primary whitespace-pre-wrap break-words">
                    {streamedText}
                    {(isBusy || latestAssistantText !== animatedAssistantText) && <span className="studio-type-caret">█</span>}
                  </div>
                ) : textParts.map((part, i) => {
                  const text = part.text.trim()
                  if (!text) return null
                  return (
                    <div key={`text-${i}`} className="text-[15px] leading-7 text-text-primary whitespace-pre-wrap">
                      {text.split('\n').map((line, j) => (
                        <div key={j}>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}

                {!isStreamingTarget && textParts.every((p) => !p.text.trim()) && (
                  <div className="text-[15px] leading-7 text-text-secondary/60">
                    <span>(无文本输出)</span>
                  </div>
                )}
                </div>
              </div>
            )
          })}

          {(isBusy || latestAssistantText || animatedAssistantText) && !streamIntoLastAssistant && (
            <div className="flex justify-start py-1">
              <div className="max-w-[90%] rounded-[22px] rounded-bl-md bg-bg-secondary/55 px-5 py-4 text-text-primary ring-1 ring-border/10">
                <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-secondary/55">
                  Model
                </div>

                {animatedAssistantText ? (
                  <div className="text-[15px] leading-7 text-text-primary whitespace-pre-wrap break-words">
                    {animatedAssistantText}
                    <span className="studio-type-caret">█</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-text-secondary/60">
                    <span className="text-[15px]">正在思考</span>
                    <span className="studio-thinking-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border/10 px-8 py-5">
        <div className="flex items-center">
          <span className="mr-2 font-mono text-base text-text-secondary/55">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder={disabled ? '初始化中...' : '输入指令...'}
            disabled={disabled}
            className="flex-1 bg-transparent text-[15px] leading-7 text-text-primary outline-none placeholder:text-text-secondary/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="mt-3 text-xs text-text-secondary/45">Enter 发送</div>
      </footer>
    </section>
  )
}

function truncateArgs(input?: Record<string, unknown>) {
  if (!input) return ''
  const str = JSON.stringify(input)
  return str.length > 60 ? `${str.slice(0, 57)}...` : str
}

function toolCallTone(status: string) {
  switch (status) {
    case 'error':
      return 'text-rose-600 dark:text-rose-300'
    case 'completed':
      return 'text-cyan-700 dark:text-cyan-300'
    default:
      return 'text-amber-700 dark:text-amber-300'
  }
}

function toolCallStatusTone(status: string) {
  switch (status) {
    case 'error':
      return 'text-rose-500 dark:text-rose-300'
    case 'completed':
      return 'text-emerald-600 dark:text-emerald-300'
    default:
      return 'text-amber-600 dark:text-amber-300'
  }
}

function nextTypeDelay(target: string, currentLength: number, streamRate: number) {
  const nextChar = target[currentLength] ?? ''
  const backlog = target.length - currentLength
  const targetCharsPerSecond = resolveTypingCharsPerSecond(backlog, streamRate)
  if (!nextChar) {
    return 18
  }

  if (nextChar === '\n') {
    return 1000 / Math.max(targetCharsPerSecond * 1.4, 1)
  }

  if (/[，。！？；：,.!?;:]/.test(nextChar)) {
    return Math.max(24, 1000 / Math.max(targetCharsPerSecond * 0.55, 1))
  }

  if (/\s/.test(nextChar)) {
    return Math.max(10, 1000 / Math.max(targetCharsPerSecond * 1.25, 1))
  }

  return Math.max(12, 1000 / Math.max(targetCharsPerSecond, 1))
}

function nextTypeStep(backlog: number) {
  if (backlog >= 28) {
    return 3
  }

  if (backlog >= 16) {
    return 2
  }

  return 1
}

function resolveTypingCharsPerSecond(backlog: number, streamRate: number) {
  const minCharsPerSecond = 10
  const maxCharsPerSecond = 26
  const adaptiveBase = streamRate > 0 ? streamRate * 0.55 + 6 : minCharsPerSecond

  if (backlog >= 10) {
    return clamp(adaptiveBase, 12, maxCharsPerSecond)
  }

  return clamp(adaptiveBase, minCharsPerSecond, 18)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
