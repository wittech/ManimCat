import type { StudioAgentType, StudioWorkContext } from '../domain/types'
import type { StudioTurnPolicyDecision } from './turn-plan-policy'

interface InsertStudioRemindersInput {
  assistantText?: string
  agentType: StudioAgentType
  unsupportedRequestedTools: string[]
  workContext?: StudioWorkContext
  policyDecision: StudioTurnPolicyDecision
}

export function insertStudioReminders(input: InsertStudioRemindersInput): string | undefined {
  const baseText = input.assistantText?.trim()
  const reminders = buildReminders(input)

  if (!baseText) {
    return reminders.length ? reminders.join('\n') : undefined
  }

  if (!reminders.length) {
    return baseText
  }

  return [baseText, ...reminders].join('\n')
}

function buildReminders(input: InsertStudioRemindersInput): string[] {
  const reminders: string[] = []

  if (input.agentType === 'builder' && input.policyDecision.mode === 'continue-current-work' && input.workContext?.currentWork) {
    reminders.push(`当前会话存在进行中的 Work：${input.workContext.currentWork.title}`)
  }

  if (input.agentType === 'builder' && input.workContext?.lastRender?.status === 'failed') {
    reminders.push('最近一次 render 结果失败，后续动作应优先参考 failure-report。')
  }

  if (input.workContext?.pendingEvents?.length) {
    const latestEvents = input.workContext.pendingEvents.slice(0, 3).map((event) => event.summary)
    reminders.push(`待处理后台状态更新：${latestEvents.join(' | ')}`)
  }

  if (input.unsupportedRequestedTools.length) {
    reminders.push(`当前自动规划还没覆盖这些工具：${input.unsupportedRequestedTools.join(', ')}。`)
  }

  return reminders
}
