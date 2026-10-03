'use client'

import { useEffect, useState } from 'react'
import { gdrRef, type Engine } from '@sanity/workflow-engine'
import { useDocumentWorkflows as useDocumentWorkflowsStudio, useWorkflowSession as useWorkflowSessionStudio } from '@sanity/workflow-studio'
import { useDocumentWorkflows as useDocumentWorkflowsSdk, useWorkflowSession as useWorkflowSessionSdk } from '@sanity/workflow-sdk'
import type { WorkflowSession } from '@sanity/workflow-react'
import styles from './ProductDetailPanel.module.css'
import { cx } from './cx'
import { useOptionalWorkflowEngine, useOptionalSdkInstance, productGdr, WORKFLOW_RESOURCE } from './workflowContext'

const DEFINITION = 'amazon-readiness'

const STAGE_COLOR: Record<string, string> = {
  'draft':           'var(--pim-state-draft)',
  'audit-pending':   'var(--pim-state-audit-pending)',
  'human-review':    'var(--pim-state-audit-pending)',
  'audit-passed':    'var(--pim-state-audit-passed)',
  'video-requested': 'var(--pim-state-video-req)',
  'video-ready':     'var(--pim-state-video-ready)',
  'published':       'var(--pim-state-published)',
}

export function WorkflowPanel({ productId }: { productId: string }) {
  const engine = useOptionalWorkflowEngine()
  const sdk = useOptionalSdkInstance()

  // Hooks cannot be called conditionally, so the engine-dependent work lives in
  // a child that is only mounted once an engine exists.
  if (!engine) {
    return (
      <div className={styles.workflowBadge} style={{ borderColor: 'var(--pim-border)', color: 'var(--pim-text-muted)' }}>
        Workflow controls are available in the Studio host
      </div>
    )
  }

  // The workflow-studio hooks call useSource() unconditionally, which requires
  // Sanity Studio source context. In the standalone App SDK host sdk is provided,
  // so we use the workflow-sdk hooks instead which read from the SDK store directly.
  if (sdk) {
    return <SdkWorkflowInstanceLoader engine={engine} productId={productId} />
  }
  return <StudioWorkflowInstanceLoader engine={engine} productId={productId} />
}

function StudioWorkflowInstanceLoader({ engine, productId }: { engine: Engine; productId: string }) {
  const { instances, loading, error } = useDocumentWorkflowsStudio({
    engine,
    document: productGdr(productId),
  })

  if (error) {
    return <Badge tone="var(--pim-score-low)">Workflow read failed — {String(error)}</Badge>
  }

  if (loading || instances === undefined) {
    return <Badge tone="var(--pim-border)">Loading workflow…</Badge>
  }

  const instance = instances[0]
  if (!instance) {
    return <StartWorkflow engine={engine} productId={productId} />
  }

  return <StudioWorkflowActions engine={engine} instanceId={instance._id} />
}

function SdkWorkflowInstanceLoader({ engine, productId }: { engine: Engine; productId: string }) {
  const { instances, loading, error } = useDocumentWorkflowsSdk({
    engine,
    document: productGdr(productId),
  })

  if (error) {
    return <Badge tone="var(--pim-score-low)">Workflow read failed — {String(error)}</Badge>
  }

  if (loading || instances === undefined) {
    return <Badge tone="var(--pim-border)">Loading workflow…</Badge>
  }

  const instance = instances[0]
  if (!instance) {
    return <StartWorkflow engine={engine} productId={productId} />
  }

  return <SdkWorkflowActions engine={engine} instanceId={instance._id} />
}

/**
 * The workflow's `start` block is interactive — instances are never created
 * automatically when a product document appears. Without this, a product can
 * never enter the pipeline from the dashboard at all.
 */
