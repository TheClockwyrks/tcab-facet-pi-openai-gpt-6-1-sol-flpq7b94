/// <reference types="node" />
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { game, BACKGROUND } from "./game";
import type { FacetState, State } from "./game";
import * as C from "./constants";
import { debug } from "./debug";
import { action, hitCell, targets } from "./controls";
import {
  advance,
  board,
  cellX,
  cellY,
  clearSet,
  creations,
  deal,
  index,
  initial,
  lastFall,
  legalSwap,
  parse,
  requestSwap,
  resolve,
  runs,
  stepHold,
} from "./model";

const latin = Array.from({ length: C.GRID_ROWS }, (_, r) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, c) => "RACJBSM"[(c + r * 2) % C.GEM_KIND_COUNT] + "0",
  ).join(" "),
);
const bare = () =>
  debug.loadBoard(
    debug.setScreen(initial({ images: {}, effects: {} }), "playing"),
    latin,
  );
const set = (s: State, c: number, r: number, token: string) =>
  debug.setGem(s, c, r, token);
function line(
  s: State,
  row = 3,
  start = 2,
  length = 3,
  token = "R0",
): FacetState {
  let n: FacetState = s;
  for (let c = start; c < start + length; c++) n = set(n, c, row, token);
  return n;
}
function refill(s: State): FacetState {
  let n: FacetState = s;
  for (let c = 0; c < C.GRID_COLS; c++)
    n = debug.setRefillKinds(
      n,
      c,
      latin.map((r) => r.split(" ")[c][0]).join(""),
    );
  return n;
}
function step(s: State): FacetState {
  return resolve({ ...refill(s), phase: "resolving", chainStep: 1 });
}

