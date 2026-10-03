'use client'

import styles from './KanbanBoard.module.css'
import { cx } from './cx'
import { API_BASE } from './apiBase'
import { useQuery } from '@sanity/sdk-react'
import { useMemo, useState } from 'react'
import { scoreClass } from './scoreClass'
import {
  NOT_STARTED,
  STAGE_META,
  STAGE_ORDER,
  WORKFLOW_DEFINITION,
  docIdFromGdr,
} from './stages'

interface SanityProduct {
  _id: string
  sku: string
  name: string
  sfccCategory: string
  price: number
  readinessScore?: number
}

interface InstanceRecord {
  _id: string
  currentStage: string
  subjectGdr: string | null
}

interface QueryResult {
  instances: InstanceRecord[]
  products: SanityProduct[]
}

const QUERY = `{
  "instances": *[_type == "sanity.workflow.instance" && definition == "${WORKFLOW_DEFINITION}"]{
    _id,
    currentStage,
    "subjectGdr": fields[_type == "subject"][0].value.id
  },
  "products": *[_type == "product" && productKind == "master"]{
    _id, sku, name, sfccCategory, price,
    "readinessScore": amazonChannel.readinessScore
  } | order(_updatedAt desc)[0...200]
}`

const ALWAYS_VISIBLE = new Set<string>([NOT_STARTED, 'draft'])

interface Props {
  onSelect: (id: string) => void
}

const ALL_OPEN = Object.fromEntries(STAGE_ORDER.map(s => [s, true])) as Record<string, boolean>

export function KanbanBoard({ onSelect }: Props) {
  const { data, isPending } = useQuery<QueryResult>({ query: QUERY })

  const instances = data?.instances ?? []
  const products = data?.products ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openStages, setOpenStages] = useState<Record<string, boolean>>(ALL_OPEN)
  const [auditingId, setAuditingId] = useState<string | null>(null)

  const toggleStage = (stage: string) =>
    setOpenStages(prev => ({ ...prev, [stage]: !prev[stage] }))

  // Same call the detail panel's Run Audit makes — sending documentId as well as
  // sku lets the route resolve the product even for the SKUs that repeat across
  // variants. The board is live, so the new score arrives on its own.
  const runAudit = async (product: SanityProduct) => {
    setAuditingId(product._id)
    try {
      const res = await fetch(`${API_BASE}/api/agent/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: product.sku, documentId: product._id }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        alert(`Audit failed: ${err.error ?? res.statusText}`)
      }
    } catch (err) {
      alert(`Failed to run audit: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAuditingId(null)
    }
  }

  const byStage = useMemo(() => {
    const map: Record<string, SanityProduct[]> = Object.fromEntries(
      STAGE_ORDER.map(s => [s, []])
    )

    const productIdToStage = new Map<string, string>()
    for (const instance of instances) {
      const docId = docIdFromGdr(instance.subjectGdr)
      if (docId) {
        productIdToStage.set(docId, instance.currentStage)
      }
    }

    for (const product of products) {
      const stage = productIdToStage.get(product._id)
      if (stage && map[stage] !== undefined) {
        map[stage].push(product)
      } else {
        map[NOT_STARTED].push(product)
      }
    }

    return map
  }, [instances, products])

  if (isPending && !products.length) {
    return <div className={styles.loading}>Loading pipeline…</div>
  }

  return (
    <div className={styles.board}>
      {STAGE_ORDER.map(stage => {
        const meta = STAGE_META[stage]
        const cards = byStage[stage] ?? []
        const isOpen = openStages[stage] ?? true

        if (cards.length === 0 && !ALWAYS_VISIBLE.has(stage)) return null

        return (
          <div key={stage} className={styles.stage}>
            <div className={styles.stageHeader} onClick={() => toggleStage(stage)}>
              <span className={styles.stageDot} style={{ backgroundColor: meta.color }} />
              <span className={styles.stageTitle}>{meta.label}</span>
              <span className={styles.stageBadge}>{cards.length}</span>
              <span className={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
            </div>
            {isOpen && cards.length === 0 && (
              <div className={styles.empty}>—</div>
            )}
            {isOpen && cards.map(product => {
              const score = product.readinessScore ?? null
              const isSelected = selectedId === product._id
              return (
                <div
                  key={product._id}
                  className={cx(styles.card, isSelected && styles.cardSelected)}
                  onClick={() => {
                    setSelectedId(product._id)
                    onSelect(product._id)
                  }}
                >
                  <div className={styles.cardName}>
                    {product.name ?? product._id}
                  </div>
                  <div className={styles.cardMeta}>
                    {product.sku ?? '—'} · {product.sfccCategory ?? '—'}
                  </div>
                  <div className={styles.cardFooter}>
                    {score !== null && (
                      <span className={cx(styles.scoreBadge, scoreClass(score, styles))}>
                        {score}/100
                      </span>
                    )}
                    {/* Selecting the card is the click the whole card owns, so
                        this one must not bubble up into it. */}
                    <button
                      className={styles.auditBtn}
                      disabled={auditingId === product._id}
                      onClick={e => {
                        e.stopPropagation()
                        runAudit(product)
                      }}
                    >
                      {auditingId === product._id ? 'Auditing…' : 'Run Audit'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
