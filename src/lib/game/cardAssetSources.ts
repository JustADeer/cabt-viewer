import {
  resolveCardBackImageUrl,
  resolveCardBackImageUrlFromManifest,
  resolveCardImageUrl,
  resolveCardImageUrlFromManifest,
  type CardImageInput,
} from './cardImages';
import {
  energyImageName,
  energyImageSlug,
  energyImageType,
  energyImageUrlFromManifest,
  type EnergyImageInput,
  type VisualAssetManifest,
} from './visualAssets';

export type { EnergyImageInput } from './visualAssets';

export function cardImageSourceUrl(card: CardImageInput | undefined, manifest?: VisualAssetManifest): string | undefined {
  return card ? (resolveCardImageUrlFromManifest(card, manifest) ?? resolveCardImageUrl(card)) : undefined;
}

export function cardBackImageSourceUrl(manifest?: VisualAssetManifest): string | undefined {
  return resolveCardBackImageUrlFromManifest(manifest) ?? resolveCardBackImageUrl();
}

export function energyImageSourceUrl(
  card: EnergyImageInput | undefined,
  type?: string | number,
  manifest?: VisualAssetManifest,
): string | undefined {
  const manifestUrl = energyImageUrlFromManifest(manifest, card, type);
  if (manifestUrl) {
    return manifestUrl;
  }
  const template = import.meta.env?.VITE_CABT_ENERGY_IMAGE_TEMPLATE?.trim();
  const name = energyImageName(card);
  const slug = energyImageSlug(card, type);
  const normalizedType = energyImageType(card, type);
  if (!template) {
    return bundledEnergyImageUrl(slug, normalizedType);
  }
  return template.replace(/\{(type|name|slug)\}/g, (_match: string, key: 'type' | 'name' | 'slug') => {
    const values = {
      type: normalizedType,
      name,
      slug,
    };
    return encodeURIComponent(values[key]);
  });
}

function bundledEnergyImageUrl(slug: string, type: string): string {
  if (slug === type) {
    return `/assets/energy-icons/${type}.webp`;
  }
  return `/assets/energy/${slug}.${specialEnergyExtension(slug)}`;
}

function specialEnergyExtension(slug: string): string {
  return (
    {
      'double-turbo': 'png',
      jet: 'png',
      gift: 'png',
      mist: 'png',
      legacy: 'png',
      'neo-upper': 'png',
    }[slug] ?? 'webp'
  );
}