// Exercise the actual engine over an in-process canvas, real PNG decoding, a
// file-backed fetch and counted clocks. Web Audio is an event-only test host.
const events = new EventTarget();
const engine = createEngine({
  canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
  width: C.STAGE_W,
  height: C.STAGE_H,
  background: BACKGROUND,
  game,
  clock: new ConstantClock(10),
  surface: {
    cssWidth: () => C.STAGE_W,
    cssHeight: () => C.STAGE_H,
    dpr: () => 1,
    events: () => events,
  },
});
const cues: string[] = [];
beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(`public/${path}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData() {
        return Promise.resolve({ duration: 1 });
      }
      resume() {
        return Promise.resolve();
      }
    },
  );
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  await engine.initialize();
});
beforeEach(() => {
  engine.apply((s) => debug.reset(s));
  engine.setClock(new ConstantClock(10));
  cues.length = 0;
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  engine.destroy();
  vi.unstubAllGlobals();
});
const key = (code: string, type = "keydown") =>
  events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
async function press(code: string): Promise<void> {
  key(code);
  await engine.advance(1);
  key(code, "keyup");
  await engine.advance(1);
}
function nativePointer(
  type: string,
  x: number,
  y: number,
  device = "mouse",
  primary = true,
): void {
  events.dispatchEvent(
    Object.assign(new Event(`pointer${type}`), {
      clientX: x,
      clientY: y,
      pointerId: primary ? 1 : 2,
      pointerType: device,
      isPrimary: primary,
      button: 0,
      buttons: type === "up" ? 0 : 1,
    }),
  );
}

describe("initialization, screens and the real runtime", () => {
  it("loads every sprite and reports the complete title snapshot", () => {
    const s = debug.snapshot(engine.state);
    expect(s).toMatchObject({
      version: C.FACET_DEBUG_VERSION,
      screen: "title",
      board: { cols: 0, rows: 0, cells: [] },
      score: 0,
      level: 1,
      chainStep: 0,
      legalSwap: false,
      pointer: { x: 0, y: 0, down: false, device: "mouse" },
    });
    expect(Object.keys(engine.state.assets.images)).toHaveLength(139);
    expect(s.refillKinds).toEqual(Array(C.GRID_COLS).fill(""));
    expect(engine.diagnostics().every((v) => v.error === undefined)).toBe(true);
  });
  it("starts a valid opening board and pauses its timers", async () => {
    await press("Enter");
    expect(engine.state.screen).toBe("playing");
    expect(runs(engine.state.board)).toEqual([]);
    expect(legalSwap(engine.state.board)).toBe(true);
    expect(
      engine.state.board.cells.every(
        (g) => g.cut === "plain" && g.strain === 0 && g.fell >= g.row + 1,
      ),
    ).toBe(true);
    await press("KeyP");
    const before = engine.state;
    await engine.advance(50);
    expect(engine.state.motion).toEqual(before.motion);
    expect(engine.state.board).toBe(before.board);
    expect(engine.state.simTime).toBeCloseTo(before.simTime + 0.5);
    await press("Escape");
    expect(engine.state.screen).toBe("playing");
  });
  it("wraps both menu directions, handles howto back and both confirm keys", async () => {
    await press("ArrowUp");
    expect(engine.state.menuIndex).toBe(1);
    await press("Space");
    expect(engine.state.screen).toBe("howto");
    await press("Escape");
    expect(engine.state).toMatchObject({ screen: "title", menuIndex: 1 });
    await press("ArrowDown");
    expect(engine.state.menuIndex).toBe(0);
    await press("Space");
    expect(engine.state.screen).toBe("playing");
    await press("Escape");
    await press("ArrowDown");
    await press("Enter");
    expect(engine.state).toMatchObject({
      screen: "title",
      phase: "idle",
      selection: null,
      offer: null,
    });
    expect(engine.state.board.cells).toHaveLength(0);
  });
  it("mutes from any screen and preserves the runtime bit through reset", async () => {
    const previous = engine.state.muted;
    await press("KeyM");
    expect(engine.state.muted).toBe(!previous);
    engine.apply((s) => debug.reset(s));
    expect(engine.state.muted).toBe(!previous);
    await press("KeyM");
    expect(engine.state.muted).toBe(previous);
  });
  it("reports targets with fingertip geometry on all screens and takes them", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      let s = debug.setScreen(bare(), screen);
      const ts = targets(s);
      expect(ts).toHaveLength(
        screen === "howto" || screen === "playing" ? 1 : 2,
      );
      for (const t of ts) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
      const t = ts[0];
      s = debug.pointerDown(s, t.x + t.w / 2, t.y + t.h / 2, "touch");
      expect(s.armedTarget).toBe(t.id);
      s = debug.pointerUp(s, "touch");
      expect(s.armedTarget).toBeNull();
      expect(s.screen).not.toBe(screen);
    }
  });
  it("renders every screen and records genuine engine frames", async () => {
    engine.startRecording();
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      engine.apply((s) => debug.setScreen(debug.loadBoard(s, latin), screen));
      await engine.advance(1);
    }
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(6);
    expect(recording.ops.length).toBeGreaterThan(100);
  });
});

describe("rules: runs, expansion, pressure, cuts and gravity", () => {
  it("finds only maximal horizontal/vertical runs and excludes prisms", () => {
    let s = line(bare(), 3, 1, 5);
    for (let r = 1; r < 6; r++) s = set(s, 3, r, "R2s");
    const rr = runs(s.board);
    expect(rr.filter((r) => r.ids.length >= 5)).toHaveLength(2);
    expect(
      creations(s.board, rr, null).get(index({ col: 3, row: 3 }))?.cut,
    ).toBe("prism");
    const prism = board(
      s.board.cells.map((g) => ({ ...g, kind: null, cut: "prism" as const })),
    );
    expect(runs(prism)).toEqual([]);
  });
  it("enforces R1, R2, R3 without exchanging refused cells", () => {
    const s = bare();
    for (const z of [
      { col: 0, row: 0 },
      { col: 1, row: 1 },
      { col: 7, row: 7 },
      { col: 1, row: 0 },
    ]) {
      const refused = requestSwap(s, { col: 0, row: 0 }, z);
      expect(refused.board).toBe(s.board);
      expect(refused.refusal).not.toBeNull();
    }
    const running = requestSwap(
      { ...line(s), phase: "resolving" },
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    );
    expect(running.phase).toBe("resolving");
    expect(running.refusal).not.toBeNull();
  });
  it("expands a breadth-first minimal wave through flaws, brilliants and stars", () => {
    let s = set(bare(), 1, 1, "R0b");
    s = set(s, 2, 2, "J3");
    s = set(s, 3, 2, "A3");
    s = set(s, 4, 2, "B0s");
    s = set(s, 4, 3, "C3");
    const waves = clearSet(s.board, [index({ col: 1, row: 1 })]);
    expect(waves.size).toBe(10);
    expect(waves.get(index({ col: 2, row: 2 }))).toBe(1);
    expect(waves.get(index({ col: 3, row: 2 }))).toBe(2);
    expect(waves.has(index({ col: 4, row: 2 }))).toBe(false);
    const star = clearSet(s.board, [index({ col: 4, row: 2 })]);
    expect(star.size).toBeGreaterThanOrEqual(15);
    expect(star.get(index({ col: 4, row: 3 }))).toBe(1);
  });
  it("strains neighbors once, caps damage, and scores prior strain at double", () => {
    let s = line(bare(), 7, 2, 3);
    s = set(s, 2, 6, "J2");
    s = set(s, 3, 7, "R3");
    const n = step(s);
    expect(n.lastCleared).toBe(3);
    expect(n.lastPoints).toBe(40);
    expect(
      n.board.cells.find(
        (g) => g.kind === "jade" && g.col === 2 && g.strain === C.MAX_STRAIN,
      ),
    ).toBeDefined();
    expect(n.motion.cueEvents).toContain(C.CUES.flaw);
    expect(s.board.cells[index({ col: 2, row: 6 })].strain).toBe(2);
  });
  it("creates a brilliant at the lower-index swapped run cell", () => {
    const s = line(bare(), 3, 1, 4);
    const made = creations(s.board, runs(s.board), [
      { col: 4, row: 3 },
      { col: 3, row: 3 },
    ]);
    expect(made.get(index({ col: 3, row: 3 }))).toMatchObject({
      cut: "brilliant",
      strain: 0,
      kind: "ruby",
    });
    expect(step(s).motion.created.some((g) => g.cut === "brilliant")).toBe(
      true,
    );
  });
  it("creates a star at a crossing and a prism outranks it", () => {
    let s = line(bare(), 3, 2, 3);
    s = set(set(s, 3, 2, "R0"), 3, 4, "R0");
    expect(creations(s.board, runs(s.board), null).get(27)?.cut).toBe("star");
    s = line(s, 3, 1, 5);
    expect(creations(s.board, runs(s.board), null).get(27)?.cut).toBe("prism");
  });
  it("settles every column in order, preserving strain and cut, with posed row refills", () => {
    let s = line(bare(), 5, 2, 3);
    s = set(s, 2, 4, "M2s");
    s = debug.setRefillKinds(s, 2, "BCJASMRB");
    const n = resolve({ ...s, phase: "resolving", chainStep: 1 });
    expect(n.board.cells[2]).toMatchObject({
      kind: "beryl",
      strain: 0,
      cut: "plain",
      fell: 1,
    });
    expect(n.board.cells[5 * C.GRID_COLS + 2]).toMatchObject({
      kind: "amethyst",
      cut: "star",
      strain: 3,
      fell: 1,
    });
    expect(n.board.cells).toHaveLength(C.GRID_ROWS * C.GRID_COLS);
    expect(
      n.board.cells.every(
        (g, i) =>
          g.row === Math.floor(i / C.GRID_COLS) && g.col === i % C.GRID_COLS,
      ),
    ).toBe(true);
  });
  it("prism versus kind seeds that kind, and two prisms seed the entire board", () => {
    let s = set(bare(), 0, 0, "X0");
    const count = s.board.cells.filter(
      (g) => g.kind === s.board.cells[1].kind,
    ).length;
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    expect(s.motion.prismSeed).toHaveLength(count + 1);
    const n = advance(s, C.SWAP_SECONDS, new Set());
    expect(n.lastCleared).toBe(count + 1);
    expect(n.motion.created).toEqual([]);
    s = requestSwap(
      set(set(bare(), 0, 0, "X0"), 1, 0, "X3"),
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    );
    expect(advance(s, C.SWAP_SECONDS, new Set()).lastCleared).toBe(
      C.GRID_COLS * C.GRID_ROWS,
    );
  });
  it("caps the score multiplier and reports a wave/fall-specific hold", () => {
    const n = resolve({
      ...refill(line(bare())),
      phase: "resolving",
      chainStep: C.MAX_MULTIPLIER + 4,
    });
    expect(n.lastPoints).toBe(n.lastCleared * C.BASE_SCORE * C.MAX_MULTIPLIER);
    expect(stepHold(n)).toBeCloseTo(
      n.lastWaves * C.WAVE_SECONDS +
        lastFall(n) * C.FALL_SECONDS_PER_ROW +
        C.STEP_SECONDS,
    );
  });
  it("deals many run-free, playable opening boards", () => {
    for (let i = 0; i < 30; i++) {
      const b = deal();
      expect(runs(b)).toEqual([]);
      expect(legalSwap(b)).toBe(true);
    }
  });
});

describe("time integration and round boundaries", () => {
  it("holds the exchanged board through swap duration then resolves the first step", async () => {
    engine.apply((s) => debug.loadBoard(debug.setScreen(s, "playing"), latin));
    engine.apply((s) => line(s));
    engine.apply((s) => refill(s));
    engine.apply((s) => debug.requestSwap(s, 6, 7, 7, 7));
    const swapped = engine.state.board;
    await engine.advance(17);
    expect(engine.state.phase).toBe("swapping");
    expect(engine.state.board).toBe(swapped);
    expect(engine.state.score).toBe(0);
    await engine.advance(1);
    expect(engine.state).toMatchObject({
      phase: "resolving",
      chainStep: 1,
      swapTimer: 0,
      stepTimer: 0,
    });
    expect(cues.filter((c) => c === C.CUES.clear)).toHaveLength(1);
    const fell = engine.state.board.cells.map((g) => g.fell);
    await engine.advance(200);
    expect(engine.state.phase).toBe("idle");
    expect(engine.state.chainStep).toBe(0);
    expect(engine.state.board.cells.map((g) => g.fell)).toEqual(fell);
  });
  it("gives the same chain result across regular and uneven deltas", () => {
    const s = requestSwap(
      refill(line(bare(), 7, 2, 3)),
      { col: 6, row: 7 },
      { col: 7, row: 7 },
    );
    const seed = 123;
    function simulate(
      deltas: readonly number[],
    ): ReturnType<typeof debug.snapshot> {
      let rng = seed;
      vi.spyOn(Math, "random").mockImplementation(() => {
        rng = (rng * 1664525 + 1013904223) >>> 0;
        return rng / 4294967296;
      });
      let n: FacetState = s;
      deltas.forEach((dt) => {
        n = advance(n, dt, new Set());
      });
      return debug.snapshot(n);
    }
    expect(simulate(Array(200).fill(0.01))).toEqual(
      simulate([0.11, 0.31, 0.07, 0.51, 1]),
    );
  });
  it("pauses a swapping board, refuses age only on playing, and uses SequenceClock", async () => {
    engine.apply((s) => debug.loadBoard(s, latin));
    engine.apply((s) => debug.setScreen(line(s), "playing"));
    engine.apply((s) => debug.requestSwap(s, 6, 7, 7, 7));
    engine.apply((s) => debug.setScreen(s, "paused"));
    engine.setClock(new SequenceClock([11, 29, 35, 25]));
    await engine.advance(20);
    expect(engine.state.swapTimer).toBe(0);
    engine.apply((s) => debug.setScreen(s, "playing"));
    await engine.advance(4);
    expect(engine.state.swapTimer).toBeCloseTo(0.1);
    engine.apply((s) => debug.clearChain(s));
    engine.apply((s) => debug.requestSwap(s, 0, 0, 7, 7));
    await engine.advance(12);
    expect(engine.state.refusal).toBeNull();
  });
  it("level completion wins over no-move ending and Continue resets level-only stats", () => {
    const s = step(line(bare(), 0, 0, 3));
    let n = {
      ...s,
      board: bare().board,
      levelScore: C.LEVEL_TARGET_STEP,
      bestMove: 5,
      moveScore: 90,
      bestChain: 3,
    };
    n = advance(n, stepHold(n), new Set());
    expect(n.screen).toBe("levelclear");
    expect(n.bestMove).toBe(90);
    const next = action(n, "confirm");
    expect(next).toMatchObject({
      screen: "playing",
      level: 2,
      levelScore: 0,
      bestChain: 0,
      bestMove: 0,
      score: s.score,
    });
    expect(runs(next.board)).toEqual([]);
    expect(legalSwap(next.board)).toBe(true);
  });
  it("ends a round at no legal moves, retries fresh, and gameover back retains board", () => {
    const n = advance(
      { ...step(line(bare())), board: bare().board },
      2,
      new Set(),
    );
    expect(n.screen).toBe("gameover");
    expect(action(n, "back").board).toBe(n.board);
    expect(action(n, "confirm")).toMatchObject({
      screen: "playing",
      score: 0,
      level: 1,
    });
    expect(action({ ...n, menuIndex: 1 }, "confirm").board.cells).toHaveLength(
      0,
    );
  });
});

describe("pointer interaction, including immediate debug poses", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "selects, offers, withdraws and requests only on release (%s)",
    (device) => {
      let s = set(bare(), 0, 0, "X0");
      s = debug.pointerDown(s, cellX(0), cellY(0), device);
      expect(s.selection).toEqual({ col: 0, row: 0 });
      s = debug.pointerMove(s, cellX(1), cellY(0), device);
      expect(s.offer).toEqual({ col: 1, row: 0 });
      expect(s.phase).toBe("idle");
      s = debug.pointerMove(s, cellX(0), cellY(0), device);
      expect(s.offer).toBeNull();
      s = debug.pointerUp(s, device);
      expect(s.selection).not.toBeNull();
      expect(s.phase).toBe("idle");
      s = debug.pointerDown(s, cellX(1), cellY(0), device);
      expect(s.offer).not.toBeNull();
      s = debug.pointerUp(s, device);
      expect(s.phase).toBe("swapping");
      expect(s.selection).toBeNull();
      expect(s.offer).toBeNull();
      expect(s.pointer.device).toBe(device);
    },
  );
  it("retargets a distant press, ignores distant drags and clears on an empty press", () => {
    let s = debug.pointerDown(bare(), cellX(0), cellY(0));
    s = debug.pointerMove(s, cellX(4), cellY(4));
    expect(s.selection).toEqual({ col: 0, row: 0 });
    s = debug.pointerUp(s);
    s = debug.pointerDown(s, cellX(4), cellY(4));
    expect(s.selection).toEqual({ col: 4, row: 4 });
    s = debug.pointerDown(s, 20, 400);
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
  });
  it("breaks exact hit ties by lowest row then column, and rejects corner misses", () => {
    expect(hitCell(cellX(0) + C.GEM_HIT_R, cellY(0))).toEqual({
      col: 0,
      row: 0,
    });
    expect(hitCell(cellX(0), cellY(0) + C.GEM_HIT_R)).toEqual({
      col: 0,
      row: 0,
    });
    expect(hitCell(cellX(0) + C.GEM_HIT_R, cellY(0) + C.GEM_HIT_R)).toBeNull();
  });
  it("arms targets only for a matching release and disarms on screen changes", () => {
    let s = initial({ images: {}, effects: {} });
    const t = targets(s)[1];
    s = debug.pointerMove(s, t.x + 10, t.y + 10);
    expect(s.menuIndex).toBe(1);
    s = debug.pointerDown(s, t.x + 10, t.y + 10);
    s = debug.pointerMove(s, 5, 5);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    expect(s.armedTarget).toBeNull();
    s = debug.pointerDown(s, t.x + 10, t.y + 10);
    s = action(s, "confirm");
    expect(s.armedTarget).toBeNull();
  });
  it("reads all engine samples in order, ignores secondary touch, and emits one swap", async () => {
    engine.apply((s) =>
      debug.setScreen(
        debug.setGem(debug.loadBoard(s, latin), 0, 0, "X0"),
        "playing",
      ),
    );
    nativePointer("down", cellX(0), cellY(0), "touch");
    nativePointer("move", cellX(1), cellY(0), "touch");
    nativePointer("up", cellX(1), cellY(0), "touch");
    nativePointer("down", cellX(7), cellY(7), "touch", false);
    await engine.advance(1);
    expect(engine.state.phase).toBe("swapping");
    expect(engine.state.selection).toBeNull();
    expect(cues.filter((c) => c === C.CUES.swap)).toHaveLength(1);
    expect(cues.filter((c) => c === C.CUES.select)).toHaveLength(1);
    expect(engine.state.pointer.device).toBe("touch");
  });
});

describe("produced assets and complex chains", () => {
  it("runs a two-step chain with increasing score multipliers", () => {
    let s = bare();
    s = set(set(set(s, 0, 0, "A0"), 1, 0, "R0"), 2, 0, "R0");
    for (let r = 5; r < C.GRID_ROWS; r++) s = set(s, 0, r, "R0");
    s = debug.setRefillKinds(s, 0, "RAC");
    s = debug.setRefillKinds(s, 1, "A");
    s = debug.setRefillKinds(s, 2, "C");
    s = requestSwap(s, { col: 6, row: 7 }, { col: 7, row: 7 });
    s = advance(s, C.SWAP_SECONDS, new Set());
    expect(s.lastPoints).toBe(30);
    expect(s.chainStep).toBe(1);
    s = advance(s, stepHold(s), new Set());
    expect(s.chainStep).toBe(2);
    expect(s.lastPoints).toBe(60);
    s = advance(s, 3, new Set());
    expect(s.phase).toBe("idle");
    expect(s.bestChain).toBe(2);
    expect(s.bestMove).toBe(90);
    expect(s.moveScore).toBe(90);
  });
  it("renders offered swaps, damaged rotating prisms, waves, stars and cut flashes", async () => {
    engine.apply((s) => debug.setScreen(debug.loadBoard(s, latin), "playing"));
    engine.apply((s) => debug.setGem(s, 6, 6, "X3"));
    engine.apply((s) => debug.setGem(s, 5, 5, "J2s"));
    engine.apply((s) => debug.setSelection(s, 0, 0));
    engine.apply((s) => debug.setOffer(s, 1, 0));
    await engine.advance(1);
    engine.apply((s) => debug.clearSelection(debug.clearOffer(s)));
    engine.apply((s) => debug.setGem(line(s, 3, 1, 4), 3, 3, "R0b"));
    engine.apply((s) => debug.setGem(s, 3, 2, "J3"));
    engine.apply((s) => debug.setGem(s, 3, 1, "M3"));
    engine.apply((s) => debug.setGem(s, 3, 0, "S3"));
    engine.apply((s) => debug.requestSwap(s, 6, 7, 7, 7));
    await engine.advance(40);
    expect(engine.state.lastWaves).toBeGreaterThan(0);
    expect(cues).toContain(C.CUES.cut);
    expect(cues.filter((c) => c === C.CUES.clear)).toHaveLength(1);
    await engine.advance(200);
    expect(cues).toContain(C.CUES.land);
  });
  it("ships audible PCM for every event, eight different rungs, and both scores", async () => {
    const names = [
      ...Object.values(C.CUES).filter((n) => n !== C.CUES.clear),
      "shatter",
      ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) => `ladder-${i + 1}`),
      "title",
      "play",
    ];
    for (const name of names) {
      const bytes = await readFile(`public/assets/audio/${name}.wav`);
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      let energy = 0;
      for (let i = 44; i + 1 < bytes.length; i += 2)
        energy += bytes.readInt16LE(i) ** 2;
      expect(energy / bytes.length).toBeGreaterThan(1000);
    }
    for (const name of ["title", "play"])
      expect(
        (await readFile(`public/assets/audio/${name}.mid`)).toString(
          "ascii",
          0,
          4,
        ),
      ).toBe("MThd");
  });
});

describe("debug surface integrity", () => {
  it("poses arbitrary fields independently without advancing or cueing", () => {
    let s = bare();
    const oldBoard = s.board;
    s = debug.setMenuIndex(s, 200);
    s = debug.setScore(s, 555);
    s = debug.setLevel(s, 4);
    s = debug.setLevelScore(s, 8000);
    s = debug.setBestChain(s, 17);
    s = debug.setBestMove(s, 88);
    s = debug.setMoveScore(s, 44);
    s = debug.setSelection(s, 2, 5);
    s = debug.setOffer(s, 7, 1);
    s = debug.setScreen(s, "howto");
    expect(s.board).toBe(oldBoard);
    expect(s.simTime).toBe(0);
    expect(s.score).toBe(555);
    expect(s.menuIndex).toBe(200);
    const shot = debug.snapshot(s);
    expect(shot).toMatchObject({
      levelTarget: 8000,
      bestChain: 17,
      bestMove: 88,
      moveScore: 44,
    });
    const reconciled = debug.reconcile(s);
    expect(reconciled).toEqual(s);
    expect(debug.reconcile(reconciled)).toEqual(s);
    expect(debug.clearSelection(s).offer).toEqual(s.offer);
    expect(debug.clearOffer(s).selection).toEqual(s.selection);
    expect(
      debug
        .clearRefillKinds(debug.setRefillKinds(s, 3, "RACJBSM"))
        .refillKinds.every((k) => k === ""),
    ).toBe(true);
    expect(debug.clearBoard(s).board.cells).toEqual([]);
    expect(debug.dealBoard(s).screen).toBe("howto");
    expect(
      debug.clearRefusal(debug.requestSwap(s, 0, 0, 7, 7)).refusal,
    ).toBeNull();
    const reset = debug.reset(s);
    expect(reset).toMatchObject({
      screen: "title",
      menuIndex: 0,
      score: 0,
      level: 1,
      simTime: 0,
    });
  });
  it("validates every fixed domain loudly rather than clamping", () => {
    const s = bare();
    for (const f of [
      () => debug.setGem(s, -1, 0, "R0"),
      () => debug.setGem(s, 8, 0, "R0"),
      () => debug.setGem(s, 0, 0, "X0b"),
      () => debug.setGem(debug.clearBoard(s), 0, 0, "R0"),
      () => debug.loadBoard(s, ["R0"]),
      () => debug.loadBoard(s, Array(8).fill("R0")),
      () => debug.setLevel(s, 0),
      () => debug.setMenuIndex(s, -1),
      () => debug.setBestChain(s, 1.5),
      () => debug.setRefillKinds(s, 0, "X"),
      () => debug.setScore(s, -1),
      () => debug.pointerDown(s, NaN, 0),
    ])
      expect(f).toThrow();
    expect(parse("S1b", 0, 0)).toMatchObject({
      kind: "sapphire",
      strain: 1,
      cut: "brilliant",
    });
    expect(parse("C2s", 0, 0)).toMatchObject({
      kind: "citrine",
      strain: 2,
      cut: "star",
    });
    expect(parse("X3", 0, 0)).toMatchObject({
      kind: null,
      strain: 3,
      cut: "prism",
    });
  });
});
