import Link from 'next/link'
import type { Metadata } from 'next'
import tokens from '../styles/tokens.module.css'
import styles from './page.module.css'

export const metadata: Metadata = {
  title: 'PIM-Lite — Amazon readiness pipeline on Sanity',
  description:
    'A product information manager that audits an SFCC catalogue against Amazon channel rules with an AI agent, moves each product through a Sanity Workflow, and renders a promo video on approval.',
}

const STAGES = [
  { name: 'Draft', token: '--pim-state-draft' },
  { name: 'Audit Pending', token: '--pim-state-audit-pending' },
  { name: 'Human Review', token: '--pim-state-audit-pending' },
  { name: 'Audit Passed', token: '--pim-state-audit-passed' },
  { name: 'Video Requested', token: '--pim-state-video-req' },
  { name: 'Video Ready', token: '--pim-state-video-ready' },
  { name: 'Published', token: '--pim-state-published' },
]

export default function Home() {
  return (
    <div className={`${tokens.tokens} ${styles.page}`}>
      <main className={styles.main}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Sanity Challenge · Path Two</p>
          <h1 className={styles.title}>PIM-Lite</h1>
          <p className={styles.lede}>
            A product information manager for pushing an SFCC catalogue to Amazon.
            An AI agent audits each product against rules that live in Sanity as
            content, a Sanity Workflow moves it through review, and an approved
            product renders its own promo video.
          </p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>The pipeline</h2>
          <ol className={styles.stages}>
            {STAGES.map(stage => (
              <li key={stage.name} className={styles.stage}>
                <span
                  className={styles.stageDot}
                  style={{ backgroundColor: `var(${stage.token})` }}
                />
                {stage.name}
              </li>
            ))}
          </ol>
          <p className={styles.note}>
            Every move between these stages is a workflow transition — the audit
            agent and the human reviewer both advance a product the same way.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What is unusual here</h2>
          <ul className={styles.points}>
            <li>
              <strong>Audit rules are content, not code.</strong> The scoring
              engine reads its rules from Sanity at run time, so a merchandiser
              can add a check or change a severity without a deploy.
            </li>
            <li>
              <strong>The workflow calls out.</strong> Entering the audit stage
              queues an effect that our own handler drains, which runs a Mastra
              agent against Gemini and writes the report back as a document.
            </li>
            <li>
              <strong>Approval renders a video.</strong> Clearing review triggers
              a Remotion render whose copy comes from the audited product, and
              the finished video advances the workflow again.
            </li>
          </ul>
        </section>

        <nav className={styles.ctas} aria-label="Application entry points">
          <Link className={styles.primary} href="/dashboard">
            Open the PIM dashboard
          </Link>
          <Link className={styles.secondary} href="/studio">
            Open Sanity Studio
          </Link>
        </nav>

        <footer className={styles.footer}>
          The dashboard is a Sanity App SDK application. It also mounts inside
          the Studio as a custom tool — same components, either host.
        </footer>
      </main>
    </div>
  )
}
