import { describe, expect, it } from 'vitest';
import {
  resolveCardBackImageUrl,
  resolveCardBackImageUrlFromManifest,
  resolveCardImageUrl,
  resolveCardImageUrlFromManifest,
} from './cardImages';
import { energyImageSourceUrl } from './cardAssetSources';

describe('card image resolver', () => {
  it('does not synthesize external image URLs without user config', () => {
    expect(resolveCardImageUrl({ name: 'Snover', set: 'MEG', setNumber: '35' }, {})).toBeUndefined();
  });

  it('uses explicit image URLs from loaded card data first', () => {
    expect(resolveCardImageUrl({ imageUrl: 'https://example.test/card.png', set: 'MEG', setNumber: '35' }, {})).toBe(
      'https://example.test/card.png',
    );
  });

  it('supports Scrydex card image URLs with the repo set map', () => {
    expect(resolveCardImageUrl({ name: 'Snover', set: 'MEG', setNumber: '35' }, { source: 'scrydex' })).toBe(
      'https://images.scrydex.com/pokemon/me1-35/large',
    );
    expect(resolveCardImageUrl({ name: 'Mega Signal', set: 'ASC', setNumber: '215' }, { source: 'scrydex' })).toBe(
      'https://images.scrydex.com/pokemon/me2pt5-215/large',
    );
    expect(resolveCardImageUrl({ name: 'Scrafty', set: 'PROMO', setNumber: '188' }, { source: 'scrydex' })).toBe(
      'https://images.scrydex.com/pokemon/svp-188/large',
    );
    expect(resolveCardImageUrl({ name: 'Pecharunt', set: 'SVP', setNumber: '149' }, { source: 'scrydex' })).toBe(
      'https://images.scrydex.com/pokemon/svp-149/large',
    );
  });

  it('supports custom local or remote URL templates', () => {
    expect(resolveCardImageUrl({ name: 'Snover', set: 'MEG', setNumber: '35' }, {
      template: '/local-card-images/{set}/{number}.png',
    })).toBe('/local-card-images/MEG/35.png');
    expect(resolveCardImageUrl({ name: 'Example Card', set: 'MEG', setNumber: '7' }, {
      template: 'https://images.example.test/{setId}/{numberPadded}-{name}.webp',
    })).toBe('https://images.example.test/me1/007-Example%20Card.webp');
  });

  it('requires an explicit card-back URL', () => {
    expect(resolveCardBackImageUrl({})).toBeUndefined();
    expect(resolveCardBackImageUrl({ cardBackUrl: '/local-card-images/cardback.png' })).toBe('/local-card-images/cardback.png');
    expect(resolveCardBackImageUrl({ source: 'scrydex' })).toBe('https://images.scrydex.com/pokemon/large');
  });

  it('resolves card faces, backs, and energy symbols from a visual asset manifest', () => {
    const manifest = {
      cards: {
        provider: 'scrydex' as const,
        images: {
          'MEG-35': '/local-card-images/cards/MEG/35.png',
        },
      },
      energy: {
        water: '/local-card-images/energy/water.webp',
        'double-turbo': '/local-card-images/energy/double-turbo.png',
      },
    };
    expect(resolveCardImageUrlFromManifest({ name: 'Snover', set: 'MEG', setNumber: '35' }, manifest)).toBe(
      '/local-card-images/cards/MEG/35.png',
    );
    expect(resolveCardImageUrlFromManifest({ name: 'Pecharunt', set: 'SVP', setNumber: '149' }, manifest)).toBe(
      'https://images.scrydex.com/pokemon/svp-149/large',
    );
    expect(resolveCardBackImageUrlFromManifest(manifest)).toBe('https://images.scrydex.com/pokemon/large');
    expect(energyImageSourceUrl({ name: 'Basic Water Energy' }, undefined, manifest)).toBe('/local-card-images/energy/water.webp');
    expect(energyImageSourceUrl({ name: 'Double Turbo Energy' }, undefined, manifest)).toBe('/local-card-images/energy/double-turbo.png');
  });

  it('uses bundled energy symbols when no manifest or template overrides are configured', () => {
    expect(energyImageSourceUrl({ name: 'Basic Psychic Energy' })).toBe('/assets/energy-icons/psychic.webp');
    expect(energyImageSourceUrl({ name: 'Double Turbo Energy' })).toBe('/assets/energy/double-turbo.png');
  });
});
