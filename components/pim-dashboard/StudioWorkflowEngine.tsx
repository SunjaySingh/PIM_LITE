'use client'

import { useMemo, type ReactNode } from 'react'
import { useWorkflowEngine } from '@sanity/workflow-studio'
import { WorkflowEngineProvider, WORKFLOW_RESOURCE, WORKFLOW_TAG } from './workflowContext'
import { effectHandlers } from './effectHandlers'

/**
 * Builds the workflow engine from Studio source context and publishes it to the
 * dashboard, with the effect handlers this deployment's `selfHosted` effects
 * dispatch to.
 *
 * Registering `effects` here is what makes the pipeline self-driving: the
 * engine queues an effect on stage entry, and a `drainEffects` call claims it
 * and runs the matching handler (see WorkflowPanel, which drains the instance
 * it is displaying).
 *
 * Must render inside a Studio workspace — `useWorkflowEngine` reads the
 * workspace client via `useSource`, so this is only mounted by the Studio tool
 * entry point, never by the standalone App SDK route.
 */
export function StudioWorkflowEngine({ children }: { children: ReactNode }) {
  // useWorkflowEngine memoizes on config content, but asks that `effects` be a
  // stable value rather than a fresh object each render.
  const effects = useMemo(() => ({ handlers: effectHandlers }), [])

  const engine = useWorkflowEngine({
    workflowResource: WORKFLOW_RESOURCE,
    tag: WORKFLOW_TAG,
    effects,
  })

  return <WorkflowEngineProvider value={engine}>{children}</WorkflowEngineProvider>
}
