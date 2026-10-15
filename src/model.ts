import * as C from "./constants";
import type {
  Assets,
  BoardState,
  CellRef,
  Cut,
  FacetState,
  GemKind,
  GemState,
  Motion,
  State,
} from "./game";

export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
export const same = (a: CellRef | null, b: CellRef | null) =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const emptyBoard = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export const emptyMotion = (): Motion => ({
  swap: null,
  prismSeed: null,
  shards: [],
  created: [],
  dealAt: -10,
  time: 0,
  cueEvents: [],
  rung: 0,
});
export const refillDefault = () => Array<string>(C.GRID_COLS).fill("");
export function initial(assets: Assets, muted = false): FacetState {
  return {
    assets,
    motion: emptyMotion(),
    screen: "title",
    menuIndex: 0,
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: refillDefault(),
  };
}
export function whole(n: number, min = 0): number {
  if (!Number.isInteger(n) || n < min)
    throw new RangeError(`Expected an integer >= ${min}`);
  return n;
}
export function cell(col: number, row: number): CellRef {
  whole(col);
  whole(row);
  if (col >= C.GRID_COLS || row >= C.GRID_ROWS)
    throw new RangeError("Cell outside board");
  return { col, row };
}
export const LETTERS = "RACJBSM";
export function parse(token: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(token))
    throw new Error(`Invalid gem token: ${token}`);
  const prism = token[0] === "X";
  return {
    col,
    row,
    kind: prism ? null : C.GEM_KINDS[LETTERS.indexOf(token[0])],
    strain: Number(token[1]),
    cut: prism
      ? "prism"
      : token[2] === "b"
        ? "brilliant"
        : token[2] === "s"
          ? "star"
          : "plain",
    fell: 0,
  };
}
const randomKind = (): GemKind =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function board(cells: readonly GemState[]): BoardState {
  return { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
}
export interface Run {
  readonly ids: readonly number[];
  readonly axis: "h" | "v";
}
export function runs(b: BoardState): Run[] {
  const found: Run[] = [];
  for (const axis of ["h", "v"] as const) {
    for (let line = 0; line < C.GRID_ROWS; line++) {
      let ids: number[] = [];
      let kind: GemKind | null = null;
      const finish = () => {
        if (kind && ids.length >= C.MATCH_MIN) found.push({ ids, axis });
      };
      for (let pos = 0; pos <= C.GRID_COLS; pos++) {
        const id =
          axis === "h" ? line * C.GRID_COLS + pos : pos * C.GRID_COLS + line;
        const next = pos < C.GRID_COLS ? (b.cells[id]?.kind ?? null) : null;
        if (next !== kind || pos === C.GRID_COLS) {
          finish();
          ids = [];
          kind = next;
        }
        ids.push(id);
      }
    }
  }
  return found;
}
function exchange(b: BoardState, a: CellRef, z: CellRef): BoardState {
  const ia = index(a),
    iz = index(z);
  return board(
    b.cells.map((g, i) =>
      i === ia
        ? { ...b.cells[iz], ...a, fell: 0 }
        : i === iz
          ? { ...b.cells[ia], ...z, fell: 0 }
          : g,
    ),
  );
}
export function productive(b: BoardState, a: CellRef, z: CellRef): boolean {
  return (
    !!b.cells[index(a)] &&
    !!b.cells[index(z)] &&
    (b.cells[index(a)].cut === "prism" ||
      b.cells[index(z)].cut === "prism" ||
      runs(exchange(b, a, z)).length > 0)
  );
}
export function legalSwap(b: BoardState): boolean {
  return b.cells.some((g) =>
    [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ].some((z) => z.col < b.cols && z.row < b.rows && productive(b, g, z)),
  );
}
export function deal(): BoardState {
  for (;;) {
    const gems: GemState[] = [];
    for (let r = 0; r < C.GRID_ROWS; r++)
      for (let c = 0; c < C.GRID_COLS; c++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (c > 1 &&
            gems[r * C.GRID_COLS + c - 1].kind === kind &&
            gems[r * C.GRID_COLS + c - 2].kind === kind) ||
          (r > 1 &&
            gems[(r - 1) * C.GRID_COLS + c].kind === kind &&
            gems[(r - 2) * C.GRID_COLS + c].kind === kind)
        );
        gems.push({
          col: c,
          row: r,
          kind,
          cut: "plain",
          strain: 0,
          fell: C.GRID_ROWS,
        });
      }
    const b = board(gems);
    if (legalSwap(b)) return b;
  }
}
export function requestSwap(s: State, a: CellRef, z: CellRef): FacetState {
  if (s.phase !== "idle" || !adjacent(a, z) || !productive(s.board, a, z))
    return { ...s, refusal: { a, b: z, timer: 0 } };
  const swapped = exchange(s.board, a, z);
  const ga = s.board.cells[index(a)],
    gz = s.board.cells[index(z)];
  let prismSeed: number[] | null = null;
  if (ga.cut === "prism" || gz.cut === "prism") {
    const kind = ga.cut === "prism" ? gz.kind : ga.kind;
    prismSeed = swapped.cells.flatMap((g, i) =>
      kind === null ||
      g.kind === kind ||
      (g.cut === "prism" && (i === index(a) || i === index(z)))
        ? [i]
        : [],
    );
  }
  return {
    ...s,
    board: swapped,
    phase: "swapping",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    moveScore: 0,
    motion: {
      ...emptyMotion(),
      swap: [a, z],
      prismSeed,
      time: s.motion.time,
      dealAt: s.motion.dealAt,
    },
  };
}
export function neighbors(id: number, diagonals = false): number[] {
  const c = id % C.GRID_COLS,
    r = Math.floor(id / C.GRID_COLS),
    ids: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (
        (dx === 0 && dy === 0) ||
        (!diagonals && Math.abs(dx) + Math.abs(dy) !== 1)
      )
        continue;
      if (
        c + dx >= 0 &&
        c + dx < C.GRID_COLS &&
        r + dy >= 0 &&
        r + dy < C.GRID_ROWS
      )
        ids.push((r + dy) * C.GRID_COLS + c + dx);
    }
  return ids;
}
export function clearSet(
  b: BoardState,
  seed: readonly number[],
): Map<number, number> {
  const waves = new Map(seed.map((i) => [i, 0]));
  const queue = [...seed];
  for (let at = 0; at < queue.length; at++) {
    const id = queue[at],
      g = b.cells[id],
      wave = waves.get(id)!;
    const additions = neighbors(id).filter(
      (n) => b.cells[n].strain === C.MAX_STRAIN,
    );
    if (g.cut === "brilliant") additions.push(...neighbors(id, true));
    if (g.cut === "star")
      b.cells.forEach((v, i) => {
        if (v.col === g.col || v.row === g.row) additions.push(i);
      });
    for (const n of additions)
      if (!waves.has(n)) {
        waves.set(n, wave + 1);
        queue.push(n);
      }
  }
  return waves;
}
export function creations(
  b: BoardState,
  found: readonly Run[],
  swap: readonly CellRef[] | null,
): Map<number, GemState> {
  const made = new Map<number, GemState>();
  const priority: Record<Cut, number> = {
    plain: 0,
    brilliant: 1,
    star: 2,
    prism: 3,
  };
  const add = (id: number, cut: Cut) => {
    if (priority[cut] <= priority[made.get(id)?.cut ?? "plain"]) return;
    made.set(id, {
      ...b.cells[id],
      kind: cut === "prism" ? null : b.cells[id].kind,
      cut,
      strain: 0,
      fell: 0,
    });
  };
  for (const run of found) {
    for (const other of found)
      if (run.axis !== other.axis)
        for (const id of run.ids) if (other.ids.includes(id)) add(id, "star");
    if (run.ids.length < C.MATCH_MIN + 1) continue;
    const positions = swap
      ? run.ids.filter((i) => swap.some((p) => index(p) === i))
      : [];
    const id = positions[0] ?? run.ids[Math.floor((run.ids.length - 1) / 2)];
    add(id, run.ids.length >= C.MATCH_MIN + 2 ? "prism" : "brilliant");
  }
  return made;
}
export const lastFall = (s: State) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const landAt = (s: State) =>
  s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
