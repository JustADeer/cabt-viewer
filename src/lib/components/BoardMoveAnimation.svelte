<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { actionAnimationBatchEvents, actionAnimationStartMs, actionAnimationTiming } from '../cabt/actionAnimationSchedule';
  import { cabtCardToView } from '../cabt/cardView';
  import { CabtAreaType } from '../cabt/types';
  import type { ActionTimelineEvent } from '../game/types';

  type Props = {
    events?: ActionTimelineEvent[];
    scopeKey?: string | number;
    replayMode?: boolean;
  };

  type BoardMoveSprite = {
    id: string;
    html: string;
    fallbackName: string;
    left: number;
    top: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
    startScale: number;
    correctionX: number;
    correctionY: number;
    sourceZ: number;
    targetZ: number;
    opponentSide: boolean;
    delayMs: number;
    measuring: boolean;
  };

  const boardMoveHandoffPollMs = 16;
  const boardMoveHandoffMaxWaitMs = 300;

  let {
    events = [],
    scopeKey = '',
    replayMode = false,
  }: Props = $props();

  let motionLayer = $state<HTMLElement>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let seenEventIds = new Set<number>();
  let initialized = false;
  let lastScopeKey: string | number = '';
  let reduceMotion = $state(false);
  let sprites = $state<BoardMoveSprite[]>([]);

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
    for (const timer of timers) {
      clearTimeout(timer);
    }
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

    const animationEvents = actionAnimationBatchEvents(currentEvents, seenEventIds, replayMode, scopeChanged);
    for (const event of currentEvents) {
      seenEventIds.add(event.id);
    }
    if (!animationEvents.length || reduceMotion) {
      return;
    }

    startBoardMoves(animationEvents);
  });

  function startBoardMoves(animationEvents: ActionTimelineEvent[]) {
    const boardPlane = motionLayer?.parentElement;
    if (!motionLayer || !boardPlane) {
      return;
    }
    const moveEvents = animationEvents.filter(isBoardMoveEvent);
    for (const event of moveEvents) {
      const source = sourceElementForEvent(event);
      const target = targetElementForEvent(event, moveEvents);
      const params = event.params as Record<string, unknown> | undefined;
      const cardId = Number(params?.cardId);
      if (!source || !target || !Number.isFinite(cardId)) {
        continue;
      }

      const sourceElement = source;
      const targetElement = target;
      const sourceRect = localElementRect(sourceElement, boardPlane);
      const targetRect = localElementRect(targetElement, boardPlane);
      if (!sourceRect || !targetRect || sourceRect.width <= 0 || targetRect.width <= 0) {
        continue;
      }

      const delayMs = actionAnimationStartMs(animationEvents, event);
      const sprite: BoardMoveSprite = {
        id: `${event.id}-${params?.serial ?? cardId}`,
        html: spriteHtml(sourceElement, targetElement),
        fallbackName: cabtCardToView(cardId).name,
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        startX: sourceRect.left + sourceRect.width / 2 - (targetRect.left + targetRect.width / 2),
        startY: sourceRect.top + sourceRect.height / 2 - (targetRect.top + targetRect.height / 2),
        startScale: sourceRect.width / targetRect.width,
        correctionX: 0,
        correctionY: 0,
        sourceZ: boardSlotDepth(source),
        targetZ: boardSlotDepth(target),
        opponentSide: isOpponentSide(source) || isOpponentSide(target),
        delayMs,
        measuring: true,
      };

      const startTimer = setTimeout(async () => {
        sprites = [...sprites, sprite];
        await tick();
        if (!document.body.contains(source) || !document.body.contains(target)) {
          sprites = sprites.filter((item) => item.id !== sprite.id);
          return;
        }

        const correction = measureSpriteCorrection(sprite, target);
        source.dataset.boardMoveAnimationHidden = 'true';
        target.dataset.boardMoveAnimationHidden = 'true';
        sprites = sprites.map((item) => item.id === sprite.id
          ? {
              ...item,
              correctionX: correction.x,
              correctionY: correction.y,
              measuring: false,
            }
          : item);
        const finishTimer = setTimeout(() => {
          handOffWhenDestinationReady(source, target, sprite, Date.now());
        }, actionAnimationTiming.boardMoveMs);
        timers.push(finishTimer);
      }, delayMs);
      timers.push(startTimer);
    }
  }

  function isBoardMoveEvent(event: ActionTimelineEvent) {
    const params = event.params as Record<string, unknown> | undefined;
    const fromArea = Number(params?.fromArea);
    const toArea = Number(params?.toArea);
    return event.kind === 'MoveCard'
      && (
        (fromArea === CabtAreaType.BENCH && toArea === CabtAreaType.ACTIVE)
        || (fromArea === CabtAreaType.ACTIVE && toArea === CabtAreaType.BENCH)
      );
  }

  function sourceElementForEvent(event: ActionTimelineEvent): HTMLElement | null {
    const params = event.params as Record<string, unknown> | undefined;
    const serial = Number(params?.serial);
    if (Number.isFinite(serial)) {
      const bySerial = document.querySelector(`[data-pokemon-serial="${serial}"]`);
      if (bySerial instanceof HTMLElement) {
        return bySerial;
      }
    }
    const cardId = Number(params?.cardId);
    if (Number.isFinite(cardId) && event.playerIndex !== undefined) {
      const byCard = document.querySelector(`[data-owner-index="${event.playerIndex}"][data-pokemon-card-id="${cardId}"]`);
      if (byCard instanceof HTMLElement) {
        return byCard;
      }
    }
    return null;
  }

  function targetElementForEvent(event: ActionTimelineEvent, moveEvents: ActionTimelineEvent[]): HTMLElement | null {
    const params = event.params as Record<string, unknown> | undefined;
    const playerIndex = event.playerIndex;
    if (playerIndex === undefined) {
      return null;
    }
    const toArea = Number(params?.toArea);
    if (toArea === CabtAreaType.ACTIVE) {
      return boardAnchor(playerIndex, 'active', 0);
    }
    if (toArea === CabtAreaType.BENCH) {
      const benchIndex = Number(params?.toIndex ?? params?.index ?? params?.benchIndex);
      if (Number.isInteger(benchIndex)) {
        return boardAnchor(playerIndex, 'bench', benchIndex);
      }
      return pairedBenchSourceElement(event, moveEvents);
    }
    return null;
  }

  function pairedBenchSourceElement(event: ActionTimelineEvent, moveEvents: ActionTimelineEvent[]): HTMLElement | null {
    const params = event.params as Record<string, unknown> | undefined;
    const fromArea = Number(params?.fromArea);
    const toArea = Number(params?.toArea);
    if (fromArea !== CabtAreaType.ACTIVE || toArea !== CabtAreaType.BENCH) {
      return null;
    }
    const pairedEvent = moveEvents.find((candidate) => {
      const candidateParams = candidate.params as Record<string, unknown> | undefined;
      return candidate !== event
        && candidate.playerIndex === event.playerIndex
        && Number(candidateParams?.fromArea) === CabtAreaType.BENCH
        && Number(candidateParams?.toArea) === CabtAreaType.ACTIVE;
    });
    return pairedEvent ? sourceElementForEvent(pairedEvent) : null;
  }

  function boardAnchor(playerIndex: number, slot: 'active' | 'bench', index: number): HTMLElement | null {
    const element = document.querySelector(`[data-card-anchor="player:${playerIndex}:${slot}:${index}"]`);
    return element instanceof HTMLElement ? element : null;
  }

  function boardSlotDepth(slotElement: HTMLElement): number {
    if (slotElement.closest('.top-active-slot, .bottom-active-slot')) {
      return 32;
    }
    if (slotElement.closest('.bench-row')) {
      return 16;
    }
    return 0;
  }

  function isOpponentSide(slotElement: HTMLElement): boolean {
    return !!slotElement.closest('.top-active-slot, .bench-row.opponent');
  }

  function localElementRect(element: HTMLElement, root: HTMLElement) {
    let left = 0;
    let top = 0;
    let current: HTMLElement | null = element;
    while (current && current !== root) {
      left += current.offsetLeft;
      top += current.offsetTop;
      current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
    }
    if (current !== root) {
      return null;
    }
    const style = getComputedStyle(element);
    const width = parsedPixelValue(style.width) ?? element.offsetWidth;
    const height = parsedPixelValue(style.height) ?? element.offsetHeight;
    return {
      left,
      top,
      width,
      height,
    };
  }

  function parsedPixelValue(value: string) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function clearBoardMoveAnimation(source: HTMLElement) {
    delete source.dataset.boardMoveAnimationHidden;
  }

  function measureSpriteCorrection(sprite: BoardMoveSprite, target: HTMLElement) {
    const spriteElement = document.querySelector(`[data-board-move-id="${sprite.id}"] .card-tile`);
    if (!(spriteElement instanceof HTMLElement)) {
      return { x: 0, y: 0 };
    }
    const spriteRect = spriteElement.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const projectedScaleX = spriteRect.width / sprite.width;
    const projectedScaleY = spriteRect.height / sprite.height;
    return {
      x: projectedScaleX > 0 ? (targetRect.left - spriteRect.left) / projectedScaleX : 0,
      y: projectedScaleY > 0 ? (targetRect.top - spriteRect.top) / projectedScaleY : 0,
    };
  }

  function spriteHtml(source: HTMLElement, target: HTMLElement) {
    const clone = source.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return source.outerHTML;
    }

    clone.className = target.className;
    clone.classList.remove('empty');
    clone.classList.add('board-slot');
    clone.removeAttribute('id');
    clone.removeAttribute('data-testid');
    clone.removeAttribute('data-card-anchor');
    clone.removeAttribute('data-owner-index');
    clone.removeAttribute('data-slot-kind');
    clone.removeAttribute('data-slot-index');
    clone.removeAttribute('data-pokemon-card-id');
    clone.removeAttribute('data-pokemon-serial');
    clone.removeAttribute('title');
    clone.removeAttribute('data-board-move-animation-hidden');
    return clone.outerHTML;
  }

  function handOffWhenDestinationReady(
    source: HTMLElement,
    target: HTMLElement,
    sprite: BoardMoveSprite,
    startTime: number,
  ) {
    const destinationReady = !!target.querySelector('.card-tile');
    const timedOut = Date.now() - startTime >= boardMoveHandoffMaxWaitMs;
    const detached = !document.body.contains(source) || !document.body.contains(target);
    if (destinationReady || timedOut || detached) {
      clearBoardMoveAnimation(source);
      clearBoardMoveAnimation(target);
      sprites = sprites.filter((item) => item.id !== sprite.id);
      return;
    }

    const retry = setTimeout(() => {
      handOffWhenDestinationReady(source, target, sprite, startTime);
    }, boardMoveHandoffPollMs);
    timers.push(retry);
  }

  function spriteStyle(sprite: BoardMoveSprite) {
    return [
      `left: ${sprite.left}px`,
      `top: ${sprite.top}px`,
      `width: ${sprite.width}px`,
      `height: ${sprite.height}px`,
      `--board-move-source-slot-w: ${sprite.width}px`,
      `--board-move-start-x: ${sprite.startX.toFixed(3)}px`,
      `--board-move-start-y: ${sprite.startY.toFixed(3)}px`,
      `--board-move-start-scale: ${sprite.startScale.toFixed(6)}`,
      `--board-move-correction-x: ${sprite.correctionX.toFixed(3)}px`,
      `--board-move-correction-y: ${sprite.correctionY.toFixed(3)}px`,
      `--board-move-source-z: ${sprite.sourceZ}px`,
      `--board-move-target-z: ${sprite.targetZ}px`,
    ].join('; ');
  }

