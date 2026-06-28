import { describe, expect, it } from 'vitest';
import { type AnimationAnchorRef, serializeAnimationAnchor } from './animationAnchors';
import { AnimationVisibilityManager, type AnimationVisibilityElement } from './animationVisibility';

class FakeElement implements AnimationVisibilityElement {
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }
}

describe('AnimationVisibilityManager', () => {
  const anchor: AnimationAnchorRef = { kind: 'pokemon-card', playerIndex: 0, slot: 'bench', slotIndex: 1, serial: 11 };

  it('keeps an element hidden until every token for the semantic claim is released', () => {
    const element = new FakeElement();
    const manager = new AnimationVisibilityManager({
      resolver: () => [element],
    });

    const first = manager.hide({ scopeKey: 'scope-a', anchor, role: 'destination' });
    const second = manager.hide({ scopeKey: 'scope-a', anchor, role: 'destination' });

    expect(element.getAttribute(manager.hiddenAttribute)).toBe('true');
    expect(manager.activeClaimCount()).toBe(2);
    expect(manager.release(first)).toBe(true);
    expect(element.getAttribute(manager.hiddenAttribute)).toBe('true');
    expect(manager.release(second)).toBe(true);
    expect(element.getAttribute(manager.hiddenAttribute)).toBeUndefined();
  });

  it('releases all claims for a scope without touching newer scopes', () => {
    const element = new FakeElement();
    const manager = new AnimationVisibilityManager({
      resolver: () => [element],
    });

    manager.hide({ scopeKey: 'old-scope', anchor, role: 'source' });
    manager.hide({ scopeKey: 'new-scope', anchor, role: 'source' });

    expect(manager.releaseScope('old-scope')).toBe(1);
    expect(manager.activeClaimCount()).toBe(1);
    expect(element.getAttribute(manager.hiddenAttribute)).toBe('true');
    expect(manager.releaseScope('new-scope')).toBe(1);
    expect(element.getAttribute(manager.hiddenAttribute)).toBeUndefined();
  });

  it('ignores stale token releases after scope cleanup', () => {
    const element = new FakeElement();
    const manager = new AnimationVisibilityManager({
      resolver: () => [element],
    });

    const token = manager.hide({ scopeKey: 'scope-a', anchor, role: 'handoff' });
    expect(manager.releaseScope('scope-a')).toBe(1);

    expect(manager.release(token)).toBe(false);
    expect(manager.activeClaimCount()).toBe(0);
    expect(element.getAttribute(manager.hiddenAttribute)).toBeUndefined();
  });

  it('reapplies active semantic claims to newly resolved elements after DOM replacement', () => {
    const oldElement = new FakeElement();
    const newElement = new FakeElement();
    let resolvedElements = [oldElement];
    const manager = new AnimationVisibilityManager({
      resolver: () => resolvedElements,
    });

    manager.hide({ scopeKey: 'scope-a', anchor, role: 'destination' });
    expect(oldElement.getAttribute(manager.hiddenAttribute)).toBe('true');

    resolvedElements = [newElement];
    manager.refresh();

    expect(oldElement.getAttribute(manager.hiddenAttribute)).toBeUndefined();
    expect(newElement.getAttribute(manager.hiddenAttribute)).toBe('true');
  });

  it('keys claims by scope, role, anchor, and identity', () => {
    const manager = new AnimationVisibilityManager({ resolver: () => [] });
    const token = manager.hide({
      scopeKey: 'scope-a',
      anchor,
      role: 'source',
      identity: { kind: 'pokemon', serial: 11 },
    });

    expect(token.claimKey).toBe(`scope-a|source|${serializeAnimationAnchor(anchor)}|pokemon:serial:11`);
    expect(manager.activeClaimKeys()).toEqual([token.claimKey]);
  });
});
