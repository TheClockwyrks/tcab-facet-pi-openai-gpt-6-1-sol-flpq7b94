import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import { initialize, update } from "./runtime";
import { render } from "./view";
import type { debug } from "./debug";

export const BACKGROUND = "#0b1d24";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  /** Loaded resources are the only non-data exception to the state contract. */
  readonly assets: Assets;
  /** Presentation history derived from prior board values, never read by rules. */
  readonly motion: Motion;
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
}

export interface Assets {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly effects: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
}
export interface Shard {
  readonly gem: GemState;
  readonly wave: number;
}
export interface Motion {
  readonly swap: readonly [CellRef, CellRef] | null;
  readonly prismSeed: readonly number[] | null;
  readonly shards: readonly Shard[];
  readonly created: readonly GemState[];
  readonly dealAt: number;
  readonly time: number;
  readonly cueEvents: readonly string[];
  readonly rung: number;
}
export type State = DeepReadonly<FacetState>;
export type FacetDebugApi = typeof debug;
export const game: Game<FacetState, FacetDebugApi> = {
  initialize,
  update,
  render,
};