export const stepHold = (s: State) => landAt(s) + C.STEP_SECONDS;
export function resolve(s: State): FacetState {
  const found = s.chainStep === 1 && s.motion.prismSeed ? [] : runs(s.board);
  const seed =
    s.chainStep === 1 && s.motion.prismSeed
      ? s.motion.prismSeed
      : found.flatMap((r) => [...r.ids]);
  const waves = clearSet(s.board, [...new Set(seed)]);
  if (waves.size === 0) return s;
  const made = creations(s.board, found, s.motion.swap);
  const m = Math.min(s.chainStep, C.MAX_MULTIPLIER);
  let points = 0,
    flaw = false;
  const remains: (GemState | null)[] = s.board.cells.map((g, i) => {
    if (waves.has(i)) {
      points += (g.strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) * m;
      return made.get(i) ?? null;
    }
    const strain = Math.min(
      C.MAX_STRAIN,
      g.strain + (neighbors(i).some((n) => waves.has(n)) ? 1 : 0),
    );
    if (strain === C.MAX_STRAIN && g.strain < strain) flaw = true;
    return { ...g, strain, fell: 0 };
  });
  const cells: GemState[] = [];
  for (let c = 0; c < C.GRID_COLS; c++) {
    const survivors = remains.filter(
      (g): g is GemState => g !== null && g.col === c,
    );
    const empty = C.GRID_ROWS - survivors.length;
    for (let r = 0; r < C.GRID_ROWS; r++) {
      if (r < empty) {
        const letter = s.refillKinds[c]?.[r];
        cells[r * C.GRID_COLS + c] = {
          col: c,
          row: r,
          kind: letter ? C.GEM_KINDS[LETTERS.indexOf(letter)] : randomKind(),
          cut: "plain",
          strain: 0,
          fell: empty,
        };
      } else {
        const g = survivors[r - empty];
        cells[r * C.GRID_COLS + c] = { ...g, row: r, fell: r - g.row };
      }
    }
  }
  return {
    ...s,
    board: board(cells),
    stepTimer: 0,
    lastCleared: waves.size,
    lastPoints: points,
    lastWaves: Math.max(0, ...waves.values()),
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    bestChain: Math.max(s.bestChain, s.chainStep),
    motion: {
      ...s.motion,
      shards: [...waves].map(([id, wave]) => ({
        gem: s.board.cells[id],
        wave,
      })),
      created: [...made.values()],
      rung: m,
      cueEvents: [
        C.CUES.clear,
        ...(flaw ? [C.CUES.flaw] : []),
        ...(made.size ? [C.CUES.cut] : []),
      ],
    },
  };
}
/** Consume all elapsed time, including the residual crossing phase boundaries. */
export function advance(s: State, dt: number, events: Set<string>): FacetState {
  let next: FacetState = s;
  if (next.refusal)
    next = {
      ...next,
      refusal:
        next.refusal.timer + dt + 1e-10 >= C.REFUSAL_SECONDS
          ? null
          : { ...next.refusal, timer: next.refusal.timer + dt },
    };
  let remaining = dt;
  while (remaining > 1e-10 && next.phase !== "idle") {
    if (next.phase === "swapping") {
      const use = Math.min(remaining, C.SWAP_SECONDS - next.swapTimer);
      remaining -= use;
      next = { ...next, swapTimer: next.swapTimer + use };
      if (next.swapTimer + 1e-10 < C.SWAP_SECONDS) break;
      next = resolve({
        ...next,
        phase: "resolving",
        chainStep: 1,
        swapTimer: 0,
      });
      next.motion.cueEvents.forEach((e) => events.add(e));
    } else {
      const old = next.stepTimer,
        use = Math.min(remaining, stepHold(next) - old);
      remaining -= use;
      next = { ...next, stepTimer: old + use };
      if (
        old + 1e-10 < landAt(next) &&
        next.stepTimer + 1e-10 >= landAt(next) &&
        lastFall(next) > C.LAND_MIN_ROWS
      )
        events.add(C.CUES.land);
      if (next.stepTimer + 1e-10 < stepHold(next)) break;
      if (runs(next.board).length) {
        next = resolve({ ...next, chainStep: next.chainStep + 1 });
        next.motion.cueEvents.forEach((e) => events.add(e));
      } else {
        next = {
          ...next,
          phase: "idle",
          stepTimer: 0,
          chainStep: 0,
          bestMove: Math.max(next.bestMove, next.moveScore),
          motion: { ...next.motion, shards: [], created: [], cueEvents: [] },
        };
        if (next.levelScore >= C.LEVEL_TARGET_STEP * next.level) {
          next = {
            ...next,
            screen: "levelclear",
            menuIndex: 0,
            armedTarget: null,
          };
          events.add(C.CUES.levelUp);
        } else if (!legalSwap(next.board)) {
          next = {
            ...next,
            screen: "gameover",
            menuIndex: 0,
            armedTarget: null,
          };
          events.add(C.CUES.gameOver);
        }
      }
    }
  }
  return next;
}
