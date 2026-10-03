/**
 * Seed color and size mapping lookup documents into Sanity.
 * Run once: pnpm tsx scripts/seed-mappings.ts
 */

import { sanityClient } from '../sanity/lib/client'

const COLOR_SEEDS = [
  { sfccCode: 'JJI15XX', displayName: 'Navy',        amazonEnum: 'Navy Blue',    hexValue: '#001f5b' },
  { sfccCode: 'BLK001',  displayName: 'Black',       amazonEnum: 'Black',        hexValue: '#000000' },
  { sfccCode: 'WHT001',  displayName: 'White',       amazonEnum: 'White',        hexValue: '#ffffff' },
  { sfccCode: 'RED001',  displayName: 'Red',         amazonEnum: 'Red',          hexValue: '#ef4444' },
  { sfccCode: 'GRN001',  displayName: 'Green',       amazonEnum: 'Green',        hexValue: '#22c55e' },
  { sfccCode: 'BGDY01',  displayName: 'Burgundy',    amazonEnum: 'Burgundy',     hexValue: '#800020' },
  { sfccCode: 'GREY01',  displayName: 'Grey',        amazonEnum: 'Gray',         hexValue: '#9ca3af' },
  { sfccCode: 'BEG001',  displayName: 'Beige',       amazonEnum: 'Beige',        hexValue: '#f5f5dc' },
]

const SIZE_SEEDS = [
  { sfccCode: '9LG',   displayName: 'Large',      amazonEnum: 'L' },
  { sfccCode: '9MD',   displayName: 'Medium',     amazonEnum: 'M' },
  { sfccCode: '9SM',   displayName: 'Small',      amazonEnum: 'S' },
  { sfccCode: '9XL',   displayName: 'Extra Large', amazonEnum: 'XL' },
  { sfccCode: '9XXL',  displayName: 'XX Large',   amazonEnum: 'XXL' },
  { sfccCode: '9XS',   displayName: 'Extra Small', amazonEnum: 'XS' },
  { sfccCode: '9OS',   displayName: 'One Size',   amazonEnum: 'One Size' },
]

async function seed() {
  console.log('Seeding color mappings…')
  for (const c of COLOR_SEEDS) {
    const existing = await sanityClient.fetch(`*[_type == "colorMapping" && sfccCode == $code][0]`, { code: c.sfccCode })
    if (!existing) {
      await sanityClient.create({ _type: 'colorMapping', ...c })
      console.log(`  + ${c.sfccCode} → ${c.displayName}`)
    } else {
      console.log(`  = ${c.sfccCode} (exists)`)
    }
  }

  console.log('Seeding size mappings…')
  for (const s of SIZE_SEEDS) {
    const existing = await sanityClient.fetch(`*[_type == "sizeMapping" && sfccCode == $code][0]`, { code: s.sfccCode })
    if (!existing) {
      await sanityClient.create({ _type: 'sizeMapping', ...s })
      console.log(`  + ${s.sfccCode} → ${s.displayName}`)
    } else {
      console.log(`  = ${s.sfccCode} (exists)`)
    }
  }

  console.log('Done.')
}

seed().catch(console.error)
