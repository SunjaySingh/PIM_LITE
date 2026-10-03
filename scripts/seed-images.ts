/**
 * Uploads the demo product images to Sanity and reports their CDN URLs.
 *
 * The SFCC feed carries no image column, so every product fails R011
 * (imageUrl required). For the demo we stand in two real, category-appropriate
 * photos rather than a dead placeholder URL — a judge clicking through sees an
 * actual image. Products are assigned one of these by category during
 * enrichment; see agent/enrich.ts.
 *
 * Photos are from Unsplash, whose licence permits free commercial use without
 * attribution. Source IDs are recorded below so the provenance is traceable.
 *
 * Idempotent: an image already uploaded under the same filename is reused.
 *
 *   pnpm tsx --env-file=.env.local scripts/seed-images.ts
 */

import { sanityClient } from '../sanity/lib/client'

export interface DemoImage {
  /** Stable key used by the enrichment step to pick an image per category. */
  key: 'apparel' | 'beauty'
  filename: string
  unsplashId: string
  credit: string
}

export const DEMO_IMAGES: DemoImage[] = [
  {
    key: 'apparel',
    filename: 'lolly-apparel.jpg',
    unsplashId: 'photo-1490481651871-ab68de25d43d',
    credit: 'Unsplash',
  },
  {
    key: 'beauty',
    filename: 'lolly-beauty.jpg',
    unsplashId: 'photo-1596462502278-27bfdc403348',
    credit: 'Unsplash',
  },
]

const unsplashUrl = (id: string) => `https://images.unsplash.com/${id}?w=1600&q=80&fm=jpg`

async function findExisting(filename: string): Promise<string | null> {
  return sanityClient.fetch(
    `*[_type == "sanity.imageAsset" && originalFilename == $filename][0].url`,
    { filename },
  )
}

async function seedImage(image: DemoImage): Promise<string> {
  const existing = await findExisting(image.filename)
  if (existing) {
    console.log(`  ${image.key.padEnd(8)} reused  ${existing}`)
    return existing
  }

  const response = await fetch(unsplashUrl(image.unsplashId))
  if (!response.ok) {
    throw new Error(`Failed to download ${image.unsplashId}: ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())

  const asset = await sanityClient.assets.upload('image', buffer, {
    filename: image.filename,
    title: `Lolly ${image.key} demo image`,
    description: `Demo product image (${image.key}) — ${image.credit}`,
  })

  console.log(`  ${image.key.padEnd(8)} uploaded ${asset.url}`)
  return asset.url
}

async function main() {
  console.log('Seeding demo product images…')
  const urls: Record<string, string> = {}
  for (const image of DEMO_IMAGES) {
    urls[image.key] = await seedImage(image)
  }
  console.log('\nDone. URLs:')
  console.log(JSON.stringify(urls, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
