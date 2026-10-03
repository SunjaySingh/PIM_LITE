'use client'

import styles from './ProductDetailPanel.module.css'
import { cx } from './cx'
import { API_BASE } from './apiBase'
import { useDocument, useQuery } from '@sanity/sdk-react'
import { useState, Suspense } from 'react'
import { scoreClass } from './scoreClass'
import { WorkflowPanel } from './WorkflowPanel'

interface SanityProduct {
  _id: string
  sku: string
  name: string
  sfccCategory: string
  price: number
  longDescription: string
  productKind: string
  amazonChannel?: {
    readinessScore?: number
    amazonCategory?: string
    metaTitle?: string
    metaDescription?: string
  }
  productVideo?: { _ref: string }
}

interface AuditIssue {
  ruleId: string
  field: string
  severity: 'suppressible' | 'optimisation' | 'info'
  message: string
}

interface AuditReport {
  _id: string
  overallScore: number
  auditedAt: string
  issues: AuditIssue[]
  agentNotes?: string
  suggestedMetaTitle?: string
  suggestedMetaDescription?: string
  suggestedBulletPoints?: string[]
  suggestedBackendTerms?: string
}

interface VideoDoc {
  _id: string
  status: 'pending' | 'rendering' | 'ready' | 'failed'
  videoUrl?: string
  renderedAt?: string
  errorMessage?: string
}

interface Props {
  selectedId: string | null
}

export function ProductDetailPanel({ selectedId }: Props) {
  if (!selectedId) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          Select a product from the pipeline to view details and workflow actions
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={
      <div className={styles.panel}>
        <div className={styles.empty}>Loading product…</div>
      </div>
    }>
      <ActivePanel selectedId={selectedId} />
    </Suspense>
  )
}

function VideoStatus({ videoDocId }: { videoDocId: string }) {
  const { data: rawVideo } = useDocument({ documentId: videoDocId, documentType: 'productVideo' })
  const video = rawVideo as VideoDoc | undefined | null
  if (!video) return null

  const statusStyle =
    video.status === 'ready'     ? styles.videoReady :
    video.status === 'rendering' ? styles.videoRendering : styles.videoFailed

  const statusLabel =
    video.status === 'ready'     ? '✓ Video Ready' :
    video.status === 'rendering' ? '⟳ Rendering…' :
    video.status === 'failed'    ? '✕ Render Failed' : '⋯ Pending'

  return (
    <div className={styles.videoBox}>
      <div className={cx(styles.videoStatus, statusStyle)}>{statusLabel}</div>
      {video.renderedAt && (
        <div className={styles.videoMeta}>
          Rendered {new Date(video.renderedAt).toLocaleString()}
        </div>
      )}
      {video.errorMessage && (
        <div className={cx(styles.videoMeta, styles.videoFailed)}>{video.errorMessage}</div>
      )}
      {video.status === 'ready' && video.videoUrl && (
        <>
          <video
            className={styles.videoPlayer}
            controls
            preload="metadata"
            playsInline
            aria-label="Product promo video"
          >
            <source src={video.videoUrl} type="video/mp4" />
          </video>
          <a
            className={styles.videoLink}
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open video in a new tab
          </a>
        </>
      )}
    </div>
  )
}

const LATEST_AUDIT = `*[_type == "auditReport" && references($id)] | order(auditedAt desc)[0]`

