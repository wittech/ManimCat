import type { StaticDiagnostic } from './types'

export function getStaticPatchSystemPrompt(): string {
  return [
    '你是一个静态修复员，只做局部替换。',
    '你的唯一任务是根据静态检查报错，返回可直接替换的原片段和新片段。',
    '优先修改最小片段；能改一行内局部就不要改整行；能改一行就不要改多行。',
    '如果当前报错属于同一类、可模式化的静态问题，并且在同文件中明显重复出现，允许一次性返回多个局部 patch，一起修掉多个同类问题，连续或非连续都可以。',
    '禁止返回完整代码，禁止解释，禁止附加任何文字。',
    '不要输出 JSON。',
    '只输出一个或多个 SEARCH/REPLACE patch 块。',
    '每个 patch 严格使用下面格式：',
    '[[PATCH]]',
    '[[SEARCH]]',
    '这里放原代码片段',
    '[[REPLACE]]',
    '这里放替换后的代码片段',
    '[[END]]',
    'original snippet 必须逐字摘抄自当前代码，不能改写，不能概括。',
    '禁止 markdown 代码块，禁止 ```，禁止任何额外说明。'
  ].join('\n')
}

function formatDiagnostic(diagnostic: StaticDiagnostic, index: number): string {
  return [
    `问题 ${index + 1}:`,
    `- 工具：${diagnostic.tool}`,
    `- 错误码：${diagnostic.code || 'unknown'}`,
    `- 行号：${diagnostic.line}`,
    `- 报错信息：${diagnostic.message}`
  ].join('\n')
}

export function buildStaticPatchUserPrompt(code: string, diagnostics: StaticDiagnostic[]): string {
  const primaryDiagnostic = diagnostics[0]
  return [
    '完整代码：',
    code,
    '',
    '静态检查结果：',
    ...diagnostics.map((diagnostic, index) => formatDiagnostic(diagnostic, index)),
    '',
    '修复要求：',
    '- 优先做最小局部替换。',
    '- 这是一批当前文件里真实存在的静态问题，请优先一起修掉同类问题；连续或非连续都可以。',
    '- original_snippet 必须逐字摘抄自上面的当前代码，包含完全一致的空格、缩进、括号和变量名，不能改写，不能概括。',
    '- 不要重写整个文件。',
    primaryDiagnostic
      ? `- 优先围绕第一个问题（第 ${primaryDiagnostic.line} 行）组织修复，但可顺手修掉同批同类问题。`
      : '- 没有问题时不要输出任何内容。',
    '',
    '只返回下面这种 patch 块，可返回多个：',
    '[[PATCH]]',
    '[[SEARCH]]',
    '原代码片段1',
    '[[REPLACE]]',
    '新代码片段1',
    '[[END]]'
  ].join('\n')
}
