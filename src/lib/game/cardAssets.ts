import { viewSettingsStore } from '../../state/viewSettings.svelte';
import { visualAssetsStore } from '../../state/visualAssets.svelte';
import { hasConfiguredCardImageSource, type CardImageInput } from './cardImages';
import {
  cardBackImageSourceUrl,
  cardImageSourceUrl,
  energyImageSourceUrl,
  type EnergyImageInput,
} from './cardAssetSources';

export { cardBackImageSourceUrl, cardImageSourceUrl, energyImageSourceUrl };

export function cardAssetImagesEnabled(): boolean {
  return viewSettingsStore.showCardImages && hasConfiguredCardImageSource(undefined, visualAssetsStore.manifest);
}

export function cardFaceImageUrl(card: CardImageInput | undefined, options: { faceDown?: boolean } = {}): string | undefined {
  if (!card || options.faceDown || !cardAssetImagesEnabled()) {
    return undefined;
  }
  return cardImageSourceUrl(card, visualAssetsStore.manifest);
}

export function cardBackImageUrl(): string | undefined {
  return cardAssetImagesEnabled() ? cardBackImageSourceUrl(visualAssetsStore.manifest) : undefined;
}

export function cssAssetUrl(value: string | undefined): string {
  return value ? `url(${JSON.stringify(value)})` : 'none';
}

export function cardBackCssVar(): string {
  const imageUrl = cardBackImageUrl();
  return imageUrl ? `--card-back-image: ${cssAssetUrl(imageUrl)};` : '';
}

export function energyImageUrl(card: EnergyImageInput | undefined, type?: string | number): string | undefined {
  if (!cardAssetImagesEnabled()) {
    return undefined;
  }
  return energyImageSourceUrl(card, type, visualAssetsStore.manifest);
}
