import { createLogger } from '../../utils/logger'
import { InMemoryStudioEventBus } from '../events/event-bus'
import type { StudioPermissionService } from '../permissions/permission-service'
import { createStudioTurnExecutionStream } from './tool-execution-stream'
import { StudioRunProcessor } from './run-processor'
import type { StudioTurnPlanResolver } from './turn-plan-resolver'
import type {
  StudioResolvedSkill,
  StudioSubagentRunRequest,
  StudioSubagentRunResult
} from './tool-runtime-context'
import {
  buildDraftAssistantMessage,
  buildDraftRun,
  buildSubagentPrompt,
  extractLatestAssistantText,
  failRunState,
  finalizeRunState
} from './session-runner-helpers'
import { buildStudioWorkContext } from './work-context'
import type {
  StudioAssistantMessage,
  StudioEventBus,
  StudioMessageStore,
  StudioPartStore,
  StudioPermissionDecision,
  StudioPermissionRequest,
  StudioRun,
  StudioRunStore,
  StudioRuntimeTurnPlan,
  StudioSession,
  StudioSessionStore,
  StudioTaskStore,
  StudioWorkResultStore,
  StudioWorkStore
} from '../domain/types'
import { StudioToolRegistry } from '../tools/registry'

const logger = createLogger('StudioSessionRunner')

interface StudioSessionRunnerOptions {
  registry: StudioToolRegistry
  messageStore: StudioMessageStore
  partStore: StudioPartStore
  runStore?: StudioRunStore
  sessionStore?: StudioSessionStore
  permissionService?: StudioPermissionService
  askForConfirmation?: (request: StudioPermissionRequest) => Promise<StudioPermissionDecision>
  taskStore?: StudioTaskStore
  workStore?: StudioWorkStore
  workResultStore?: StudioWorkResultStore
  eventBus?: StudioEventBus
  resolveSkill?: (name: string, session: StudioSession) => Promise<StudioResolvedSkill>
  resolveTurnPlan: StudioTurnPlanResolver
}

export class StudioSessionRunner {
  private readonly registry: StudioToolRegistry
  private readonly processor: StudioRunProcessor
  private readonly messageStore: StudioMessageStore
  private readonly runStore?: StudioRunStore
  private readonly sessionStore?: StudioSessionStore
  private readonly permissionService?: StudioPermissionService
  private readonly askForConfirmation: (request: StudioPermissionRequest) => Promise<StudioPermissionDecision>
  private readonly taskStore?: StudioTaskStore
  private readonly workStore?: StudioWorkStore
  private readonly workResultStore?: StudioWorkResultStore
  private readonly sharedEventBus?: StudioEventBus
  private readonly resolveSkill?: (name: string, session: StudioSession) => Promise<StudioResolvedSkill>
  private readonly resolveTurnPlan: StudioTurnPlanResolver

  constructor(options: StudioSessionRunnerOptions) {
    this.registry = options.registry
    this.messageStore = options.messageStore
    this.processor = new StudioRunProcessor({
      messageStore: options.messageStore,
      partStore: options.partStore
    })
    this.runStore = options.runStore
    this.sessionStore = options.sessionStore
    this.permissionService = options.permissionService
    this.taskStore = options.taskStore
    this.workStore = options.workStore
    this.workResultStore = options.workResultStore
    this.sharedEventBus = options.eventBus
    this.resolveSkill = options.resolveSkill
    this.resolveTurnPlan = options.resolveTurnPlan
    this.askForConfirmation = options.askForConfirmation ?? (async () => 'reject')
  }

  async createAssistantMessage(session: StudioSession): Promise<StudioAssistantMessage> {
    const message = buildDraftAssistantMessage(session)
    return this.messageStore.createAssistantMessage(message)
  }

  createRun(session: StudioSession, inputText: string): StudioRun {
    return buildDraftRun(session, inputText)
  }

  async run(input: {
    projectId: string
    session: StudioSession
    inputText: string
  }): Promise<StudioSubagentRunResult & { run: StudioRun; assistantMessage: StudioAssistantMessage }> {
    const plan = await this.resolveTurnPlanForNewRun(input)
    return this.runWithResolvedPlan({ ...input, plan })
  }

