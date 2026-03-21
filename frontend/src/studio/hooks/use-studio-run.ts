import { useCallback } from 'react'
import { StudioApiRequestError } from '../api/client'
import { createStudioRun } from '../api/studio-agent-api'
import { buildStudioCreateRunInput } from '../api/studio-run-request'
import type {
  StudioPermissionRequest,
  StudioRun,
  StudioSession,
  StudioSessionSnapshot,
  StudioUserMessage,
} from '../protocol/studio-agent-types'

interface UseStudioRunInput {
  session: StudioSession | null
  onUserMessageSubmitted: (message: StudioUserMessage) => void
  onRunSubmitting: () => void
  onRunStarted: (run: StudioRun, pendingPermissions: StudioPermissionRequest[]) => void
  onSnapshotLoaded: (snapshot: StudioSessionSnapshot, pendingPermissions: StudioPermissionRequest[]) => void
  recoverSession: () => Promise<StudioSession>
}

export function useStudioRun({ session, onUserMessageSubmitted, onRunSubmitting, onRunStarted, onSnapshotLoaded, recoverSession }: UseStudioRunInput) {
  return useCallback(async (inputText: string) => {
    if (!session) {
      return
    }

    const submitWithSession = async (activeSession: StudioSession, allowRecovery: boolean) => {
      const optimisticMessage: StudioUserMessage = {
        id: `local-user-${Date.now()}`,
        sessionId: activeSession.id,
        role: 'user',
        text: inputText,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      onUserMessageSubmitted(optimisticMessage)
      onRunSubmitting()

      try {
        const response = await createStudioRun(buildStudioCreateRunInput({
          session: activeSession,
          inputText,
        }))

        const pendingPermissions = filterPermissionsForSession(response.pendingPermissions, activeSession.id)

        onRunStarted(response.run, pendingPermissions)
        onSnapshotLoaded({
          session: activeSession,
          messages: response.messages,
          runs: [response.run],
          tasks: response.tasks,
          works: response.works,
          workResults: response.workResults,
        }, pendingPermissions)
      } catch (error) {
        if (
          allowRecovery
          && error instanceof StudioApiRequestError
          && error.code === 'NOT_FOUND'
          && error.message.includes('Session not found')
        ) {
          const recoveredSession = await recoverSession()
          await submitWithSession(recoveredSession, false)
          return
        }

        throw error
      }
    }

    await submitWithSession(session, true)
  }, [onRunStarted, onRunSubmitting, onSnapshotLoaded, onUserMessageSubmitted, recoverSession, session])
}

function filterPermissionsForSession(requests: StudioPermissionRequest[], sessionId?: string | null) {
  if (!sessionId) {
    return []
  }
  return requests.filter((request) => request.sessionID === sessionId)
}