function StartWorkflow({ engine, productId }: { engine: Engine; productId: string }) {
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const handleStart = async () => {
    setStarting(true)
    setFailure(null)
    try {
      await engine.startInstance({
        definition: DEFINITION,
        initialFields: [
          {
            type: 'subject',
            name: 'subject',
            value: gdrRef({
              res: WORKFLOW_RESOURCE,
              documentId: productId.replace(/^drafts\./, ''),
              type: 'product',
            }),
          },
        ],
      })
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className={styles.section}>
      <Badge tone="var(--pim-border)">Not in the pipeline yet</Badge>
      <button
        className={cx(styles.btn, styles.btnPrimary)}
        onClick={handleStart}
        disabled={starting}
      >
        {starting ? 'Starting…' : 'Start Amazon Readiness workflow'}
      </button>
      {failure && <div className={cx(styles.videoMeta, styles.videoFailed)}>{failure}</div>}
    </div>
  )
}

function StudioWorkflowActions({ engine, instanceId }: { engine: Engine; instanceId: string }) {
  const session = useWorkflowSessionStudio({ engine, instanceId })
  return <WorkflowActionsView engine={engine} instanceId={instanceId} session={session} />
}

function SdkWorkflowActions({ engine, instanceId }: { engine: Engine; instanceId: string }) {
  const session = useWorkflowSessionSdk({ engine, instanceId })
  return <WorkflowActionsView engine={engine} instanceId={instanceId} session={session} />
}

function WorkflowActionsView({ engine, instanceId, session }: { engine: Engine; instanceId: string; session: WorkflowSession }) {
  const [firing, setFiring] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [draining, setDraining] = useState(false)

  // Pending effects are inert until something claims them. Nothing calls into
  // this app from outside — `selfHosted` effects are drained by whoever holds
  // the engine — so the panel pumps the instance it is displaying, on entry and
  // then on an interval while it stays open.
  useEffect(() => {
    let active = true
    let inFlight = false

    const pump = async () => {
      if (!active || inFlight) return
      inFlight = true
      try {
        const result = await engine.drainEffects({ instanceId })
        if (!active) return
        if (result.drained.length > 0 || result.failed.length > 0) {
          setDraining(result.drained.length > 0)
        }
        if (result.failed.length > 0) {
          setFailure(`${result.failed.length} effect(s) failed — the engine will retry`)
        }
      } catch (err) {
        if (active) setFailure(err instanceof Error ? err.message : String(err))
      } finally {
        inFlight = false
        if (active) setDraining(false)
      }
    }

    pump()
    const timer = setInterval(pump, 4000)
    return () => { active = false; clearInterval(timer) }
  }, [engine, instanceId])

  if (session.invalid) {
    return <Badge tone="var(--pim-score-low)">Workflow document could not be read ({session.invalid.reason})</Badge>
  }

  if (!session.ready || !session.evaluation) {
    return <Badge tone="var(--pim-border)">Evaluating workflow…</Badge>
  }

  const { currentStage } = session.evaluation
  const stageName = currentStage.stage.name
  const tone = STAGE_COLOR[stageName] ?? 'var(--pim-text-muted)'

  // Every control below fires an action on this instance. Nothing here patches
  // the product to simulate a stage change — the instance is the only record of
  // where a product is, and the agent advances it through these same actions.
  const handleFire = async (activity: string, action: string) => {
    const key = `${activity}/${action}`
    setFiring(key)
    setFailure(null)
    try {
      const result = await session.fireAction({ activity, action })
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        setFailure(`${action} was rejected by the engine`)
      }
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err))
    } finally {
      setFiring(null)
    }
  }

  return (
    <div className={styles.section}>
      <Badge tone={tone}>
        <span className={styles.workflowDot} style={{ background: tone }} />
        {currentStage.stage.title ?? stageName}
        {draining && <span className={styles.workflowUpdated}>· running effect…</span>}
      </Badge>

      {currentStage.activities.map(activityEval => {
        const activity = activityEval.activity.name
        const actionable = activityEval.actions.filter(a => !a.triggered)
        if (actionable.length === 0) return null

        return (
          <div key={activity} className={styles.recBlock}>
            <div className={styles.recLabel}>{activityEval.activity.title ?? activity}</div>
            {actionable.map(actionEval => {
              const action = actionEval.action.name
              const key = `${activity}/${action}`
              const disabled = !actionEval.allowed || firing !== null
              return (
                <button
                  key={action}
                  className={cx(styles.btn, actionEval.allowed ? styles.btnApprove : styles.btnDisabled)}
                  disabled={disabled}
                  onClick={() => handleFire(activity, action)}
                  // The engine's own reason, not a threshold re-implemented here
                  title={
                    actionEval.allowed
                      ? `Fire "${actionEval.action.title ?? action}"`
                      : `Unavailable: ${actionEval.disabledReason ?? 'the engine does not allow this action yet'}`
                  }
                >
                  {firing === key ? 'Working…' : actionEval.action.title ?? action}
                </button>
              )
            })}
          </div>
        )
      })}

      {failure && <div className={cx(styles.videoMeta, styles.videoFailed)}>{failure}</div>}
    </div>
  )
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <div className={styles.workflowBadge} style={{ borderColor: tone, color: tone }}>
      {children}
    </div>
  )
}
