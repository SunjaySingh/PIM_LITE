'use client'

import { createContext, useContext } from 'react'
import { gdrUri, type Engine, type GdrUri } from '@sanity/workflow-engine'
import type { useDocumentWorkflows } from '@sanity/workflow-studio'

// Derive SdkInstance from the hook's parameter rather than importing @sanity/sdk
// directly (it is not a declared dependency of this package).
type SdkInstance = NonNullable<Parameters<typeof useDocumentWorkflows>[0]['sdk']>

/**
 * The dashboard mounts in two hosts. The Studio host provides both an engine
 * (via StudioWorkflowEngine) and no SDK instance — workflow-studio hooks
 * bootstrap an SDK instance from Studio source context automatically when sdk
 * is undefined. The standalone App SDK host provides both an engine AND an SDK
 * instance (via SdkWorkflowEngine); passing sdk to those same hooks lets them
 * skip the Studio-context bootstrap entirely.
 */
const WorkflowEngineContext = createContext<Engine | null>(null)
const SdkInstanceContext = createContext<SdkInstance | null>(null)

export const WorkflowEngineProvider = WorkflowEngineContext.Provider
export const SdkInstanceProvider = SdkInstanceContext.Provider

/** The host's engine, or null when this host cannot build one. */
export function useOptionalWorkflowEngine(): Engine | null {
  return useContext(WorkflowEngineContext)
}

/**
 * The App SDK instance to pass to workflow-studio hooks as `sdk`.
 * Null in the Studio host — hooks auto-bootstrap from Studio context when sdk
 * is undefined.
 */
export function useOptionalSdkInstance(): SdkInstance | null {
  return useContext(SdkInstanceContext)
}

export const WORKFLOW_TAG = 'prod'

export const PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'dkhhaxxy'
export const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production'

/** Must match `workflowResource` in sanity.workflow.ts. */
export const WORKFLOW_RESOURCE = {
  type: 'dataset',
  id: `${PROJECT_ID}.${DATASET}`,
} as const

/**
 * Global document reference for a product, as the engine addresses subjects.
 *
 * Built with the engine's own `gdrUri` rather than a template string: the
 * format is colon-separated (`dataset:project:dataset:doc-id`), and hand-rolling
 * it with slashes produces a string that satisfies the `GdrUri` template type
 * but is rejected at run time by the engine's prefilter.
 *
 * `gdrUri` throws on a `drafts.` prefix — drafts and published documents share
 * one instance, addressed by the stable published ID — so it is stripped first.
 */
export function productGdr(documentId: string): GdrUri {
  return gdrUri({
    scheme: 'dataset',
    projectId: PROJECT_ID,
    dataset: DATASET,
    documentId: documentId.replace(/^drafts\./, ''),
  })
}
