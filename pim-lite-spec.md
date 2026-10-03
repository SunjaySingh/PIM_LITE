# PIM-Lite: Product Intelligence Manager
## Full Project Specification — Sanity Challenge Submission (Path Two)

**Built with:** Sanity Studio + App SDK · Sanity Workflows (official pre-release) · Next.js 15 · Mastra · Remotion · StyleX  
**Submitted by:** Sunjay  
**Deadline:** October 4, 2026  
**Challenge:** dev.to Sanity Challenge — Path Two: Vibe-Code Something Strange  
**IDE:** VS Code + Claude Code plugin  

---

## 1. What We're Building

A PIM-lite (Product Information Manager) that:

1. **Imports** a real SFCC product export CSV (4,777 products) into Sanity
2. **Audits** each product against Amazon channel readiness rules via a Mastra AI agent
3. **Surfaces issues** in a real-time App SDK dashboard built with StyleX
4. **Moves products** through official Sanity Workflows: `draft → audit_pending → audit_passed → video_requested → video_ready → published`
5. **Generates product promo videos** via Remotion when a product hits `video_requested`
6. **Writes everything back** to Sanity — audit reports, video status, workflow state

The "strange" thing: a product's generated video changes when you fix its Amazon issues. Fix the description → re-audit → workflow advances → Remotion re-renders with corrected copy.

---

## 2. Repository Structure

**Single Next.js app — no monorepo.** Everything co-located. Run `pnpm dev` and you get Next.js + embedded Sanity Studio together.

```
pim-lite/
├── app/
│   ├── (studio)/
│   │   └── studio/[[...tool]]/
│   │       └── page.tsx              # Embedded Sanity Studio at /studio
│   ├── products/
│   │   ├── page.tsx                  # Product grid
│   │   └── [sku]/page.tsx            # Product detail
│   └── api/
│       ├── agent/audit/route.ts      # POST — triggers Mastra audit agent
│       └── remotion/render/route.ts  # POST — Sanity webhook → Remotion render
├── sanity/
│   ├── schemas/
│   │   ├── product.ts
│   │   ├── auditReport.ts
│   │   ├── productVideo.ts
│   │   ├── colorMapping.ts
│   │   └── sizeMapping.ts
│   ├── workflow.ts                   # Official Sanity Workflows definition
│   ├── lib/
│   │   └── client.ts                 # Sanity client (shared)
│   └── sanity.config.ts              # Studio config + App SDK dashboard tool
├── agent/
│   └── auditAgent.ts                 # Mastra agent
├── remotion/
│   ├── Root.tsx
│   └── compositions/
│       └── ProductPromo.tsx          # 15-second promo composition
├── components/
│   └── pim-dashboard/
│       ├── PimDashboard.tsx          # App SDK custom tool (main)
│       ├── KanbanBoard.tsx
│       ├── ProductDetailPanel.tsx
│       └── StatsPanel.tsx
├── styles/
│   └── tokens.stylex.ts              # StyleX design tokens
├── scripts/
│   ├── import-csv.ts                 # One-time SFCC import
│   └── seed-mappings.ts              # Colour/size code seed
├── sanity.cli.ts
├── next.config.ts                    # includes StyleX + Sanity Next plugin
└── package.json
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Single app — Studio embedded via `next-sanity` |
| Content platform | Sanity | Dataset + Studio + App SDK |
| Workflow engine | Sanity Workflows (official) | `@sanity/workflow-engine` v0.33+ pre-release |
| CSS | StyleX (`@stylexjs/stylex`) | Used for custom components only — not inside Studio |
| Agent framework | Mastra | Runs as API route + CLI script |
| LLM | OpenAI GPT-OSS 120B via OpenRouter | `@ai-sdk/openai` + OpenRouter (`openai/gpt-oss-120b`) — Gemini was attempted but did not work |
| Video | Remotion | Local CLI render for demo; Remotion Lambda for prod |
| Language | TypeScript strict | Throughout |
| Package manager | pnpm | Single lockfile, no workspaces |

---

## 4. StyleX Setup

### Install

```bash
pnpm add @stylexjs/stylex
pnpm add -D @stylexjs/nextjs-plugin @stylexjs/babel-plugin
```

### next.config.ts

```typescript
import type { NextConfig } from 'next'
const stylexPlugin = require('@stylexjs/nextjs-plugin')

