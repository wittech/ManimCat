import { createStudioSession } from '../domain/factories'
import type {
  StudioPermissionLevel,
  StudioPermissionReply,
  StudioPermissionRequest,
  StudioSession,
  StudioTask,
  StudioWork,
  StudioWorkResult
} from '../domain/types'
import { InMemoryStudioEventBus } from '../events/event-bus'
import { adaptStudioEvent, type StudioExternalEvent } from '../events/studio-event-adapter'
import { StudioPermissionService } from '../permissions/permission-service'
import { defaultRulesForLevel } from '../permissions/policy'
import { InMemoryStudioRunStore } from '../runs/memory-run-store'
import { InMemoryStudioMessageStore } from '../sessions/memory-message-store'
import { InMemoryStudioPartStore } from '../sessions/memory-part-store'
import { InMemoryStudioSessionStore } from '../sessions/memory-session-store'
import { createLocalStudioSkillResolver } from '../skills/local-skill-resolver'
import { InMemoryStudioTaskStore } from '../tasks/memory-task-store'
import { createPlaceholderStudioTools } from '../tools/placeholder-tools'
import { StudioToolRegistry } from '../tools/registry'
import { InMemoryStudioWorkResultStore } from '../works/memory-work-result-store'
import { InMemoryStudioWorkStore } from '../works/memory-work-store'
import { StudioBuilderRuntime } from './builder-runtime'
import { createStudioDefaultTurnPlanResolver } from './default-turn-plan-resolver'
import { syncStudioRenderTask } from './render-task-sync'

const sessionStore = new InMemoryStudioSessionStore()
const messageStore = new InMemoryStudioMessageStore()
const partStore = new InMemoryStudioPartStore()
const runStore = new InMemoryStudioRunStore()
const taskStore = new InMemoryStudioTaskStore()
const workStore = new InMemoryStudioWorkStore()
const workResultStore = new InMemoryStudioWorkResultStore()
const permissionService = new StudioPermissionService()
const registry = new StudioToolRegistry()
const externalEventLog: StudioExternalEvent[] = []
const eventBus = new InMemoryStudioEventBus()

for (const tool of createPlaceholderStudioTools()) {
  registry.register(tool)
}

const resolveSkill = createLocalStudioSkillResolver()
const resolveTurnPlan = createStudioDefaultTurnPlanResolver({ registry })

const runtime = new StudioBuilderRuntime({
  registry,
  messageStore,
  partStore,
  runStore,
  sessionStore,
  taskStore,
  workStore,
  workResultStore,
  permissionService,
  resolveTurnPlan,
  resolveSkill,
  eventBus
})

eventBus.subscribe((event) => {
  const adapted = adaptStudioEvent(event)
  if (adapted) {
    externalEventLog.push(adapted)
  }
})

export const studioRuntime = {
  registry,
  runtime,
  permissionService,
  sessionStore,
  messageStore,
  partStore,
  runStore,
  taskStore,
  workStore,
  workResultStore,
  eventBus,
  async createSession(input: {
    projectId: string
    directory: string
    title?: string
    agentType?: StudioSession['agentType']
    permissionLevel?: StudioPermissionLevel
    workspaceId?: string
  }): Promise<StudioSession> {
    const permissionLevel = input.permissionLevel ?? 'L2'
    return sessionStore.create(
      createStudioSession({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        agentType: input.agentType ?? 'builder',
        title: input.title ?? 'Studio Session',
        directory: input.directory,
        permissionLevel,
        permissionRules: defaultRulesForLevel(permissionLevel)
      })
    )
  },
  getSession(sessionId: string) {
    return sessionStore.getById(sessionId)
  },
  async syncSession(sessionId: string): Promise<void> {
    const tasks = await taskStore.listBySessionId(sessionId)
    for (const task of tasks) {
      await syncTaskState(task)
    }
  },
  async listWorkResultsBySessionId(sessionId: string): Promise<StudioWorkResult[]> {
    const works = await workStore.listBySessionId(sessionId)
    return collectWorkResults(works)
  },
  listExternalEvents(): StudioExternalEvent[] {
    return [...externalEventLog]
  },
  subscribeExternalEvents(listener: (event: StudioExternalEvent) => void): () => void {
    return eventBus.subscribe((event) => {
      const adapted = adaptStudioEvent(event)
      if (adapted) {
        listener(adapted)
      }
    })
  },
  listPendingPermissions(): StudioPermissionRequest[] {
    return permissionService.listPending()
  },
  replyPermission(input: StudioPermissionReply): boolean {
    return permissionService.reply(input)
  }
}

async function syncTaskState(task: StudioTask): Promise<void> {
  if (task.type !== 'render') {
    return
  }

  await syncStudioRenderTask({
    task,
    taskStore,
    workStore,
    workResultStore,
    sessionStore,
    messageStore,
    partStore,
    eventBus
  })
}

async function collectWorkResults(works: StudioWork[]): Promise<StudioWorkResult[]> {
  const resultSets = await Promise.all(works.map((work) => workResultStore.listByWorkId(work.id)))
  return resultSets.flat()
}
