'use client'

import { useMemo, type ReactNode } from 'react'
import { useClient, useSanityInstance } from '@sanity/sdk-react'
import { createEngine, ENGINE_API_VERSION } from '@sanity/workflow-engine'
import { WorkflowEngineProvider, SdkInstanceProvider, WORKFLOW_RESOURCE, WORKFLOW_TAG } from './workflowContext'
import { effectHandlers } from './effectHandlers'

/**
 * Builds the workflow engine from the App SDK's authenticated client and
 * publishes both the engine and the SDK instance to the dashboard.
 *
 * Must render inside <SanityApp> — useClient and useSanityInstance both read
 * the App SDK store. The SDK instance is provided so WorkflowPanel can pass
 * it to useDocumentWorkflows and useWorkflowSession as `sdk`, bypassing the
 * Studio-context bootstrap those hooks normally use.
 *
 * The effect handlers are identical to those registered in StudioWorkflowEngine:
 * drainEffects posts to the same Next.js API routes, so selfHosted effects
 * work the same whether the user is in Studio or the standalone dashboard.
 */
export function SdkWorkflowEngine({ children }: { children: ReactNode }) {
  const client = useClient({ apiVersion: ENGINE_API_VERSION })
  const sdk = useSanityInstance()

  const effects = useMemo(() => ({ handlers: effectHandlers }), [])

  const engine = useMemo(
    () =>
      createEngine({
        client,
        tag: WORKFLOW_TAG,
        workflowResource: WORKFLOW_RESOURCE,
        effects,
      }),
    // client reference is stable per App SDK store; effects is memoized above
    [client, effects],
  )

  return (
    <WorkflowEngineProvider value={engine}>
      <SdkInstanceProvider value={sdk}>
        {children}
      </SdkInstanceProvider>
    </WorkflowEngineProvider>
  )
}
