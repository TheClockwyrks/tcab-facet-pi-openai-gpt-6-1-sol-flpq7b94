import * as C from "./constants";
import type { FacetState, PointerDevice, Screen, State } from "./game";
import {
  board,
  cell,
  cellX,
  cellY,
  deal,
  emptyBoard,
  index,
  initial,
  lastFall,
  legalSwap,
  parse,
  refillDefault,
  requestSwap,
  stepHold,
  whole,
} from "./model";
import { pointer, targets } from "./controls";

export function snapshot(s: State) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection ? { ...s.selection } : null,
    offer: s.offer ? { ...s.offer } : null,
    refusal: s.refusal
      ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
      : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
const points = (n: number) => {
  if (!Number.isFinite(n) || n < 0)
    throw new RangeError("Points must be nonnegative and finite");
  return n;
};
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: State): FacetState => initial(s.assets, s.muted),
  reconcile: (s: State): FacetState => ({ ...s }),
  snapshot,
  setScreen(s: State, screen: Screen): FacetState {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: State, menuIndex: number): FacetState => ({
    ...s,
    menuIndex: whole(menuIndex),
  }),
  loadBoard(s: State, rows: readonly string[]): FacetState {
    if (rows.length !== C.GRID_ROWS)
      throw new Error("Expected eight board rows");
    const cells = rows.flatMap((line, row) => {
      const tokens = line.trim().split(/\s+/);
      if (tokens.length !== C.GRID_COLS)
        throw new Error("Expected eight cells per row");
      return tokens.map((token, col) => parse(token, col, row));
    });
    return { ...s, board: board(cells) };
  },
  dealBoard: (s: State): FacetState => ({
    ...s,
    board: deal(),
    motion: { ...s.motion, dealAt: s.motion.time },
  }),
  clearBoard: (s: State): FacetState => ({ ...s, board: emptyBoard() }),
  setGem(s: State, col: number, row: number, token: string): FacetState {
    const id = index(cell(col, row));
    if (!s.board.cells[id]) throw new Error("No board cell to set");
    const gem = parse(token, col, row);
    return {
      ...s,
      board: board(s.board.cells.map((g, i) => (i === id ? gem : g))),
    };
  },
  setRefillKinds(s: State, col: number, kinds: string): FacetState {
    cell(col, 0);
    if (!/^[RACJBSM]*$/.test(kinds))
      throw new Error("Invalid refill kind string");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, i) => (i === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s: State): FacetState => ({
    ...s,
    refillKinds: refillDefault(),
  }),
  setScore: (s: State, score: number): FacetState => ({
    ...s,
    score: points(score),
  }),
  setLevel: (s: State, level: number): FacetState => ({
    ...s,
    level: whole(level, 1),
  }),
  setLevelScore: (s: State, levelScore: number): FacetState => ({
    ...s,
    levelScore: points(levelScore),
  }),
  setBestChain: (s: State, bestChain: number): FacetState => ({
    ...s,
    bestChain: whole(bestChain),
  }),
  setBestMove: (s: State, bestMove: number): FacetState => ({
    ...s,
    bestMove: points(bestMove),
  }),
  setMoveScore: (s: State, moveScore: number): FacetState => ({
    ...s,
    moveScore: points(moveScore),
  }),
  setSelection: (s: State, col: number, row: number): FacetState => ({
    ...s,
    selection: cell(col, row),
  }),
  clearSelection: (s: State): FacetState => ({ ...s, selection: null }),
  setOffer: (s: State, col: number, row: number): FacetState => ({
    ...s,
    offer: cell(col, row),
  }),
  clearOffer: (s: State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: State,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState => requestSwap(s, cell(colA, rowA), cell(colB, rowB)),
  pointerDown: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState => pointer(s, "down", x, y, device),
  pointerMove: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState => pointer(s, "move", x, y, device),
  pointerUp: (s: State, device: PointerDevice = "mouse"): FacetState =>
    pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