</script>

<span class="board-move-animation-layer" bind:this={motionLayer} aria-hidden="true">
  {#each sprites as sprite (sprite.id)}
    <span
      class="board-move-card"
      class:opponent-side={sprite.opponentSide}
      class:measuring={sprite.measuring}
      data-board-move-id={sprite.id}
      style={spriteStyle(sprite)}
    >
      <span class="board-move-card-inner">
        {#if sprite.html}
          {@html sprite.html}
        {:else}
          <span class="board-move-fallback">{sprite.fallbackName}</span>
        {/if}
      </span>
    </span>
  {/each}
</span>

<style>
  .board-move-animation-layer {
    position: absolute;
    inset: 0;
    z-index: 29;
    transform-style: preserve-3d;
    pointer-events: none;
  }

  .board-move-card {
    position: absolute;
    display: block;
    transform-origin: 50% 50%;
    transform-style: preserve-3d;
    animation: board-card-move 520ms cubic-bezier(0.22, 0.78, 0.2, 1) both;
    will-change: transform;
  }

  .board-move-card.measuring {
    opacity: 0;
    animation: none;
    transform:
      translate3d(0, 0, 0)
      translateZ(var(--board-move-target-z))
      scale(1);
  }

  .board-move-card-inner {
    display: block;
    width: 100%;
    height: 100%;
  }

  .board-move-card :global(.card-tile) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .board-move-card :global(.board-slot) {
    --slot-card-w: var(--board-move-source-slot-w);
    width: 100%;
    height: 100%;
    pointer-events: none;
    transition: none;
  }

  .board-move-card.opponent-side :global(.card-tile) {
    transform: rotate(180deg);
  }

  .board-move-card.opponent-side :global(.energy-badges) {
    inset: calc(var(--slot-card-w) * -0.095) 0 auto auto;
    justify-content: flex-end;
    transform: rotate(180deg);
  }

  .board-move-card.opponent-side :global(.energy-badges .attached-energy-symbol) {
    transform: rotate(180deg);
  }

  .board-move-card.opponent-side :global(.tool-card-preview) {
    inset: auto auto var(--tool-preview-top) 0;
    transform: rotate(180deg);
  }

  .board-move-card.opponent-side :global(.pokemon-status) {
    inset: auto auto 0 0;
    align-items: start;
    justify-items: start;
  }

  .board-move-card.opponent-side :global(.damage-counter-value) {
    transform: rotate(180deg);
  }

  .board-move-fallback {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 5px;
    background: #f7f8fa;
    box-shadow: 0 3px 8px rgba(23, 30, 38, 0.28);
    font-size: 12px;
    font-weight: 900;
    text-align: center;
  }

  :global(.board-slot.empty[data-board-move-animation-hidden="true"]) {
    border-color: transparent !important;
    background: transparent !important;
  }

  :global(.board-slot[data-board-move-animation-hidden="true"]) {
    transition: none !important;
  }

  :global(.board-slot[data-board-move-animation-hidden="true"] > .card-tile),
  :global(.board-slot[data-board-move-animation-hidden="true"] > .pokemon-status),
  :global(.board-slot[data-board-move-animation-hidden="true"] > .energy-badges),
  :global(.board-slot[data-board-move-animation-hidden="true"] > .tool-card-preview),
  :global(.board-slot[data-board-move-animation-hidden="true"] > .slot-badges),
  :global(.board-slot[data-board-move-animation-hidden="true"] > .empty-zone) {
    opacity: 0;
  }

  @keyframes board-card-move {
    0% {
      transform:
        translate3d(
          calc(var(--board-move-start-x) + var(--board-move-correction-x)),
          calc(var(--board-move-start-y) + var(--board-move-correction-y)),
          0
        )
        translateZ(var(--board-move-source-z))
        scale(var(--board-move-start-scale));
    }
    100% {
      transform:
        translate3d(var(--board-move-correction-x), var(--board-move-correction-y), 0)
        translateZ(var(--board-move-target-z))
        scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .board-move-card {
      animation: none;
    }
  }
</style>
