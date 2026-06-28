import type { ActionTimelineEvent, CardView, GameView } from '../game/types';

export type AnimationCoordinateSpace = 'board' | 'viewport' | 'cross-plane';

export type AnimationIdentity = {
  kind: 'card' | 'pokemon' | 'energy' | 'tool' | 'stadium' | 'prize' | 'unknown';
  playerIndex?: number;
  cardId?: number;
  serial?: number;
  name?: string;
};

export type AnimationAnchorRef =
  | {
      kind: 'hand-card';
      playerIndex: number;
      handIndex?: number;
      cardId?: number;
      cardSerial?: number;
    }
  | {
      kind: 'hand-slot';
      playerIndex: number;
      handIndex: number;
    }
  | {
      kind: 'deck-top';
      playerIndex: number;
    }
  | {
      kind: 'discard-top-card' | 'discard-pile-surface' | 'play-zone-card' | 'stadium-card';
      playerIndex: number;
      cardId?: number;
      cardSerial?: number;
    }
  | {
      kind: 'active-pokemon-card';
      playerIndex: number;
      pokemonSerial?: number;
    }
  | {
      kind: 'bench-pokemon-card' | 'bench-slot-surface';
      playerIndex: number;
      benchIndex: number;
      pokemonSerial?: number;
    }
  | {
      kind: 'attached-energy' | 'attached-tool';
      playerIndex: number;
      slot: 'active' | 'bench';
      slotIndex: number;
      cardSerial?: number;
    }
  | {
      kind: 'prize-card';
      playerIndex: number;
      prizeIndex: number;
    }
  | {
      kind: 'reveal-slot';
      playerIndex: number;
      revealIndex: number;
      cardId?: number;
      cardSerial?: number;
    };

export type AnimationVisibilityRole = 'source' | 'destination' | 'handoff';

export type AnimationVisibilityClaim = {
  scopeKey: string;
  anchor: AnimationAnchorRef;
  identity?: AnimationIdentity;
  role: AnimationVisibilityRole;
};

export type AnimationSpriteVisual =
  | {
      kind: 'card';
      card?: Pick<CardView, 'id' | 'serial' | 'name' | 'fullName' | 'cardImage' | 'imageUrl'>;
      faceDown?: boolean;
    }
  | {
      kind: 'anchor-snapshot';
      anchor: AnimationAnchorRef;
    }
  | {
      kind: 'pulse';
      tone: 'ability' | 'attack' | 'damage' | 'neutral';
    };

export type AnimationHandoffPolicy = {
  hideSourceUntil: 'none' | 'snapshot' | 'phase-end' | 'scope-exit';
  hideDestinationUntil: 'none' | 'arrival' | 'prepaint';
  removeSprite: 'arrival' | 'prepaint' | 'phase-end' | 'scope-exit';
  prepaintFrames?: number;
};

export type TimedAnimationMotionBase = {
  id: string;
  identity?: AnimationIdentity;
  startMs: number;
  durationMs: number;
};

export type CardMoveAnimationMotion = TimedAnimationMotionBase & {
  kind: 'card-move';
  sourceAnchor: AnimationAnchorRef;
  targetAnchor: AnimationAnchorRef;
  coordinateSpace: AnimationCoordinateSpace;
  spriteVisual: AnimationSpriteVisual;
  handoffPolicy: AnimationHandoffPolicy;
};

export type RevealSessionStep = TimedAnimationMotionBase & {
  kind: 'reveal' | 'select' | 'return' | 'take' | 'attach' | 'shuffle';
  sourceAnchor?: AnimationAnchorRef;
  targetAnchor?: AnimationAnchorRef;
  spriteVisual?: AnimationSpriteVisual;
  handoffPolicy?: AnimationHandoffPolicy;
};

export type RevealSessionAnimationMotion = TimedAnimationMotionBase & {
  kind: 'reveal-session';
  playerIndex: number;
  coordinateSpace: 'viewport';
  steps: RevealSessionStep[];
  handoffPolicy: AnimationHandoffPolicy;
};

