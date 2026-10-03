import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Img, staticFile } from 'remotion'
import { z } from 'zod'

export const productPromoSchema = z.object({
  name:         z.string(),
  category:     z.string(),
  price:        z.number(),
  bulletPoint1: z.string(),
  bulletPoint2: z.string(),
  bulletPoint3: z.string(),
  metaTitle:    z.string(),
  imageUrl:     z.string(),
})

type Props = z.infer<typeof productPromoSchema>

const CATEGORY_COLORS: Record<string, string> = {
  SHIRT:    '#1e3a5f',
  SUIT:     '#1a1a2e',
  BEAUTY:   '#6b2d5e',
  FRAGRANCE:'#4a1942',
  JEWELRY:  '#2d1b00',
  WATCH:    '#1a2e1a',
  SHOES:    '#2e1a00',
  default:  '#0f172a',
}

export function ProductPromo({ name, category, price, bulletPoint1, bulletPoint2, bulletPoint3, metaTitle, imageUrl }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const bgColor = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.default

  // Frame 0–60: brand intro
  const introOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })

  // Frame 61–180: product name
  const nameOpacity  = interpolate(frame, [61, 90],  [0, 1], { extrapolateRight: 'clamp' })
  const nameY        = interpolate(frame, [61, 90],  [40, 0], { extrapolateRight: 'clamp' })

  // Frame 181–300: bullets
  const b1Opacity = interpolate(frame, [181, 200], [0, 1], { extrapolateRight: 'clamp' })
  const b2Opacity = interpolate(frame, [200, 220], [0, 1], { extrapolateRight: 'clamp' })
  const b3Opacity = interpolate(frame, [220, 240], [0, 1], { extrapolateRight: 'clamp' })

  // Frame 301–390: image + price
  const imgOpacity   = interpolate(frame, [301, 330], [0, 1], { extrapolateRight: 'clamp' })

  // Frame 391–450: CTA
  const ctaOpacity   = interpolate(frame, [391, 420], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, fontFamily: 'system-ui, sans-serif', color: '#ffffff' }}>

      {/* Phase 1: brand intro */}
      {frame <= 60 && (
        <AbsoluteFill style={{ opacity: introOpacity, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            PIM-Lite
          </div>
          <div style={{ fontSize: 20, opacity: 0.6, marginTop: 12, letterSpacing: '0.1em' }}>{category}</div>
        </AbsoluteFill>
      )}

      {/* Phase 2: product name */}
      {frame > 60 && frame <= 180 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `translateY(${nameY}px)`, opacity: nameOpacity }}>
          <div style={{ fontSize: 72, fontWeight: 900, textAlign: 'center', maxWidth: '80%', lineHeight: 1.1 }}>{name}</div>
          <div style={{ fontSize: 24, opacity: 0.7, marginTop: 24, letterSpacing: '0.05em' }}>{category}</div>
        </AbsoluteFill>
      )}

      {/* Phase 3: bullets */}
      {frame > 180 && frame <= 300 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 32 }}>
          {[
            { text: bulletPoint1, opacity: b1Opacity },
            { text: bulletPoint2, opacity: b2Opacity },
            { text: bulletPoint3, opacity: b3Opacity },
          ].map(({ text, opacity }, i) => (
            <div key={i} style={{ opacity, display: 'flex', alignItems: 'center', gap: 20, fontSize: 36, maxWidth: '70%' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#f59e0b', flexShrink: 0 }} />
              {text}
            </div>
          ))}
        </AbsoluteFill>
      )}

      {/* Phase 4: image + price */}
      {frame > 300 && frame <= 390 && (
        <AbsoluteFill style={{ opacity: imgOpacity, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 80 }}>
          <div style={{ width: 480, height: 480, borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' }}>
            {imageUrl ? <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          </div>
          <div>
            <div style={{ fontSize: 28, opacity: 0.7, marginBottom: 12 }}>Price</div>
            <div style={{ fontSize: 96, fontWeight: 900 }}>${price.toFixed(2)}</div>
          </div>
        </AbsoluteFill>
      )}

      {/* Phase 5: CTA */}
      {frame > 390 && (
        <AbsoluteFill style={{ opacity: ctaOpacity, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '0.05em' }}>{metaTitle}</div>
          <div style={{ fontSize: 32, backgroundColor: '#f59e0b', color: '#000', padding: '16px 48px', borderRadius: 48, fontWeight: 700 }}>
            Shop Now
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
