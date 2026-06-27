import { describe, expect, it } from 'vitest';
import { classifyAnimationCoverage } from './actionAnimationCoverage';
import { CabtAreaType } from './types';
import type { ActionTimelineEvent } from '../game/types';

describe('classifyAnimationCoverage', () => {
  it('recognizes polished deck reveal and search movement', () => {
    expect(classifyAnimationCoverage(event('MoveCard', {
      fromArea: CabtAreaType.DECK,
      toArea: CabtAreaType.LOOKING,
      cardId: 3,
      serial: 10,
    })).level).toBe('polished');

    expect(classifyAnimationCoverage(event('MoveCard', {
      fromArea: CabtAreaType.DECK,
      toArea: CabtAreaType.HAND,
      cardId: 3,
      serial: 10,
    })).level).toBe('polished');

    expect(classifyAnimationCoverage(event('MoveCard', {
      fromArea: CabtAreaType.DECK,
      toArea: CabtAreaType.BENCH,
      cardId: 722,
      serial: 11,
    })).label).toBe('Deck Pokemon placement to board');
  });

  it('marks reveal returns as conditional because they depend on held sprites', () => {
    const coverage = classifyAnimationCoverage(event('MoveCard', {
      fromArea: CabtAreaType.LOOKING,
      toArea: CabtAreaType.DECK,
      cardId: 3,
      serial: 10,
    }));

    expect(coverage.level).toBe('conditional');
    expect(coverage.notes[0]).toContain('reveal sprite');
  });

  it('marks reveal takes to hand as conditional because they depend on held sprites', () => {
    const coverage = classifyAnimationCoverage(event('MoveCard', {
      fromArea: CabtAreaType.LOOKING,
      toArea: CabtAreaType.HAND,
      cardId: 1158,
      serial: 10,
    }));

    expect(coverage.level).toBe('conditional');
    expect(coverage.label).toBe('Revealed card take to hand');
  });

  it('distinguishes attack knockouts from checkup knockouts', () => {
    const knockout = event('MoveCard', {
      fromArea: CabtAreaType.ACTIVE,
      toArea: CabtAreaType.DISCARD,
      cardId: 721,
      serial: 10,
    });

    expect(classifyAnimationCoverage(knockout, [event('Attack', { cardId: 99 }), knockout]).level).toBe('polished');
    expect(classifyAnimationCoverage(knockout, [knockout]).level).toBe('conditional');
  });

  it('flags complex board mutations without dedicated animation', () => {
    expect(classifyAnimationCoverage(event('MoveAttached', {
      cardId: 3,
      serial: 10,
    })).level).toBe('unsupported');
    expect(classifyAnimationCoverage(event('Devolve', {
      cardId: 723,
      serial: 10,
    })).level).toBe('unsupported');
  });

  it('recognizes Switch as a polished active and bench board move', () => {
    const coverage = classifyAnimationCoverage(event('Switch', {
      cardIdActive: 304,
      cardIdBench: 878,
      serialActive: 79,
      serialBench: 81,
    }));

    expect(coverage.level).toBe('polished');
    expect(coverage.label).toBe('Active/bench switch');
  });

  it('recognizes attached energy moves as polished when serials are present', () => {
    const coverage = classifyAnimationCoverage(event('MoveCard', {
      fromArea: CabtAreaType.ENERGY,
      toArea: CabtAreaType.DISCARD,
      cardId: 3,
      serial: 12,
    }));

    expect(coverage.level).toBe('polished');
    expect(coverage.label).toBe('Attached card move');
  });

  it('flags uncommon zone movements as static state changes', () => {
    const coverage = classifyAnimationCoverage(event('MoveCard', {
      fromArea: CabtAreaType.DISCARD,
      toArea: CabtAreaType.HAND,
      cardId: 3,
      serial: 10,
    }));

    expect(coverage.level).toBe('static');
    expect(coverage.key).toBe('MoveCard:discard->hand');
  });
});

function event(kind: string, params: Record<string, unknown>): ActionTimelineEvent {
  return {
    id: 1,
    kind,
    playerIndex: 0,
    message: kind,
    params: {
      type: kind,
      playerIndex: 0,
      ...params,
    },
  };
}
