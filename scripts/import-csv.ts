/**
 * One-time SFCC product export CSV importer.
 * Run: pnpm tsx scripts/import-csv.ts --file=./data/products.csv
 */

import * as fs from 'fs'
import Papa from 'papaparse'
import { sanityClient } from '../sanity/lib/client'

const CATEGORY_MAP: Record<string, string> = {
  dresses:           'SHIRT',
  mencasuals:        'SHIRT',
  suits:             'SUIT',
  beauty:            'BEAUTY',
  skincare:          'BEAUTY',
  perfurme:          'FRAGRANCE',
  perfume:           'FRAGRANCE',
  jewelry:           'JEWELRY',
  watches:           'WATCH',
  shoes:             'SHOES',
  accessories:       'ACCESSORY',
  handbags:          'HANDBAG',
  electronics:       'CONSUMER_ELECTRONICS',
  toys:              'TOY',
  petscollection:    'PET_SUPPLIES',
  holidaycollection: 'GIFT',
}

const BATCH_SIZE = 50

interface SfccRow {
  SKU?: string
  ID?: string
  'name__default'?: string
  'longDescription__default'?: string
  'category-id'?: string
  amount?: string
  'onlineFlag__default'?: string
  product_kind?: string
  lastModified_date?: string
  color?: string
  size?: string
}

// Cache color/size mappings to avoid per-row queries
async function loadMappings() {
  const colors = await sanityClient.fetch(`*[_type == "colorMapping"]{ sfccCode, displayName }`)
  const sizes  = await sanityClient.fetch(`*[_type == "sizeMapping"]{ sfccCode, displayName }`)
  return {
    colorMap: Object.fromEntries(colors.map((c: { sfccCode: string; displayName: string }) => [c.sfccCode, c.displayName])),
    sizeMap:  Object.fromEntries(sizes.map((s: { sfccCode: string; displayName: string }) => [s.sfccCode, s.displayName])),
  }
}

function normalisePrice(raw: string, category: string): { price: number; priceNormalised: boolean } {
  const price = parseFloat(raw)
  const amazonCat = CATEGORY_MAP[category.toLowerCase()]
  const isLuxury = amazonCat === 'JEWELRY' || amazonCat === 'WATCH'
  if (price > 10000 && !isLuxury) {
    return { price: price / 100, priceNormalised: true }
  }
  return { price, priceNormalised: false }
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace('--', '').split('=') as [string, string])
  )
  const filePath = args.file ?? './data/products.csv'

  if (!fs.existsSync(filePath)) {
    console.error(`CSV not found: ${filePath}`)
    process.exit(1)
  }

  const csv = fs.readFileSync(filePath, 'utf-8')
  const { data, errors } = Papa.parse<SfccRow>(csv, { header: true, skipEmptyLines: true })

  if (errors.length > 0) console.warn('CSV parse warnings:', errors.slice(0, 5))

  const { colorMap, sizeMap } = await loadMappings()

  let imported = 0, skipped = 0, errored = 0
  const batches: object[][] = []
  let batch: object[] = []

  for (const row of data) {
    const sku = row.SKU
    const name = row['name__default']
    if (!sku || !name) { skipped++; continue }

    const sfccCategory  = row['category-id'] ?? ''
    const amazonCategory = CATEGORY_MAP[sfccCategory.toLowerCase()] ?? ''
    const { price, priceNormalised } = normalisePrice(row.amount ?? '0', sfccCategory)

    const doc = {
      _type: 'product',
      _id:   `product-${sku}`,
      sku,
      sfccId:         row.ID ?? '',
      name,
      longDescription:row['longDescription__default'] ?? '',
      sfccCategory,
      price,
      ...(priceNormalised ? { priceNormalised: true } : {}),
      onlineFlag:    (row['onlineFlag__default'] ?? '').toLowerCase() === 'true',
      productKind:   (row.product_kind ?? '').toLowerCase() === 'variant' ? 'variant' : 'master',
      lastModified:  row.lastModified_date ? new Date(row.lastModified_date).toISOString() : undefined,
      color:         row.color ?? '',
      colorDisplay:  colorMap[row.color ?? ''] ?? '',
      size:          row.size ?? '',
      sizeDisplay:   sizeMap[row.size ?? ''] ?? '',
      amazonChannel: {
        amazonCategory,
      },
    }

    batch.push({ createOrReplace: doc })
    if (batch.length >= BATCH_SIZE) { batches.push(batch); batch = [] }
  }
  if (batch.length > 0) batches.push(batch)

  console.log(`Processing ${data.length} rows in ${batches.length} batches…`)

  for (const b of batches) {
    try {
      const tx = sanityClient.transaction()
      for (const mut of b) tx.createOrReplace((mut as { createOrReplace: object }).createOrReplace as Parameters<typeof tx.createOrReplace>[0])
      await tx.commit()
      imported += b.length
      process.stdout.write('.')
    } catch (err) {
      errored += b.length
      console.error('\nBatch error:', err)
    }
  }

  console.log(`\nImport complete. Imported: ${imported}, Skipped: ${skipped}, Errors: ${errored}`)
}

main().catch(console.error)
