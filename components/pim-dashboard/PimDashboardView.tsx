'use client'

import { Suspense, useState } from 'react'
import tokens from '../../styles/tokens.module.css'
import styles from './PimDashboard.module.css'
import { cx } from './cx'
import { API_BASE } from './apiBase'
import { KanbanBoard } from './KanbanBoard'
import { ProductDetailPanel } from './ProductDetailPanel'
import { StatsPanel } from './StatsPanel'

/**
 * The dashboard itself, with no opinion about which host it is in. The Studio
 * tool and the standalone App SDK route each wrap this with their own provider
 * stack (see PimDashboard and app/dashboard).
 */
export function PimDashboardView() {
  const [selected, setSelected] = useState<string | null>(null)
  const [showAudit, setShowAudit] = useState(false)
  const [auditSku, setAuditSku] = useState('')
  const [auditing, setAuditing] = useState(false)
  const [kanbanOpen, setKanbanOpen] = useState(true)

  const handleRunAudit = async () => {
    if (!auditSku.trim()) return
    setAuditing(true)
    try {
      const res = await fetch(`${API_BASE}/api/agent/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: auditSku.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Audit failed: ${(err as { error?: string }).error ?? res.statusText}`)
        return
      }
      setShowAudit(false)
      setAuditSku('')
    } catch (err) {
      console.error('Failed to run audit:', err)
      alert(`Failed to run audit: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAuditing(false)
    }
  }

  const gridCols = kanbanOpen ? '300px 1fr 260px' : '32px 1fr 260px'

  return (
    // tokens.tokens declares the design-token custom properties for the subtree
    <div className={cx(tokens.tokens, styles.layout)} style={{ gridTemplateColumns: gridCols }}>
      <div className={cx(styles.column, styles.kanbanCol)}>
        <div className={styles.collapseBar}>
          <button
            className={styles.collapseBtn}
            onClick={() => setKanbanOpen(o => !o)}
            title={kanbanOpen ? 'Collapse pipeline' : 'Expand pipeline'}
          >
            {kanbanOpen ? '‹' : '›'}
          </button>
        </div>
        {/* App SDK queries suspend on first load, so each live column owns a boundary */}
        {kanbanOpen && (
          <Suspense fallback={<div className={styles.column}>Loading pipeline…</div>}>
            <KanbanBoard onSelect={setSelected} />
          </Suspense>
        )}
      </div>

      <div className={styles.column}>
        <ProductDetailPanel selectedId={selected} />
      </div>

      <div className={styles.column}>
        <Suspense fallback={<div className={styles.column}>Loading stats…</div>}>
          <StatsPanel onRunAudit={() => setShowAudit(true)} />
        </Suspense>
      </div>

      {showAudit && (
        <div className={styles.modal} onClick={() => setShowAudit(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>Run Audit by SKU</div>
            <input
              className={styles.input}
              placeholder="Enter product SKU (e.g. ABC-123)"
              value={auditSku}
              onChange={e => setAuditSku(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRunAudit()}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowAudit(false)}>
                Cancel
              </button>
              <button className={styles.confirmBtn} onClick={handleRunAudit} disabled={auditing}>
                {auditing ? 'Running…' : 'Run Audit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