function ActivePanel({ selectedId }: { selectedId: string }) {
  const { data: rawProduct } = useDocument({ documentId: selectedId, documentType: 'product' })
  const { data: latestAudit } = useQuery<AuditReport | null>({
    query: LATEST_AUDIT,
    params: { id: selectedId },
  })

  const [auditing, setAuditing] = useState(false)
  const [applyingSuggestions, setApplyingSuggestions] = useState(false)

  const product = rawProduct as SanityProduct | null
  const score = product?.amazonChannel?.readinessScore ?? null

  const handleRunAudit = async () => {
    setAuditing(true)
    try {
      const res = await fetch(`${API_BASE}/api/agent/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: product?.sku, documentId: selectedId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Audit failed: ${err.error ?? res.statusText}`)
      }
    } catch (err) {
      alert(`Failed to run audit: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAuditing(false)
    }
  }

  // Applying suggestions changes the product's content, not its position in the
  // pipeline, so it is a document write rather than a workflow transition. It
  // goes through the API so the patch lands on the published document — the one
  // the rule engine reads back when it re-audits.
  const handleApplySuggestions = async () => {
    if (!latestAudit) return
    setApplyingSuggestions(true)
    try {
      const res = await fetch(`${API_BASE}/api/product/apply-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: selectedId, reportId: latestAudit._id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Apply failed: ${err.error ?? res.statusText}`)
        return
      }
      await handleRunAudit()
    } catch (err) {
      alert(`Apply failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setApplyingSuggestions(false)
    }
  }

  return (
    <div className={styles.panel}>
      {product && (
        <>
          <div className={styles.name}>{product.name}</div>
          <div className={styles.sku}>{product.sku}</div>

          <div className={styles.meta}>
            <div>
              <div className={styles.metaLabel}>Category</div>
              <div className={styles.metaValue}>{product.sfccCategory || '—'}</div>
            </div>
            <div>
              <div className={styles.metaLabel}>Price</div>
              <div className={styles.metaValue}>
                {product.price != null ? `$${product.price.toFixed(2)}` : '—'}
              </div>
            </div>
            <div>
              <div className={styles.metaLabel}>Type</div>
              <div className={styles.metaValue}>{product.productKind || '—'}</div>
            </div>
            <div>
              <div className={styles.metaLabel}>Amazon Category</div>
              <div className={styles.metaValue}>{product.amazonChannel?.amazonCategory || '—'}</div>
            </div>
          </div>

          {score !== null && (
            <div className={styles.scoreRow}>
              <div className={cx(styles.scoreBig, scoreClass(score, styles))}>
                {score}
              </div>
              <div className={styles.scoreLabel}>Readiness Score<br />out of 100</div>
            </div>
          )}
        </>
      )}

      {/* Stage and every stage-changing control. The thresholds that gate these
          live in sanity.workflow.ts, not here. */}
      <WorkflowPanel productId={selectedId} />

      {latestAudit && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Audit Issues ({latestAudit.issues?.length ?? 0})
          </div>
          {latestAudit.issues?.slice(0, 5).map((issue, i) => (
            <div key={i} className={cx(
              styles.issue,
              issue.severity === 'suppressible' ? styles.issueSupp :
              issue.severity === 'optimisation' ? styles.issueOpt : styles.issueInfo
            )}>
              <strong>{issue.ruleId}</strong> · {issue.field}: {issue.message}
            </div>
          ))}
          {(latestAudit.issues?.length ?? 0) > 5 && (
            <div className={styles.scoreLabel}>
              +{(latestAudit.issues?.length ?? 0) - 5} more issues
            </div>
          )}
          {latestAudit.agentNotes && (
            <div className={styles.agentNotes}>{latestAudit.agentNotes}</div>
          )}
        </div>
      )}

      {latestAudit && (latestAudit.suggestedMetaTitle || latestAudit.suggestedMetaDescription || latestAudit.suggestedBulletPoints?.length || latestAudit.suggestedBackendTerms) && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>AI Recommendations</div>
          {latestAudit.suggestedMetaTitle && (
            <div className={styles.recBlock}>
              <div className={styles.recLabel}>Meta Title</div>
              <div className={styles.recValue}>{latestAudit.suggestedMetaTitle}</div>
            </div>
          )}
          {latestAudit.suggestedMetaDescription && (
            <div className={styles.recBlock}>
              <div className={styles.recLabel}>Meta Description</div>
              <div className={styles.recValue}>{latestAudit.suggestedMetaDescription}</div>
            </div>
          )}
          {latestAudit.suggestedBulletPoints && latestAudit.suggestedBulletPoints.length > 0 && (
            <div className={styles.recBlock}>
              <div className={styles.recLabel}>Bullet Points</div>
              <ul className={styles.recList}>
                {latestAudit.suggestedBulletPoints.map((b, i) => (
                  <li key={i} className={styles.recListItem}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {latestAudit.suggestedBackendTerms && (
            <div className={styles.recBlock}>
              <div className={styles.recLabel}>Backend Search Terms</div>
              <div className={styles.recMono}>{latestAudit.suggestedBackendTerms}</div>
            </div>
          )}
          <button
            className={cx(styles.btn, styles.btnApply)}
            onClick={handleApplySuggestions}
            disabled={applyingSuggestions || auditing}
          >
            {applyingSuggestions ? 'Applying…' : 'Apply AI Suggestions & Re-audit'}
          </button>
        </div>
      )}

      {product?.productVideo?._ref && (
        <Suspense fallback={null}>
          <VideoStatus videoDocId={product.productVideo._ref} />
        </Suspense>
      )}

      <div className={styles.actions}>
        <button
          className={cx(styles.btn, styles.btnPrimary)}
          onClick={handleRunAudit}
          disabled={auditing}
        >
          {auditing ? 'Running Audit…' : 'Run Audit'}
        </button>
      </div>
    </div>
  )
}