const nextConfig: NextConfig = {
  // Sanity Studio needs transpilePackages
  transpilePackages: ['sanity', 'next-sanity'],
}

export default stylexPlugin({
  // StyleX options
  rootDir: __dirname,
})(nextConfig)
```

### styles/tokens.stylex.ts (design tokens)

```typescript
import * as stylex from '@stylexjs/stylex'

export const colors = stylex.defineVars({
  // Status colours
  scoreHigh:   '#22c55e',  // green-500
  scoreMid:    '#eab308',  // yellow-500
  scoreLow:    '#ef4444',  // red-500
  // Workflow state colours
  stateDraft:       '#94a3b8',
  stateAuditPending:'#f59e0b',
  stateAuditPassed: '#22c55e',
  stateVideoReq:    '#3b82f6',
  stateVideoReady:  '#8b5cf6',
  statePublished:   '#10b981',
  // Surface
  surface:     '#ffffff',
  surfaceAlt:  '#f8fafc',
  border:      '#e2e8f0',
  text:        '#0f172a',
  textMuted:   '#64748b',
})

export const spacing = stylex.defineVars({
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
})

export const typography = stylex.defineVars({
  fontMono: "'JetBrains Mono', monospace",
  fontSans: "Inter, system-ui, sans-serif",
})
```

StyleX is only used in `components/pim-dashboard/**` and `app/products/**`. Inside `sanity.config.ts` and Studio components, use Sanity UI (`@sanity/ui`) as Sanity expects.

---

## 5. Sanity Schema

### 5.1 `product`

```typescript
// sanity/schemas/product.ts
import { defineType, defineField } from 'sanity'

export const product = defineType({
  name: 'product',
  type: 'document',
  title: 'Product',
  fields: [
    // — Source fields (from SFCC CSV) —
    defineField({ name: 'sku',             type: 'string',   title: 'SKU',            validation: r => r.required() }),
    defineField({ name: 'sfccId',          type: 'string',   title: 'SFCC ID' }),
    defineField({ name: 'name',            type: 'string',   title: 'Product Name',   validation: r => r.required() }),
    defineField({ name: 'longDescription', type: 'text',     title: 'Long Description' }),
    defineField({ name: 'sfccCategory',    type: 'string',   title: 'SFCC Category' }),
    defineField({ name: 'price',           type: 'number',   title: 'Price (USD)' }),
    defineField({ name: 'onlineFlag',      type: 'boolean',  title: 'Online' }),
    defineField({ name: 'productKind',     type: 'string',   title: 'Product Kind',
      options: { list: ['master', 'variant'] } }),
    defineField({ name: 'lastModified',    type: 'datetime', title: 'Last Modified' }),

    // — Variant fields —
    defineField({ name: 'color',        type: 'string', title: 'Color Code (SFCC)' }),
    defineField({ name: 'colorDisplay', type: 'string', title: 'Color (Display)' }),
    defineField({ name: 'size',         type: 'string', title: 'Size Code (SFCC)' }),
    defineField({ name: 'sizeDisplay',  type: 'string', title: 'Size (Display)' }),

    // — Amazon channel —
    defineField({
      name: 'amazonChannel',
      type: 'object',
      title: 'Amazon Channel',
      fields: [
        defineField({ name: 'gtin',               type: 'string', title: 'GTIN / UPC / EAN' }),
        defineField({ name: 'brand',              type: 'string', title: 'Brand' }),
        defineField({ name: 'amazonCategory',     type: 'string', title: 'Amazon Product Type' }),
        defineField({ name: 'condition',          type: 'string', title: 'Condition',
          options: { list: ['New', 'Used', 'Refurbished', 'Collectible'] } }),
        defineField({ name: 'bulletPoint1',       type: 'string', title: 'Bullet Point 1' }),
        defineField({ name: 'bulletPoint2',       type: 'string', title: 'Bullet Point 2' }),
        defineField({ name: 'bulletPoint3',       type: 'string', title: 'Bullet Point 3' }),
        defineField({ name: 'bulletPoint4',       type: 'string', title: 'Bullet Point 4' }),
        defineField({ name: 'bulletPoint5',       type: 'string', title: 'Bullet Point 5' }),
        defineField({ name: 'metaTitle',          type: 'string', title: 'Meta Title (≤60 chars)' }),
        defineField({ name: 'metaDescription',    type: 'text',   title: 'Meta Description (≤160 chars)' }),
        defineField({ name: 'backendSearchTerms', type: 'string', title: 'Backend Search Terms (≤250 bytes)' }),
        defineField({ name: 'materialType',       type: 'string', title: 'Material Type' }),
        defineField({ name: 'department',         type: 'string', title: 'Department',
          options: { list: ['Womens', 'Mens', 'Unisex', 'Girls', 'Boys', 'Baby'] } }),
        defineField({ name: 'imageUrl',           type: 'url',    title: 'Main Image URL' }),
        defineField({ name: 'safetyCertNumber',   type: 'string', title: 'Safety Cert No. (2026)' }),
        defineField({ name: 'sustainabilityAttrs',type: 'string', title: 'Sustainability Attributes (2026)' }),
        defineField({ name: 'readinessScore',     type: 'number', title: 'Amazon Readiness Score (0–100)', readOnly: true }),
      ],
    }),

    // — References —
    defineField({ name: 'auditReport',  type: 'reference', to: [{ type: 'auditReport' }],  title: 'Latest Audit' }),
    defineField({ name: 'productVideo', type: 'reference', to: [{ type: 'productVideo' }], title: 'Generated Video' }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'sfccCategory', score: 'amazonChannel.readinessScore' },
    prepare({ title, subtitle, score }) {
      const emoji = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴'
      return { title: `${emoji} ${title}`, subtitle: `${subtitle} · Score: ${score ?? '—'}` }
    },
  },
})
```

### 5.2 `auditReport`

```typescript
export const auditReport = defineType({
  name: 'auditReport',
  type: 'document',
  fields: [
    defineField({ name: 'product',      type: 'reference', to: [{ type: 'product' }], validation: r => r.required() }),
    defineField({ name: 'auditedAt',    type: 'datetime' }),
    defineField({ name: 'overallScore', type: 'number' }),
    defineField({
      name: 'issues',
      type: 'array',
      of: [{ type: 'object', fields: [
        defineField({ name: 'ruleId',    type: 'string' }),
        defineField({ name: 'field',     type: 'string' }),
        defineField({ name: 'severity',  type: 'string',
          options: { list: ['suppressible', 'optimisation', 'info'] } }),
        defineField({ name: 'message',   type: 'text' }),
      ]}],
    }),
    defineField({ name: 'suggestedMetaTitle',       type: 'string' }),
    defineField({ name: 'suggestedMetaDescription', type: 'text' }),
    defineField({ name: 'suggestedBulletPoints',    type: 'array', of: [{ type: 'string' }] }),
    defineField({ name: 'suggestedBackendTerms',    type: 'string' }),
    defineField({ name: 'agentNotes',               type: 'text' }),
  ],
})
```

### 5.3 `productVideo`

```typescript
export const productVideo = defineType({
  name: 'productVideo',
  type: 'document',
  fields: [
    defineField({ name: 'product',      type: 'reference', to: [{ type: 'product' }] }),
    defineField({ name: 'status',       type: 'string',
      options: { list: ['pending', 'rendering', 'ready', 'failed'] } }),
    defineField({ name: 'videoUrl',     type: 'url' }),
    defineField({ name: 'thumbnailUrl', type: 'url' }),
    defineField({ name: 'renderedAt',   type: 'datetime' }),
    defineField({ name: 'durationSecs', type: 'number' }),
    defineField({ name: 'scriptUsed',   type: 'text', title: 'Agent-generated script' }),
    defineField({ name: 'errorMessage', type: 'string', readOnly: true }),
  ],
})
```

### 5.4 `colorMapping` and `sizeMapping`

```typescript
export const colorMapping = defineType({
  name: 'colorMapping', type: 'document',
  fields: [
    defineField({ name: 'sfccCode',    type: 'string', title: 'SFCC Code (e.g. JJI15XX)' }),
    defineField({ name: 'displayName', type: 'string', title: 'Display Name (e.g. Navy)' }),
    defineField({ name: 'amazonEnum',  type: 'string', title: 'Amazon Enum (e.g. Navy Blue)' }),
    defineField({ name: 'hexValue',    type: 'string', title: 'Hex' }),
  ],
})

export const sizeMapping = defineType({
  name: 'sizeMapping', type: 'document',
  fields: [
    defineField({ name: 'sfccCode',    type: 'string', title: 'SFCC Code (e.g. 9LG)' }),
    defineField({ name: 'displayName', type: 'string', title: 'Display Name (e.g. Large)' }),
    defineField({ name: 'amazonEnum',  type: 'string', title: 'Amazon Enum (e.g. L)' }),
  ],
})
```

---

## 6. Official Sanity Workflows Definition

**File:** `sanity/workflow.ts`

The Workflows definition is TypeScript, deployed with the CLI. It runs on Sanity's infrastructure — no server required. Transitions can trigger **effects** (our Remotion webhook). Guards are GROQ expressions that must be true before a transition can fire.

```typescript
// sanity/workflow.ts
import { defineWorkflows } from '@sanity/workflow-engine'

export default defineWorkflows({
  name: 'product-publishing',
  expectedMinReaderModel: 4,

  // The Sanity dataset where workflow instances are stored
  workflowResource: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  },

  definitions: [
    {
      name: 'amazon-readiness',
      title: 'Amazon Readiness Pipeline',

      // Subject = the product document this workflow instance tracks
      subject: {
        type: 'subject',
        documentType: 'product',
      },

      stages: [
        {
          name: 'draft',
          title: 'Draft',
          activities: [
            {
              name: 'submit-for-audit',
              title: 'Submit for Audit',
              actions: [
                {
                  name: 'send-to-audit',
                  title: 'Send to Audit',
                  transition: 'to-audit-pending',
                },
              ],
            },
          ],
        },

        {
          name: 'audit-pending',
          title: 'Audit Pending',
          // Effect fires when entering this stage:
          // calls our API route which runs the Mastra agent
          onEnter: {
            effects: [
              {
                name: 'trigger-audit-agent',
                type: 'http',
                url: `${process.env.NEXT_PUBLIC_APP_URL}/api/agent/audit`,
                method: 'POST',
                // Workflow engine sends the subject document ID in the body
                body: { documentId: '$subject._id', sku: '$subject.sku' },
                retry: { attempts: 3, waitMs: 5000 },
              },
            ],
          },
          activities: [
            {
              name: 'awaiting-agent',
              title: 'Awaiting Agent',
              // No human actions — agent drives this transition via API
            },
          ],
        },

        {
          name: 'audit-passed',
          title: 'Audit Passed',
          // Guard: only enter this stage if readiness score >= 50
          guard: `$subject.amazonChannel.readinessScore >= 50`,
          activities: [
            {
              name: 'request-video',
              title: 'Request Video',
              actions: [
                {
                  name: 'generate-video',
                  title: 'Generate Video',
                  transition: 'to-video-requested',
                },
                {
                  name: 'return-to-draft',
                  title: 'Return to Draft',
                  transition: 'back-to-draft-from-passed',
                },
              ],
            },
          ],
        },

        {
          name: 'video-requested',
          title: 'Video Requested',
          onEnter: {
            effects: [
              {
                name: 'trigger-remotion-render',
                type: 'http',
                url: `${process.env.NEXT_PUBLIC_APP_URL}/api/remotion/render`,
                method: 'POST',
                body: { documentId: '$subject._id', sku: '$subject.sku' },
                retry: { attempts: 2, waitMs: 10000 },
              },
            ],
          },
          activities: [
            {
              name: 'rendering',
              title: 'Rendering Video',
              // Remotion route advances workflow to video-ready via API on completion
            },
          ],
        },

        {
          name: 'video-ready',
          title: 'Video Ready',
          activities: [
            {
              name: 'human-approval',
              title: 'Human Approval',
              actions: [
                {
                  name: 'approve-publish',
                  title: 'Approve & Publish',
                  transition: 'to-published',
                },
                {
                  name: 're-render',
                  title: 'Re-render Video',
                  transition: 'back-to-video-requested',
                },
              ],
            },
          ],
        },

        {
          name: 'published',
          title: 'Published',
          // Terminal stage — publish the Sanity document
          onEnter: {
            operations: [
              { type: 'publish', documentId: '$subject._id' },
            ],
          },
        },
      ],

      transitions: [
        { name: 'to-audit-pending',          from: 'draft',          to: 'audit-pending' },
        { name: 'to-audit-passed',           from: 'audit-pending',  to: 'audit-passed' },
        { name: 'back-to-draft-from-audit',  from: 'audit-pending',  to: 'draft' },
        { name: 'to-video-requested',        from: 'audit-passed',   to: 'video-requested' },
        { name: 'back-to-draft-from-passed', from: 'audit-passed',   to: 'draft' },
        { name: 'to-video-ready',            from: 'video-requested',to: 'video-ready' },
        { name: 'back-to-video-requested',   from: 'video-ready',    to: 'video-requested' },
        { name: 'to-published',              from: 'video-ready',    to: 'published' },
      ],
    },
  ],
})
```

### Deploy the workflow

```bash
pnpm dlx sanity-workflows deploy --deployment amazon-readiness-prod
```

### Studio plugin setup

```typescript
// sanity/sanity.config.ts — add to plugins array
import { workflowsPlugin } from '@sanity/workflow-react'

plugins: [
  workflowsPlugin(),   // adds the Workflows tool to Studio
]
```

---

## 7. App SDK Dashboard

**File:** `components/pim-dashboard/PimDashboard.tsx`

Registered as a custom Studio tool. StyleX handles all styling.

```typescript
// sanity/sanity.config.ts
import { PimDashboard } from '../components/pim-dashboard/PimDashboard'

tools: (prev) => [
  ...prev,
  {
    name: 'pim-dashboard',
    title: 'PIM Dashboard',
    icon: BarChartIcon,
    component: PimDashboard,
  },
]
```

### Styles (StyleX example)

```typescript
// components/pim-dashboard/PimDashboard.stylex.ts
import * as stylex from '@stylexjs/stylex'
import { colors, spacing } from '../../styles/tokens.stylex'

export const styles = stylex.create({
  layout: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr 260px',
    gap: spacing.md,
    height: '100vh',
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    overflowY: 'auto',
  },
  scoreHigh: { color: colors.scoreHigh, fontWeight: 700 },
  scoreMid:  { color: colors.scoreMid,  fontWeight: 700 },
  scoreLow:  { color: colors.scoreLow,  fontWeight: 700 },
})
```

### Dashboard layout (three columns)

**Left — Workflow Kanban**
One swimlane per workflow stage. Each product card shows:
- Product name
- Amazon readiness score badge (colour from StyleX token)
- Category pill
- "Run Audit" shortcut button

Cards are grouped by their Workflows instance current stage, fetched via `useDocuments`.

**Centre — Product Detail Panel**
Opens on card click. Shows:
- Full audit report: issues by severity (suppressible = red, optimisation = amber, info = grey)
- Agent suggestions inline with "Apply" button (calls `useEditDocument` patch)
- "Run Audit" button → `POST /api/agent/audit { sku }`
- "Generate Video" button → fires workflow action `generate-video` via Workflows SDK

**Right — Stats Panel**
Real-time via `useDocuments`:
- Products by stage (live count)
- Average Amazon readiness score
- Top 5 issue types across catalogue
- Count of suppressible issues (blocks listing)

### App SDK hooks

```typescript
import { useDocuments, useDocument, useEditDocument } from '@sanity/sdk-react'
import { useWorkflowSession } from '@sanity/workflow-react'

// All products — live updates
const { data: products } = useDocuments({
  filter: '*[_type == "product"]',
  projection: `{
    _id, sku, name, sfccCategory,
    "score": amazonChannel.readinessScore,
    "auditIssues": auditReport->issues
  }`
})

// Edit a product — apply agent suggestion
const { patch } = useEditDocument({ documentId: product._id })
await patch({ set: { 'amazonChannel.metaTitle': suggestion } })

// Workflow session for a product
const session = useWorkflowSession({ documentId: product._id })
// session.stage, session.availableActions, session.fireAction(...)
```

---

## 8. Mastra Audit Agent

**File:** `agent/auditAgent.ts`

### Two Mastra tools

```typescript
import { createTool } from '@mastra/core'
import { createSanityClient } from '../sanity/lib/client'

const queryProducts = createTool({
  name: 'queryProducts',
  description: 'Fetch products from Sanity that need auditing',
  // ... fetches by SKU or all in audit_pending workflow state
})

const writeAuditReport = createTool({
  name: 'writeAuditReport',
  description: 'Write audit report back to Sanity and update readiness score',
  // ... creates/updates auditReport document, patches amazonChannel.readinessScore
  // ... calls POST /api/workflows/advance to fire the workflow transition
})
```

### Audit rules

Starting score: **100**. Deducted per issue found.

| Severity | Points deducted |
|---|---|
| Suppressible (blocks Amazon listing) | −15 |
| Optimisation (degrades performance) | −5 |
| Info (2026 new fields) | −2 |

#### Universal rules (all products)

| ID | Field | Check | Severity |
|---|---|---|---|
| R001 | `amazonChannel.gtin` | Present | suppressible |
| R002 | `amazonChannel.brand` | Present | suppressible |
| R003 | `name` | 10–200 chars | suppressible |
| R004 | `name` | ≤80 chars (mobile) | optimisation |
| R005 | `name` | No banned chars (`!$?_`) | suppressible |
| R006 | `longDescription` | Present, >150 chars | suppressible |
| R007 | `longDescription` | >300 chars (quality) | optimisation |
| R008 | `longDescription` | Ends with sentence punctuation (truncation check) | suppressible |
| R009 | `amazonChannel.bulletPoint1` | At least 1 bullet | suppressible |
| R010 | `amazonChannel.bulletPoint1–3` | At least 3 bullets | optimisation |
| R011 | `amazonChannel.imageUrl` | Present, valid URL | suppressible |
| R012 | `price` | Present, > 0 | suppressible |
| R013 | `price` | Not suspiciously large (>10k for non-luxury category) | info |
| R014 | `amazonChannel.condition` | Present | suppressible |
| R015 | `amazonChannel.amazonCategory` | Present | suppressible |
| R016 | `amazonChannel.metaTitle` | Present, ≤60 chars | optimisation |
| R017 | `amazonChannel.metaDescription` | Present, ≤160 chars | optimisation |
| R018 | `amazonChannel.backendSearchTerms` | Present, ≤250 bytes | optimisation |
| R019 | `colorDisplay` | Resolved (not raw SFCC code) | optimisation |
| R020 | `sizeDisplay` | Resolved (not raw SFCC code) | optimisation |

#### Category-specific rules

**Apparel (SHIRT, SUIT):** materialType required (suppressible), department required (suppressible), colorDisplay must be valid Amazon enum — not hex, not marketing name (suppressible)

**Beauty (BEAUTY, FRAGRANCE):** description should reference ingredients or skin type (optimisation)

**Accessories (JEWELRY, HANDBAG, WATCH, SHOES):** materialType recommended (optimisation)

**2026 compliance (all):** safetyCertNumber missing (info), sustainabilityAttrs missing (info)

### Score → Workflow transition

The agent calls the Workflows API to fire a transition after writing the audit report:

```typescript
// agent fires transition via Workflows SDK after writing report
import { createWorkflowEngine } from '@sanity/workflow-engine'

const engine = createWorkflowEngine({ client: sanityClient })

if (score >= 50) {
  await engine.fireAction({
    instanceId: workflowInstanceId,
    action: 'send-to-audit-passed',  // custom direct transition
  })
} else {
  await engine.fireAction({
    instanceId: workflowInstanceId,
    action: 'back-to-draft-from-audit',
  })
}
```

### Agent also generates (LLM call)

For products scoring below 70 or missing SEO fields, the LLM (GPT-OSS 120B via OpenRouter) generates:
- `suggestedMetaTitle` — Amazon-optimised, brand-first, ≤60 chars
- `suggestedMetaDescription` — ≤160 chars
- `suggestedBulletPoints` — 3–5 benefit-led bullets from existing description
- `suggestedBackendTerms` — synonyms + search terms, ≤250 bytes

### Running modes

```bash
# Audit all products in audit_pending workflow stage (called by Workflows effect)
pnpm tsx agent/auditAgent.ts --mode=batch

# Audit one product by SKU (called by dashboard "Run Audit" button)
pnpm tsx agent/auditAgent.ts --mode=single --sku=008884303989M
```

Also exposed as `POST /api/agent/audit` — body: `{ sku?: string, mode: 'single' | 'batch' }`.

---

## 9. Remotion Video

**File:** `remotion/compositions/ProductPromo.tsx`

### Composition

15 seconds · 1920×1080 · 30fps (450 frames)

| Frames | Duration | Content |
|---|---|---|
| 0–60 | 2s | Brand intro — logo fade on category-colour background |
| 61–180 | 4s | Product name + category — large type, fade up |
| 181–300 | 4s | 3 bullet points — stagger animate in |
| 301–390 | 3s | Product image + price |
| 391–450 | 2s | CTA — "Shop Now" + meta title |

Props fed from Sanity at render time:
`name`, `amazonChannel.bulletPoint1–3`, `amazonChannel.metaTitle`, `amazonChannel.imageUrl`, `price`, `sfccCategory`

### Render trigger

**File:** `app/api/remotion/render/route.ts`

The Workflows engine calls this when a product enters `video-requested` stage:

```typescript
export async function POST(request: Request) {
  const { documentId, sku } = await request.json()

  // 1. Validate Workflows engine signature
  // 2. Fetch product data from Sanity
  // 3. Shell out to Remotion CLI
  const { execSync } = await import('child_process')
  execSync(
    `npx remotion render ProductPromo output/video-${sku}.mp4 ` +
    `--props='${JSON.stringify(productProps)}'`
  )
  // 4. Upload MP4 to Sanity Media Library
  // 5. Update productVideo document: { status: 'ready', videoUrl, renderedAt }
  // 6. Fire workflow transition: to-video-ready
  await engine.fireAction({ instanceId, action: 'mark-video-ready' })

  return Response.json({ ok: true })
}
```

**Demo note:** Local CLI render for the submission. Production path = Remotion Lambda. Document this honestly in the writeup — it strengthens the Path Two narrative.

---

## 10. CSV Import Script

**File:** `scripts/import-csv.ts`

Run once: `pnpm tsx scripts/import-csv.ts`

What it does:
1. Reads CSV with `papaparse`
2. Normalises each row:
   - Looks up colour/size codes against `colorMapping`/`sizeMapping` in Sanity; unresolved codes left as-is (agent flags them)
   - If `amount > 10,000` and category is not `jewelry`/`watches`, divides by 100 (suspected cents), sets `priceNormalised: true`
   - Maps SFCC category to `amazonChannel.amazonCategory` via lookup table
   - Sets all products to workflow `draft` state — starts a Workflows instance per product via `engine.startWorkflow()`
3. Batches mutations (50 at a time) via `client.transaction()`
4. Logs: imported, skipped, errors

### SFCC → Amazon category mapping

```typescript
const CATEGORY_MAP: Record<string, string> = {
  dresses:           'SHIRT',
  mencasuals:        'SHIRT',
  suits:             'SUIT',
  beauty:            'BEAUTY',
  skincare:          'BEAUTY',
  perfurme:          'FRAGRANCE',  // typo in source — handle both spellings
  perfume:           'FRAGRANCE',
  jewelry:           'JEWELRY',
  watches:           'WATCH',
  shoes:             'SHOES',
  accessories:       'ACCESSORY',
  handbags:          'HANDBAG',
  electronics:       'CONSUMER_ELECTRONICS',
  toys:              'TOY',
  petsCollection:    'PET_SUPPLIES',
  holidayCollection: 'GIFT',
}
```

---

## 11. Environment Variables

```bash
# .env.local

# Sanity
NEXT_PUBLIC_SANITY_PROJECT_ID=
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2026-09-18
SANITY_API_TOKEN=            # Editor role minimum — agent needs write access

# Sanity Workflows
SANITY_WORKFLOW_SECRET=      # For validating inbound Workflows effect calls

# AI (OpenRouter — Gemini was attempted but did not work)
OPENROUTER_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Remotion
REMOTION_OUTPUT_DIR=./output
```

---

## 12. Setup & Run Order (hand to Claude Code in this order)

```
1.  pnpm create next-app@latest pim-lite --typescript --tailwind=false --app
2.  cd pim-lite
3.  pnpm add sanity next-sanity @sanity/sdk-react @sanity/ui
4.  pnpm add @sanity/workflow-engine @sanity/workflow-react @sanity/workflow-sdk
5.  pnpm add @stylexjs/stylex && pnpm add -D @stylexjs/nextjs-plugin @stylexjs/babel-plugin
6.  pnpm add @mastra/core @ai-sdk/openai  # Using OpenRouter; Gemini (@ai-sdk/google) did not work
7.  pnpm add remotion @remotion/cli
8.  pnpm add papaparse && pnpm add -D @types/papaparse tsx
9.  Configure next.config.ts (StyleX plugin + transpilePackages for Sanity)
10. Define all schemas (sanity/schemas/)
11. Configure Studio (sanity/sanity.config.ts) — embed at /studio, add PIM Dashboard tool, add Workflows plugin
12. Run: pnpm sanity schema deploy
13. Run: pnpm tsx scripts/seed-mappings.ts
14. Run: pnpm tsx scripts/import-csv.ts
15. Define workflow (sanity/workflow.ts)
16. Run: pnpm dlx sanity-workflows deploy --deployment amazon-readiness-prod
17. Verify products appear in Studio at /studio
18. Build App SDK dashboard components
19. Move 5 test products to audit_pending in Studio
20. Run: pnpm tsx agent/auditAgent.ts --mode=batch
21. Verify audit reports + scores appear in dashboard
22. Trigger video for one passing product via dashboard
23. Verify video appears at /products/[sku]
```

---

## 13. Demo Script (for submission video — ~4 mins)

| Segment | What to show | Duration |
|---|---|---|
| Import | CSV → `import-csv.ts` → products appear in Studio | 30s |
| Dashboard | All in draft. Move 5 to audit_pending. Run agent. Scores populate live. | 60s |
| Issue detail | Click low-score product. Show suppressible issues in red. Show agent suggestions. | 45s |
| Fix + re-audit | Apply suggested meta title. Re-run audit. Score improves. State → audit_passed. | 30s |
| Video | Click Generate Video. State → video_requested. Workflow fires effect → Remotion renders. State → video_ready. | 45s |
| Frontend | Open /products/[sku]. Video playing. Product data from Sanity. | 15s |

---

## 14. Known Data Issues — Disclose in Writeup

These honest disclosures strengthen the Path Two narrative:

- **4,777 products, 0 with GTINs.** Agent correctly flags all as suppressible. Production fix: barcode lookup API.
- **309 unique SFCC colour codes** like `JJI15XX` — none consumer-facing. Partial seed mapping; agent flags unresolved. Full resolution needs SFCC admin access.
- **80% of descriptions under Amazon quality threshold** (avg 122 chars). Makes agent LLM suggestions genuinely useful, not decorative.
- **Price normalisation is a heuristic.** Dividing >10k amounts by 100 is not guaranteed. Agent flags as `info`.
- **Remotion render is local CLI, not Lambda.** Production would use Remotion Lambda. Demo uses `npx remotion render`. This is the honest vibe-code story.
- **Workflows is pre-release (v0.33).** Using it anyway because the judges announced it last week and will specifically reward it. If a pre-release API changes mid-build, document it.

---

## 15. Submission Checklist

- [ ] Sanity project ID in post body
- [ ] App SDK dashboard demoed (bonus criterion #1)
- [ ] Official Sanity Workflows demoed (bonus criterion #2)
- [ ] Agent session transcript from Claude Code uploaded at dev.to/agent_sessions
- [ ] Transcript made public before submitting
- [ ] Transcript checked for API keys / secrets
- [ ] Cover image added
- [ ] Tags: `devchallenge`, `sanitychallenge`, `sanity`, `ai`