  async runWithPlan(input: {
    projectId: string
    session: StudioSession
    inputText: string
    plan: StudioRuntimeTurnPlan
  }): Promise<StudioSubagentRunResult & { run: StudioRun; assistantMessage: StudioAssistantMessage }> {
    return this.runWithResolvedPlan(input)
  }

  async runSubagent(input: StudioSubagentRunRequest): Promise<StudioSubagentRunResult> {
    const skill = input.skillName && this.resolveSkill
      ? await this.resolveSkill(input.skillName, input.childSession)
      : undefined

    const result = await this.run({
      projectId: input.projectId,
      session: input.childSession,
      inputText: buildSubagentPrompt({
        agentType: input.subagentType,
        inputText: input.inputText,
        skillName: input.skillName,
        skill,
        files: input.files
      })
    })

    return {
      text: result.text
    }
  }

  private async resolveTurnPlanForNewRun(input: {
    projectId: string
    session: StudioSession
    inputText: string
  }): Promise<StudioRuntimeTurnPlan> {
    const draftRun = buildDraftRun(input.session, input.inputText)
    const draftAssistantMessage = buildDraftAssistantMessage(input.session)
    const workContext = await buildStudioWorkContext({
      sessionId: input.session.id,
      agent: input.session.agentType,
      assistantMessage: draftAssistantMessage,
      workStore: this.workStore,
      workResultStore: this.workResultStore,
      taskStore: this.taskStore
    })

    return this.resolveTurnPlan({
      projectId: input.projectId,
      session: input.session,
      run: draftRun,
      assistantMessage: draftAssistantMessage,
      inputText: input.inputText,
      workContext
    })
  }

  private async runWithResolvedPlan(input: {
    projectId: string
    session: StudioSession
    inputText: string
    plan: StudioRuntimeTurnPlan
  }): Promise<StudioSubagentRunResult & { run: StudioRun; assistantMessage: StudioAssistantMessage }> {
    const run = this.createRun(input.session, input.inputText)
    const persistedRun = this.runStore ? await this.runStore.create(run) : run
    const assistantMessage = await this.createAssistantMessage(input.session)

    await this.runStore?.update(persistedRun.id, { status: 'running' })

    try {
      const eventBus = this.sharedEventBus ?? new InMemoryStudioEventBus()
      const outcome = await this.processor.processStream({
        session: input.session,
        run: persistedRun,
        assistantMessage,
        events: createStudioTurnExecutionStream({
          projectId: input.projectId,
          session: input.session,
          run: persistedRun,
          assistantMessage,
          plan: input.plan,
          registry: this.registry,
          eventBus,
          permissionService: this.permissionService,
          sessionStore: this.sessionStore,
          taskStore: this.taskStore,
          workStore: this.workStore,
          workResultStore: this.workResultStore,
          askForConfirmation: this.askForConfirmation,
          runSubagent: (request) => this.runSubagent(request),
          resolveSkill: this.resolveSkill,
          setToolMetadata: (callId, metadata) => {
            void this.processor.applyToolMetadata({
              assistantMessage,
              callId,
              title: metadata.title,
              metadata: metadata.metadata
            })
          }
        })
      })

      const finishedRun = finalizeRunState({ run: persistedRun, outcome })
      await this.runStore?.update(persistedRun.id, finishedRun)
      eventBus.publish({
        type: 'run_updated',
        run: finishedRun
      })

      logger.info('Studio session run completed', {
        sessionId: input.session.id,
        runId: persistedRun.id,
        agent: input.session.agentType,
        outcome,
        eventCount: eventBus.list().length
      })

      return {
        run: finishedRun,
        assistantMessage,
        text: extractLatestAssistantText(assistantMessage.parts)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedRun = failRunState(persistedRun, message)
      await this.runStore?.update(persistedRun.id, failedRun)
      ;(this.sharedEventBus ?? new InMemoryStudioEventBus()).publish({
        type: 'run_updated',
        run: failedRun
      })

      logger.warn('Studio session run failed', {
        sessionId: input.session.id,
        runId: persistedRun.id,
        agent: input.session.agentType,
        error: message
      })

      throw error
    }
  }
}

