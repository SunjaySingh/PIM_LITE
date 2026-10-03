/**
 * Synthetic GTIN-12 (UPC-A) generation.
 *
 * The SFCC feed carries no GTINs and we cannot mint real ones — a registered
 * GTIN requires a GS1 company prefix. So we generate structurally valid codes
 * that pass check-digit validation but are unmistakably not real.
 *
 * Two deliberate choices:
 *
 * 1. Prefix "02". GS1 reserves 02 for restricted circulation / internal use,
 *    so these codes are self-labelling as non-registered rather than
 *    impersonating some real company's prefix.
 *
 * 2. Derived from the SKU by hash, not random. Re-running enrichment on the
 *    same product yields the same GTIN, so audits are reproducible and repeat
 *    runs do not churn the dataset.
 */

import { createHash } from 'node:crypto'

/** GS1 prefix for restricted circulation — marks these as non-registered. */
const RESTRICTED_PREFIX = '02'

/**
 * Check digit for the first 11 digits of a GTIN-12, per the GS1 modulo-10
 * algorithm: positions are weighted 3,1,3,1,… from the left.
 */
export function gtin12CheckDigit(first11: string): number {
  if (!/^\d{11}$/.test(first11)) {
    throw new Error(`Expected 11 digits, got "${first11}"`)
  }

  let sum = 0
  for (let i = 0; i < 11; i++) {
    const digit = first11.charCodeAt(i) - 48
    // Left-to-right: odd positions (index 0, 2, …) carry weight 3.
    sum += i % 2 === 0 ? digit * 3 : digit
  }

  return (10 - (sum % 10)) % 10
}

/** True if `value` is 12 digits with a correct GTIN-12 check digit. */
export function isValidGtin12(value: string): boolean {
  if (!/^\d{12}$/.test(value)) return false
  return Number(value[11]) === gtin12CheckDigit(value.slice(0, 11))
}

/**
 * Deterministically derive a valid synthetic GTIN-12 from a seed (use the SKU).
 * The same seed always produces the same code.
 */
export function generateGtin12(seed: string): string {
  if (!seed) throw new Error('generateGtin12 requires a non-empty seed')

  const hash = createHash('sha256').update(seed).digest('hex')
  // Take the hash as a big integer, then its last 9 decimal digits, so every
  // digit position varies with the seed.
  const body = (BigInt('0x' + hash) % 1_000_000_000n).toString().padStart(9, '0')

  const first11 = RESTRICTED_PREFIX + body
  return first11 + gtin12CheckDigit(first11)
}
