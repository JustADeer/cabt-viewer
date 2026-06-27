import { describe, expect, it } from 'vitest';
import { energySymbolInfo, energySymbolInfoForType, normalizedTypeName, pokemonTypeLabelFor } from './energyIcons';

describe('energy and Pokemon type helpers', () => {
  it('resolves basic energy symbols from card names', () => {
    expect(energySymbolInfo({ name: 'Basic Psychic Energy' })).toMatchObject({ type: 'psychic', label: 'Psychic', letter: 'P' });
    expect(energySymbolInfo({ name: 'Basic {G} Energy' })).toMatchObject({ type: 'grass', label: 'Grass', letter: 'G' });
    expect(energySymbolInfo({ name: 'Basic Energy', energyType: 1 })).toMatchObject({ type: 'grass', label: 'Grass', letter: 'G' });
    expect(energySymbolInfo({ name: 'Unknown Special Energy' })).toMatchObject({ type: 'colorless', label: 'Colorless', letter: 'C' });
  });

  it('uses requested letters for fire and fairy symbols', () => {
    expect(energySymbolInfoForType('Fire')).toMatchObject({ type: 'fire', letter: 'R' });
    expect(energySymbolInfoForType('Fairy')).toMatchObject({ type: 'fairy', letter: 'Y' });
  });

  it('normalizes card type values for Pokemon badges', () => {
    expect(normalizedTypeName(4)).toBe('lightning');
    expect(normalizedTypeName('{G}')).toBe('grass');
    expect(normalizedTypeName('Dark')).toBe('darkness');
    expect(energySymbolInfoForType('Fire')).toMatchObject({ type: 'fire', label: 'Fire' });
    expect(pokemonTypeLabelFor('Psychic')).toBe('Psychic');
    expect(pokemonTypeLabelFor(undefined)).toBe('Pokemon');
  });
});
