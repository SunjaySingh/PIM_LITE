import { Composition, registerRoot } from 'remotion'
import { ProductPromo, productPromoSchema } from './compositions/ProductPromo'

export function RemotionRoot() {
  return (
    <Composition
      id="ProductPromo"
      component={ProductPromo}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
      schema={productPromoSchema}
      defaultProps={{
        name: 'Sample Product',
        category: 'SHIRT',
        price: 49.99,
        bulletPoint1: 'Premium quality materials',
        bulletPoint2: 'Available in multiple colours',
        bulletPoint3: 'Free returns',
        metaTitle: 'Sample Product | Brand',
        imageUrl: '',
      }}
    />
  )
}

registerRoot(RemotionRoot)
