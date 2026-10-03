'use client'

import { SanityApp } from '@sanity/sdk-react'
import { PimDashboardView } from '../../components/pim-dashboard/PimDashboardView'
import { SdkWorkflowEngine } from '../../components/pim-dashboard/SdkWorkflowEngine'
import { PROJECT_ID, DATASET } from '../../components/pim-dashboard/workflowContext'

/**
 * The dashboard as a standalone App SDK application, outside the Studio.
 *
 * Unlike the Studio tool, `config` is required here — there is no workspace to
 * derive the project and dataset from. `SanityApp` handles the login boundary,
 * so an unauthenticated visitor is prompted rather than shown catalogue data.
 *
 * SdkWorkflowEngine assembles the workflow engine from the App SDK's
 * authenticated client (via useClient) and provides it to WorkflowPanel,
 * so stage badges and transition buttons work here exactly as they do in
 * the Studio host.
 */
export default function DashboardApp() {
  return (
    <SanityApp
      config={{ projectId: PROJECT_ID, dataset: DATASET }}
      fallback={<Splash>Loading PIM-Lite…</Splash>}
    >
      <SdkWorkflowEngine>
        <PimDashboardView />
      </SdkWorkflowEngine>
    </SanityApp>
  )
}

export function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif', color: '#64748b' }}>
      {children}
    </div>
  )
}
