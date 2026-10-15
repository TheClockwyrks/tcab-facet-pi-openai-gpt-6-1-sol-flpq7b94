import * as C from "./constants";
import type { CellRef, FacetState, PointerDevice, Screen, State } from "./game";
import {
  adjacent,
  cellX,
  cellY,
  deal,
  emptyBoard,
  emptyMotion,
  initial,
  requestSwap,
  same,
} from "./model";

export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function menu(s: Screen): readonly string[] {
  return s === "title"
    ? C.TITLE_ITEMS
    : s === "paused"
      ? C.PAUSED_ITEMS
      : s === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : s === "gameover"
          ? C.GAMEOVER_ITEMS
          : [];
}
export function targets(s: State): Target[] {
  if (s.screen === "playing")
    return [
      {
        id: "pause",
        x: 1016,
        y: 582,
        w: Math.max(156, C.TARGET_MIN_W),
        h: C.TARGET_MIN_H,
      },
    ];
  if (s.screen === "howto")
    return [
      {
        id: "back",
        x: 1060,
        y: 616,
        w: Math.max(156, C.TARGET_MIN_W),
        h: C.TARGET_MIN_H,
      },
    ];
  return menu(s.screen).map((_, i) => ({
    id: `menu-${i}`,
    x: 490,
    y: 414 + i * 88,
    w: Math.max(300, C.TARGET_MIN_W),
    h: C.TARGET_MIN_H,
  }));
}
export function show(s: State, screen: Screen, menuIndex = 0): FacetState {
  return { ...s, screen, menuIndex, armedTarget: null };
}
export function quit(s: State): FacetState {
  return {
    ...show(s, "title"),
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    motion: emptyMotion(),
  };
}
export function start(s: State): FacetState {
  const fresh = initial(s.assets, s.muted);
  return {
    ...fresh,
    simTime: s.simTime,
    pointer: s.pointer,
    refillKinds: s.refillKinds,
    screen: "playing",
    board: deal(),
    motion: { ...emptyMotion(), dealAt: 0 },
  };
}
export function confirm(s: State): FacetState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? start(s) : show(s, "howto");
  if (s.screen === "paused")
    return s.menuIndex === 0 ? show(s, "playing") : quit(s);
  if (s.screen === "gameover") return s.menuIndex === 0 ? start(s) : quit(s);
  if (s.screen === "levelclear")
    return s.menuIndex === 0
      ? {
          ...show(s, "playing"),
          level: s.level + 1,
          levelScore: 0,
          bestMove: 0,
          bestChain: 0,
          board: deal(),
          selection: null,
          offer: null,
          refusal: null,
          motion: { ...emptyMotion(), dealAt: 0 },
        }
      : quit(s);
  return s;
}
export function action(s: State, name: string): FacetState {
  if (name === "pause" && (s.screen === "playing" || s.screen === "paused"))
    return show(s, s.screen === "playing" ? "paused" : "playing");
  if (name === "back" && (s.screen === "howto" || s.screen === "gameover"))
    return show(s, "title", s.screen === "howto" ? 1 : 0);
  if (name === "confirm") return confirm(s);
  const count = menu(s.screen).length;
  if (count && (name === "up" || name === "down"))
    return {
      ...s,
      menuIndex: (s.menuIndex + (name === "up" ? -1 : 1) + count) % count,
    };
  return s;
}
export function hitCell(x: number, y: number): CellRef | null {
  let result: CellRef | null = null,
    distance = C.GEM_HIT_R * C.GEM_HIT_R + 1e-7;
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      const d = (x - cellX(col)) ** 2 + (y - cellY(row)) ** 2;
      if (d < distance) {
        distance = d;
        result = { col, row };
      }
    }
  return result;
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new RangeError("Pointer position must be finite");
  if (!["mouse", "pen", "touch"].includes(device))
    throw new Error("Unknown pointer device");
  const down = type === "down" || (type === "move" && s.pointer.down);
  let next: FacetState = { ...s, pointer: { x, y, down, device } };
  const target = targets(next).find(
    (t) => x >= t.x && y >= t.y && x <= t.x + t.w && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (!s.armedTarget || type === "down"))
    next = { ...next, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") next = { ...next, armedTarget: target?.id ?? null };
  if (type === "up") {
    next = { ...next, armedTarget: null };
    if (s.armedTarget) {
      if (s.armedTarget === target?.id)
        return target.id.startsWith("menu-")
          ? confirm({ ...next, menuIndex: Number(target.id.slice(5)) })
          : action(next, target.id);
      return next;
    }
  }
  if (next.screen !== "playing" || target || s.armedTarget) return next;
  const hit = hitCell(x, y);
  if (type === "down") {
    if (!hit) return { ...next, selection: null, offer: null };
    if (
      !next.selection ||
      (!same(hit, next.selection) && !adjacent(hit, next.selection))
    )
      return { ...next, selection: hit, offer: null };
    return { ...next, offer: same(hit, next.selection) ? null : hit };
  }
  if (type === "move" && down && next.selection && hit) {
    if (same(hit, next.selection)) return { ...next, offer: null };
    if (adjacent(hit, next.selection)) return { ...next, offer: hit };
  }
  if (type === "up" && next.selection && next.offer)
    return {
      ...requestSwap(next, next.selection, next.offer),
      selection: null,
      offer: null,
    };
  return next;
}
