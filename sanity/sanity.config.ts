import { defineConfig, type Tool } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
// @sanity/icons v5 ships each icon as its own subpath export.
import { BarChartIcon } from '@sanity/icons/BarChart'

import { product, auditReport, auditRule, productVideo, colorMapping, sizeMapping } from './schemas'
import { PimDashboard } from '../components/pim-dashboard/PimDashboard'

// Workflows — hooks via @sanity/workflow-studio; no separate plugin needed

// This config runs in two hosts with different env-var rules: Next.js inlines
// only NEXT_PUBLIC_* into the browser bundle, while the standalone Sanity CLI
// Studio (Vite) exposes only SANITY_STUDIO_*. Read both, preferring the one
// that works where the Studio is embedded. Referencing each var literally
// matters — Next only inlines static `process.env.X` lookups.
const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? process.env.SANITY_STUDIO_PROJECT_ID

const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET ?? process.env.SANITY_STUDIO_DATASET ?? 'production'

if (!projectId) {
  throw new Error(
    'Missing Sanity project ID. Set NEXT_PUBLIC_SANITY_PROJECT_ID (Next.js) or ' +
      'SANITY_STUDIO_PROJECT_ID (standalone Studio) in .env.local.',
  )
}

export default defineConfig({
  name: 'pim-lite',
  title: 'PIM-Lite',

  projectId,
  dataset,

  plugins: [
    structureTool(),
    visionTool(),
  ],

  schema: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    types: [product, auditReport, auditRule, productVideo, colorMapping, sizeMapping] as any,
  },

  tools: (prev) => [
    ...prev,
    {
      name: 'pim-dashboard',
      title: 'PIM Dashboard',
      icon: BarChartIcon as Tool['icon'],
      component: PimDashboard,
    },
  ],
})
