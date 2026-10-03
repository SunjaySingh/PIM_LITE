'use client'

import { SanityApp } from '@sanity/sdk-react'
import { PimDashboardView } from './PimDashboardView'
import { StudioWorkflowEngine } from './StudioWorkflowEngine'

/**
 * Studio tool entry point.
 *
 * `SanityApp` needs no config here — rendered inside Studio it derives the
 * project and dataset from the workspace. `StudioWorkflowEngine` is mounted
 * only on this path, because it reads Studio source context; the standalone
 * route at /dashboard mounts PimDashboardView without it.
 */
export function PimDashboard() {
  return (
    <SanityApp fallback={<div>Loading…</div>}>
      <StudioWorkflowEngine>
        <PimDashboardView />
      </StudioWorkflowEngine>
    </SanityApp>
  )
}