export type PulseAnimationMotion = TimedAnimationMotionBase & {
  kind: 'pulse';
  anchor: AnimationAnchorRef;
  coordinateSpace: AnimationCoordinateSpace;
  spriteVisual: AnimationSpriteVisual;
};

export type ShuffleAnimationMotion = TimedAnimationMotionBase & {
  kind: 'shuffle';
  anchor: AnimationAnchorRef;
  coordinateSpace: AnimationCoordinateSpace;
};

export type SettleAnimationMotion = TimedAnimationMotionBase & {
  kind: 'settle';
  anchor: AnimationAnchorRef;
  coordinateSpace: AnimationCoordinateSpace;
  handoffPolicy: AnimationHandoffPolicy;
};

export type AnimationMotion =
  | CardMoveAnimationMotion
  | RevealSessionAnimationMotion
  | PulseAnimationMotion
  | ShuffleAnimationMotion
  | SettleAnimationMotion;

export type ReplayAnimationPhasePlan = {
  key: string;
  label?: string;
  view: GameView;
  actionTimeline: ActionTimelineEvent[];
  durationMs: number;
  motions: AnimationMotion[];
  visibilityClaims: AnimationVisibilityClaim[];
};

export type ReplayAnimationMotionTiming = {
  id: string;
  startMs: number;
  durationMs: number;
  endMs: number;
};

export function createReplayAnimationPhasePlan(input: {
  key: string;
  label?: string;
  view: GameView;
  actionTimeline?: ActionTimelineEvent[];
  durationMs: number;
  motions?: AnimationMotion[];
  visibilityClaims?: AnimationVisibilityClaim[];
}): ReplayAnimationPhasePlan {
  const motions = input.motions ?? [];
  const visibilityClaims = input.visibilityClaims ?? [];
  assertFiniteNonNegative(input.durationMs, 'durationMs');

  for (const motion of motions) {
    validateMotionTiming(motion);
  }

  const motionSpanMs = replayAnimationMotionSpanMs(motions);
  if (input.durationMs < motionSpanMs) {
    throw new Error(`Replay animation phase "${input.key}" duration ${input.durationMs}ms is shorter than motion span ${motionSpanMs}ms.`);
  }

  return {
    key: input.key,
    label: input.label,
    view: input.view,
    actionTimeline: input.actionTimeline ?? [],
    durationMs: input.durationMs,
    motions,
    visibilityClaims,
  };
}

export function replayAnimationMotionTiming(motion: AnimationMotion): ReplayAnimationMotionTiming {
  return {
    id: motion.id,
    startMs: motion.startMs,
    durationMs: motion.durationMs,
    endMs: motion.startMs + motion.durationMs,
  };
}

export function replayAnimationMotionTimings(plan: Pick<ReplayAnimationPhasePlan, 'motions'>): ReplayAnimationMotionTiming[] {
  return plan.motions.map(replayAnimationMotionTiming);
}

export function replayAnimationMotionSpanMs(motions: readonly AnimationMotion[]): number {
  return motions.reduce((spanMs, motion) => Math.max(spanMs, motion.startMs + motion.durationMs), 0);
}

export function replayAnimationPhasePlanDurationMs(plan: Pick<ReplayAnimationPhasePlan, 'durationMs'>): number {
  return plan.durationMs;
}

function validateMotionTiming(motion: AnimationMotion): void {
  assertFiniteNonNegative(motion.startMs, `${motion.id}.startMs`);
  assertFiniteNonNegative(motion.durationMs, `${motion.id}.durationMs`);

  if (motion.kind === 'reveal-session') {
    for (const step of motion.steps) {
      assertFiniteNonNegative(step.startMs, `${motion.id}.${step.id}.startMs`);
      assertFiniteNonNegative(step.durationMs, `${motion.id}.${step.id}.durationMs`);
    }
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Replay animation timing "${label}" must be a finite non-negative number.`);
  }
}
