import type {
  StudioAssistantMessage,
  StudioFileAttachment,
  StudioTaskStore,
  StudioWork,
  StudioWorkContext,
  StudioWorkResultStore,
  StudioWorkStore
} from '../domain/types'

interface BuildStudioWorkContextInput {
  sessionId: string
  agent: string
  assistantMessage: StudioAssistantMessage
  workStore?: StudioWorkStore
  workResultStore?: StudioWorkResultStore
  taskStore?: StudioTaskStore
}

export async function buildStudioWorkContext(input: BuildStudioWorkContextInput): Promise<StudioWorkContext | undefined> {
  if (!input.workStore) {
    return undefined
  }

  const works = await input.workStore.listBySessionId(input.sessionId)
  if (!works.length) {
    return {
      sessionId: input.sessionId,
      agent: input.agent
    }
  }

  const currentWork = selectCurrentWork(works)
  const lastRenderWork = [...works]
    .filter((work) => work.type === 'video' || work.type === 'render-fix')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]

  const context: StudioWorkContext = {
    sessionId: input.sessionId,
    agent: input.agent,
    currentWork: currentWork
      ? {
          id: currentWork.id,
          type: currentWork.type,
          status: mapWorkStatus(currentWork.status),
          title: currentWork.title
        }
      : undefined
  }

  if (lastRenderWork && input.workResultStore) {
    const results = await input.workResultStore.listByWorkId(lastRenderWork.id)
    const lastResult = [...results].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
    if (lastResult) {
      context.lastRender = {
        status: lastResult.kind === 'failure-report' ? 'failed' : 'success',
        timestamp: Date.parse(lastResult.createdAt),
        workId: lastRenderWork.id,
        output: lastResult.kind === 'render-output'
          ? {
              videoPath: findAttachment(lastResult.attachments, 'video/'),
              imagePaths: listAttachments(lastResult.attachments, 'image/')
            }
          : undefined,
        error: lastResult.kind === 'failure-report'
          ? typeof lastResult.metadata?.error === 'string'
            ? lastResult.metadata.error
            : lastResult.summary
          : undefined
      }
    }
  }

  return context
}

function selectCurrentWork(works: StudioWork[]): StudioWork | undefined {
  return [...works]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .find((work) => work.status === 'running' || work.status === 'proposed')
    ?? [...works].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
}

function mapWorkStatus(status: StudioWork['status']): 'pending' | 'running' | 'completed' | 'failed' {
  if (status === 'proposed') {
    return 'pending'
  }
  if (status === 'cancelled') {
    return 'failed'
  }
  return status
}

function findAttachment(attachments: StudioFileAttachment[] | undefined, prefix: string): string | undefined {
  return attachments?.find((attachment) => attachment.mimeType?.startsWith(prefix))?.path
}

function listAttachments(attachments: StudioFileAttachment[] | undefined, prefix: string): string[] | undefined {
  const paths = attachments?.filter((attachment) => attachment.mimeType?.startsWith(prefix)).map((attachment) => attachment.path) ?? []
  return paths.length ? paths : undefined
}
