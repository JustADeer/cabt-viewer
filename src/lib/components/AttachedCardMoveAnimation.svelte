<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { actionAnimationBatchEvents, actionAnimationStartMs, actionAnimationTiming } from '../cabt/actionAnimationSchedule';
  import { CabtAreaType } from '../cabt/types';
  import type { ActionTimelineEvent } from '../game/types';

  type Props = {
    events?: ActionTimelineEvent[];
    scopeKey?: string | number;
    replayMode?: boolean;
  };

  type AttachedMoveSprite = {
    id: string;
    html: string;
    left: number;
    top: number;
    width: number;
    height: number;
    moveX: number;
    moveY: number;
    scale: number;
    delayMs: number;
    sourceElement: HTMLElement;
  };

  let {
    events = [],
    scopeKey = '',
    replayMode = false,
  }: Props = $props();

  const timers: ReturnType<typeof setTimeout>[] = [];
  let seenEventIds = new Set<number>();
  let initialized = false;
  let lastScopeKey: string | number = '';
  let reduceMotion = $state(false);
  let sprites = $state<AttachedMoveSprite[]>([]);

  onMount(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => {
      reduceMotion = media.matches;
    };
    updateMotionPreference();
    media.addEventListener('change', updateMotionPreference);
    return () => media.removeEventListener('change', updateMotionPreference);
  });

  onDestroy(() => {
    clearSprites();
  });

  $effect(() => {
    const currentEvents = events;
    const currentScopeKey = scopeKey;
    const scopeChanged = initialized && currentScopeKey !== lastScopeKey;
    lastScopeKey = currentScopeKey;

    if (!initialized) {
      for (const event of currentEvents) {
        seenEventIds.add(event.id);
      }
      initialized = true;
      return;
    }

    if (replayMode && scopeChanged) {
      clearSprites();
    }

    const animationEvents = actionAnimationBatchEvents(currentEvents, seenEventIds, replayMode, scopeChanged);
    const moveEvents = animationEvents.filter((event) => isAttachedMoveEvent(event) && ((replayMode && scopeChanged) || !seenEventIds.has(event.id)));

    for (const event of currentEvents) {
      seenEventIds.add(event.id);
    }

    if (moveEvents.length) {
      startAttachedMoves(moveEvents, animationEvents);
    }
  });

  function startAttachedMoves(moveEvents: ActionTimelineEvent[], animationEvents: ActionTimelineEvent[]) {
    if (reduceMotion) {
      return;
    }

    const nextSprites = moveEvents.flatMap((event) => spriteForEvent(event, animationEvents));
    if (!nextSprites.length) {
      return;
    }

    for (const sprite of nextSprites) {
      const startTimer = setTimeout(() => {
        sprite.sourceElement.dataset.attachedMoveAnimationHidden = 'true';
      }, sprite.delayMs);
      const cleanupTimer = setTimeout(() => {
        delete sprite.sourceElement.dataset.attachedMoveAnimationHidden;
        sprites = sprites.filter((item) => item.id !== sprite.id);
      }, sprite.delayMs + actionAnimationTiming.handMoveMs + 90);
      timers.push(startTimer, cleanupTimer);
    }
    sprites = [...sprites, ...nextSprites];
  }

  function spriteForEvent(event: ActionTimelineEvent, animationEvents: ActionTimelineEvent[]): AttachedMoveSprite[] {
    const params = event.params as Record<string, unknown> | undefined;
    const source = sourceElementForEvent(event);
    const target = targetElementForEvent(event);
    if (!source || !target) {
      return [];
    }

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (sourceRect.width <= 0 || sourceRect.height <= 0 || targetRect.width <= 0 || targetRect.height <= 0) {
      return [];
    }

    const sourceCenter = centerOf(sourceRect);
    const targetCenter = centerOf(targetRect);
    const serial = Number(params?.serial);
    const cardId = Number(params?.cardId);
    return [{
      id: `${event.id}-${Number.isFinite(serial) ? serial : cardId}`,
      html: source.outerHTML,
      left: sourceRect.left,
      top: sourceRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
      moveX: targetCenter.x - sourceCenter.x,
      moveY: targetCenter.y - sourceCenter.y,
      scale: Math.max(0.55, Math.min(1.35, Math.min(targetRect.width / sourceRect.width, targetRect.height / sourceRect.height))),
      delayMs: actionAnimationStartMs(animationEvents, event),
      sourceElement: source,
    }];
  }

  function isAttachedMoveEvent(event: ActionTimelineEvent): boolean {
    const params = event.params as Record<string, unknown> | undefined;
    return event.kind === 'MoveCard'
      && (
        Number(params?.fromArea) === CabtAreaType.ENERGY
        || Number(params?.fromArea) === CabtAreaType.TOOL
      )
      && (
        Number(params?.toArea) === CabtAreaType.DISCARD
        || Number(params?.toArea) === CabtAreaType.HAND
        || Number(params?.toArea) === CabtAreaType.DECK
      );
  }

  function sourceElementForEvent(event: ActionTimelineEvent): HTMLElement | null {
    const params = event.params as Record<string, unknown> | undefined;
    const serial = Number(params?.serial);
    const fromArea = Number(params?.fromArea);
    if (!Number.isFinite(serial)) {
      return null;
    }
    if (fromArea === CabtAreaType.ENERGY) {
      const energy = document.querySelector(`[data-energy-serial="${serial}"]`);
      return energy instanceof HTMLElement ? energy : null;
    }
    if (fromArea === CabtAreaType.TOOL) {
      const tool = document.querySelector(`[data-tool-serial="${serial}"]`);
      return tool instanceof HTMLElement ? tool : null;
    }
    return null;
  }

  function targetElementForEvent(event: ActionTimelineEvent): HTMLElement | null {
    const params = event.params as Record<string, unknown> | undefined;
    const playerIndex = event.playerIndex;
    if (playerIndex === undefined) {
      return null;
    }
    const toArea = Number(params?.toArea);
    if (toArea === CabtAreaType.DISCARD) {
      return document.querySelector(`[data-card-anchor="player:${playerIndex}:discard"]`);
    }
    if (toArea === CabtAreaType.DECK) {
      const anchor = document.querySelector(`[data-card-anchor="player:${playerIndex}:deck"]`);
      return anchor?.closest('.deck-pile') as HTMLElement | null;
    }
    if (toArea === CabtAreaType.HAND) {
      return document.querySelector(`[data-card-anchor="player:${playerIndex}:hand"]`);
    }
    return null;
  }

  function clearSprites() {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.length = 0;
    for (const sprite of sprites) {
      delete sprite.sourceElement.dataset.attachedMoveAnimationHidden;
    }
    sprites = [];
  }

  function centerOf(rect: DOMRect): { x: number; y: number } {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function spriteStyle(sprite: AttachedMoveSprite): string {
    return [
      `left: ${sprite.left}px`,
      `top: ${sprite.top}px`,
      `width: ${sprite.width}px`,
      `height: ${sprite.height}px`,
      `--attached-move-x: ${sprite.moveX.toFixed(1)}px`,
      `--attached-move-y: ${sprite.moveY.toFixed(1)}px`,
      `--attached-move-scale: ${sprite.scale.toFixed(3)}`,
      `--attached-move-delay: ${sprite.delayMs}ms`,
    ].join('; ');
  }
</script>

<span class="attached-card-move-animation" aria-hidden="true">
  {#each sprites as sprite (sprite.id)}
    <span class="attached-move-sprite" style={spriteStyle(sprite)}>
      {@html sprite.html}
    </span>
  {/each}
</span>

<style>
  .attached-card-move-animation {
    position: fixed;
    inset: 0;
    z-index: 42;
    overflow: visible;
    pointer-events: none;
  }

  .attached-move-sprite {
    position: absolute;
    display: grid;
    place-items: center;
    transform-origin: center;
    animation: attached-card-move 360ms cubic-bezier(0.2, 0.82, 0.22, 1) var(--attached-move-delay) both;
    will-change: transform, opacity;
  }

  .attached-move-sprite :global(*) {
    pointer-events: none;
  }

  :global([data-attached-move-animation-hidden='true']) {
    opacity: 0;
  }

  @keyframes attached-card-move {
    0% {
      opacity: 0;
      transform: translate3d(0, 0, 0) scale(1);
    }
    8% {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
    }
    82% {
      opacity: 1;
      transform: translate3d(var(--attached-move-x), var(--attached-move-y), 0) scale(var(--attached-move-scale));
    }
    100% {
      opacity: 0;
      transform: translate3d(var(--attached-move-x), var(--attached-move-y), 0) scale(var(--attached-move-scale));
    }
  }
</style>
