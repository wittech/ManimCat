import type { StudioAgentType } from '../domain/types'
import type { StudioParsedTurnIntent } from './turn-plan-intent'
import type { StudioTurnPolicyDecision } from './turn-plan-policy'
import { buildReviewerReport } from '../review/reviewer-report'

export function buildAgentAssistantText(input: {
  agentType: StudioAgentType
  inputText: string
  intent: StudioParsedTurnIntent
  policyDecision: StudioTurnPolicyDecision
}): string {
  switch (input.agentType) {
    case 'reviewer':
      return buildReviewerText(input.inputText, input.intent)
    case 'designer':
      return buildDesignerText(input.inputText, input.intent)
    case 'builder':
    default:
      return buildBuilderText(input.intent, input.policyDecision)
  }
}

function buildBuilderText(intent: StudioParsedTurnIntent, policyDecision: StudioTurnPolicyDecision): string {
  switch (policyDecision.mode) {
    case 'continue-current-work':
      return '我会先延续当前正在进行的子代理工作。'
    case 'task-intent':
      if (intent.task) {
        const skillSegment = intent.task.skillName ? `，并让子代理使用 skill "${intent.task.skillName}"` : ''
        return `我会把这项工作交给 ${intent.task.subagentType} 子代理${skillSegment}。`
      }
      return '我会先按当前任务意图调度子代理。'
    case 'direct-tool':
      if (intent.directTool) {
        return `我会先执行 ${intent.directTool.toolName} 工具。`
      }
      return '我会先执行当前命中的工具。'
    case 'none':
    default:
      if (intent.explicitCommand) {
        return '这条命令没有命中当前已接通的自动规划路径。'
      }
      return '当前输入没有命中可自动执行的规划路径。'
  }
}

function buildReviewerText(inputText: string, intent: StudioParsedTurnIntent): string {
  const generatedReport = buildReviewerReport(inputText)
  if (generatedReport) {
    return generatedReport
  }

  const subject = summarizeInput(inputText)
  const prefix = intent.skillName ? `我会先按 skill "${intent.skillName}" 的约束来审查。` : '我会按 reviewer 的职责先做风险导向审查。'

  return [
    prefix,
    `审查对象：${subject}`,
    '当前最小版会先给出审查方向、风险点和建议的验证路径。'
  ].join('\n')
}

function buildDesignerText(inputText: string, intent: StudioParsedTurnIntent): string {
  const subject = summarizeInput(inputText)
  const prefix = intent.skillName ? `我会先按 skill "${intent.skillName}" 的约束来做设计拆解。` : '我会按 designer 的职责先做方案和结构拆解。'

  return [
    prefix,
    `设计对象：${subject}`,
    '当前最小版会先给出结构方向、实现切分和下一步建议。'
  ].join('\n')
}

function summarizeInput(inputText: string): string {
  const firstContentLine = inputText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return firstContentLine?.slice(0, 120) ?? '未提供明确内容'
}
