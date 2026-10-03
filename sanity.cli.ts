import { defineCliConfig } from 'sanity/cli'

// The dashboard styles with CSS Modules, which Vite handles natively —
// no custom Babel/Vite plugin is needed here.
export default defineCliConfig({
  api: {
    // Read both prefixes: the standalone Studio (Vite) exposes only
    // SANITY_STUDIO_*, while Next.js inlines only NEXT_PUBLIC_*. Same reasoning
    // as sanity/sanity.config.ts.
    projectId:
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ??
      process.env.SANITY_STUDIO_PROJECT_ID ??
      'dkhhaxxy',
    dataset:
      process.env.NEXT_PUBLIC_SANITY_DATASET ??
      process.env.SANITY_STUDIO_DATASET ??
      'production',
  },
  studioHost: 'pim-lite',
})
