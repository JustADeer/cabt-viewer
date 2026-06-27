import { energySymbolInfo, energySymbolInfoForType } from './energyIcons';

export type VisualAssetManifest = {
  cards?: VisualAssetManifestCards;
  cardBack?: string;
  energy?: Record<string, string>;
};

export type VisualAssetManifestCards = {
  provider?: 'scrydex';
  template?: string;
  images?: Record<string, string>;
};

export type EnergyImageInput = {
  name?: string;
  fullName?: string;
  energyType?: string | number;
};

const specialEnergySlugs: Record<string, string> = {
  'Double Turbo Energy': 'double-turbo',
  'Jet Energy': 'jet',
  'Gift Energy': 'gift',
  'Mist Energy': 'mist',
  'Luminous Energy': 'luminous',
  'Reversal Energy': 'reversal',
  'Therapeutic Energy': 'therapeutic',
  'Medical Energy': 'medical',
  'Boomerang Energy': 'boomerang',
  'Spiky Energy': 'spiky',
  "Team Rocket's Energy": 'team-rockets',
  'Prism Energy': 'prism',
  'Ignition Energy': 'ignition',
  'Enriching Energy': 'enriching',
  'Legacy Energy': 'legacy',
  'Neo Upper Energy': 'neo-upper',
  'Rock Fighting Energy': 'rock-fighting',
  'Growth Grass Energy': 'growth-grass',
  'Telepath Psychic Energy': 'telepath-psychic',
};

export function energyImageSlug(card: EnergyImageInput | undefined, type?: string | number): string {
  const name = energyImageName(card);
  if (name && specialEnergySlugs[name]) {
    return specialEnergySlugs[name];
  }
  return energyImageType(card, type);
}

export function energyImageType(card: EnergyImageInput | undefined, type?: string | number): string {
  const symbol = card ? energySymbolInfo(card) : energySymbolInfoForType(type);
  return symbol.type;
}

export function energyImageName(card: EnergyImageInput | undefined): string {
  return (card?.name || card?.fullName || '').trim();
}

export function energyImageUrlFromManifest(
  manifest: VisualAssetManifest | undefined,
  card: EnergyImageInput | undefined,
  type?: string | number,
): string | undefined {
  const energy = manifest?.energy;
  if (!energy) {
    return undefined;
  }
  const name = energyImageName(card);
  const slug = energyImageSlug(card, type);
  return energy[slug] ?? energy[name] ?? energy[energyImageType(card, type)];
}
