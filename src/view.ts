import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleSimulator } from "@clockwyrks/particle-runtime";
import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { GemState, State } from "./game";
import * as C from "./constants";
import { cellX, cellY, index, same } from "./model";
import { menu, targets } from "./controls";

const INK = "#e9e7ce",
  GOLD = "#c9b17b",
  MUTED = "#8ca8a9",
  LINE = "#345052";
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  copy: string,
  x: number,
  y: number,
  size = 18,
  color = INK,
  align: CanvasTextAlign = "left",
  serif = false,
): void {
  ctx.fillStyle = color;
  ctx.font = `${serif ? "400" : "500"} ${size}px ${serif ? 'Georgia, "Times New Roman", serif' : '"Trebuchet MS", sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(copy, x, y);
}
function rule(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  color = LINE,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function diamond(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color = GOLD,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.stroke();
}
function field(ctx: Context): void {
  const gradient = ctx.createRadialGradient(
    C.STAGE_CX,
    C.BOARD_CY,
    40,
    C.STAGE_CX,
    C.STAGE_CY,
    740,
  );
  gradient.addColorStop(0, "#17363b");
  gradient.addColorStop(1, "#0b1d24");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#20383c";
  ctx.lineWidth = 1;
  // Fine architectural engraving, kept out of the lit playing field.
  for (const x of [32, C.STAGE_W - 32]) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x, C.STAGE_H - 32);
    ctx.stroke();
  }
  for (const y of [32, C.STAGE_H - 32]) {
    rule(ctx, 32, y, 144, "#263e40");
    rule(ctx, C.STAGE_W - 176, y, 144, "#263e40");
  }
  for (const x of [32, C.STAGE_W - 32])
    for (const y of [32, C.STAGE_H - 32]) diamond(ctx, x, y, 4, "#617361");
}
function sprite(
  ctx: Context,
  s: State,
  key: string,
  x: number,
  y: number,
  size = 64,
): void {
  const img = s.assets.images[key];
  if (img)
    ctx.drawImage(
      img,
      Math.round(x - size / 2),
      Math.round(y - size / 2),
      size,
      size,
    );
}
function stone(
  ctx: Context,
  s: State,
  g: GemState,
  x: number,
  y: number,
): void {
  const key = g.cut === "prism" ? "prism" : g.kind;
  // The prism's authored turn is composited with its authored fracture sprite.
  if (g.cut === "prism")
    sprite(
      ctx,
      s,
      `prism-turn/${g.strain === 0 ? "" : g.strain + "-"}${Math.floor(s.motion.time * 10 + g.col) % 12}`,
      x,
      y,
    );
  else sprite(ctx, s, `${key}-${g.strain}`, x, y);
  if (g.cut === "brilliant" || g.cut === "star") sprite(ctx, s, g.cut, x, y);
}
/** Reconstruct a live simulated effect from its age. Rendering has no retained
 * simulator or clock: identical state always draws identical particles. */
function particles(
  ctx: Context,
  system: DeepReadonly<ParticleSystem> | undefined,
  x: number,
  y: number,
  age: number,
  seed: number,
): void {
  if (!system || age < 0 || age > 1.5) return;
  const sim = new ParticleSimulator(system as ParticleSystem, {
    seed,
    maxParticles: 64,
  });
  let ms = age * 1000;
  while (ms > 0) {
    const step = Math.min(ms, 1000 / 60);
    sim.step(step);
    ms -= step;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((v) => Math.round(v * 255)).join(",")})`;
    const r = Math.max(0.4, p.size);
    ctx.beginPath();
    ctx.moveTo(x + p.position[0], y - p.position[1] - r * 1.6);
    ctx.lineTo(x + p.position[0] + r, y - p.position[1]);
    ctx.lineTo(x + p.position[0], y - p.position[1] + r * 1.6);
    ctx.lineTo(x + p.position[0] - r, y - p.position[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function button(
  ctx: Context,
  copy: string,
  x: number,
  y: number,
  w: number,
  h: number,
  active: boolean,
  armed: boolean,
): void {
  ctx.fillStyle = active ? (armed ? "#4b6256" : "#29453f") : "#10272e";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = active ? GOLD : LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (active) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, y + 18, 3, h - 36);
    diamond(ctx, x + 27, y + h / 2, 4);
  }
  text(
    ctx,
    copy,
    x + w / 2,
    y + h / 2,
    18,
    active ? "#f5e6bc" : MUTED,
    "center",
  );
}
function boardView(ctx: Context, s: State): void {
  sprite(ctx, s, "frame", C.BOARD_CX, C.BOARD_CY, 608);
  ctx.save();
  const left = cellX(0) - C.CELL_PITCH / 2,
    top = cellY(0) - C.CELL_PITCH / 2;
  ctx.beginPath();
  ctx.rect(left, top, C.GRID_COLS * C.CELL_PITCH, C.GRID_ROWS * C.CELL_PITCH);
  ctx.clip();
  const fallTime = s.stepTimer - s.lastWaves * C.WAVE_SECONDS;
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.phase === "resolving") {
      const traveled = Math.max(
        0,
        Math.min(g.fell, fallTime / C.FALL_SECONDS_PER_ROW),
      );
      y -= (g.fell - traveled) * C.CELL_PITCH;
    } else if (s.phase === "swapping" && s.motion.swap) {
      const [a, b] = s.motion.swap;
      const from = same(g, a) ? b : same(g, b) ? a : null;
      if (from) {
        const t = Math.min(1, s.swapTimer / C.SWAP_SECONDS);
        const ease = t * t * (3 - 2 * t);
        x += (cellX(from.col) - x) * (1 - ease);
        y += (cellY(from.row) - y) * (1 - ease);
      }
    } else if (s.phase === "idle" && s.motion.dealAt >= 0) {
      const t = Math.max(0, s.motion.time - s.motion.dealAt);
      y -= Math.max(0, g.fell - t / C.FALL_SECONDS_PER_ROW) * C.CELL_PITCH;
    }
    if (s.selection && s.offer) {
      if (same(g, s.selection)) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (same(g, s.offer)) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    stone(ctx, s, g, x, y);
    if (g.cut !== "plain")
      particles(
        ctx,
        s.assets.effects.aura,
        x,
        y,
        0.8 + ((s.motion.time + g.col * 0.1) % 0.4),
        index(g) + 300,
      );
  }
  if (s.phase === "resolving")
    for (const { gem: g, wave } of s.motion.shards) {
      const age = s.stepTimer - wave * C.WAVE_SECONDS;
      if (age < 0) stone(ctx, s, g, cellX(g.col), cellY(g.row));
      else if (age < 0.32)
        sprite(
          ctx,
          s,
          `break/${g.kind ?? "prism"}/${Math.min(6, Math.floor(age / 0.045))}`,
          cellX(g.col),
          cellY(g.row),
        );
    }
  ctx.restore();
  if (s.phase === "resolving") {
    for (const { gem: g, wave } of s.motion.shards)
      particles(
        ctx,
        s.assets.effects[g.strain === C.MAX_STRAIN ? "flawed" : "clear"],
        cellX(g.col),
        cellY(g.row),
        s.stepTimer - wave * C.WAVE_SECONDS,
        index(g) + Math.floor(s.score),
      );
    for (const g of s.motion.created)
      particles(
        ctx,
        s.assets.effects.cut,
        cellX(g.col),
        cellY(g.row),
        s.stepTimer,
        index(g) + 200,
      );
  }
  for (const [p, color] of [
    [s.selection, "#f5db9b"],
    [s.offer, "#a5ded1"],
  ] as const)
    if (p) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        cellX(p.col) - C.GEM_R - 3,
        cellY(p.row) - C.GEM_R - 3,
        (C.GEM_R + 3) * 2,
        (C.GEM_R + 3) * 2,
      );
    }
  if (s.refusal)
    for (const p of [s.refusal.a, s.refusal.b]) {
      ctx.strokeStyle = "#fa8b86";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        cellX(p.col) - C.GEM_R - 2,
        cellY(p.row) - C.GEM_R - 2,
        (C.GEM_R + 2) * 2,
        (C.GEM_R + 2) * 2,
      );
    }
}
function hud(ctx: Context, s: State): void {
  text(ctx, C.TITLE_TEXT, 68, 78, 39, INK, "left", true);
  text(ctx, "THE LAPIDARY PUZZLE", 70, 112, 11, GOLD);
  rule(ctx, 68, 145, 210);
  text(ctx, "01 / MATCH", 68, 190, 12, GOLD);
  text(ctx, "Find the line.", 68, 224, 28, INK, "left", true);
  text(ctx, "Hold a stone, carry it", 68, 263, 16, MUTED);
  text(ctx, "beside its neighbor,", 68, 287, 16, MUTED);
  text(ctx, "then let go.", 68, 311, 16, MUTED);
  rule(ctx, 68, 346, 210);
  text(ctx, "02 / BUILD PRESSURE", 68, 381, 12, GOLD);
  for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
    sprite(ctx, s, `ruby-${strain}`, 91 + strain * 52, 431, 48);
  text(ctx, "Clean", 68, 478, 14, MUTED);
  text(ctx, "Flawed · 2×", 278, 478, 14, GOLD, "right");
  text(ctx, "Every clear strains its neighbors.", 68, 516, 13, MUTED);
  text(ctx, "Flawed stones join a touching clear.", 68, 537, 13, MUTED);
  text(ctx, "M  SOUND " + (s.muted ? "OFF" : "ON"), 68, 643, 12, GOLD);
  text(ctx, "A LITTLE PRESSURE. A BIG REACTION.", 68, 668, 10, MUTED);
  // The engine's touch menu occupies the top centre. Use the spare sidebar
  // space for readouts so none of its controls obscure scores or the meter.
  const touch = s.pointer.device === "touch";
  text(ctx, C.HUD_SCORE_LABEL, touch ? 68 : 356, touch ? 583 : 37, 11, GOLD);
  text(
    ctx,
    s.score.toLocaleString("en-US"),
    touch ? 68 : 356,
    touch ? 611 : 65,
    30,
    INK,
    "left",
    true,
  );
  const levelRight = touch ? 1192 : 924;
  const meterX = touch ? 1016 : 688;
  const meterY = touch ? 86 : 54;
  const meterW = touch ? 176 : 236;
  text(
    ctx,
    C.HUD_LEVEL_LABEL + "  " + String(s.level).padStart(2, "0"),
    levelRight,
    touch ? 62 : 34,
    13,
    GOLD,
    "right",
  );
  const target = C.LEVEL_TARGET_STEP * s.level,
    fraction = Math.min(1, s.levelScore / target);
  ctx.fillStyle = "#243e40";
  ctx.fillRect(meterX, meterY, meterW, 5);
  ctx.fillStyle = GOLD;
  ctx.fillRect(meterX, meterY, meterW * fraction, 5);
  text(
    ctx,
    `${s.levelScore.toLocaleString("en-US")} / ${target.toLocaleString("en-US")}`,
    levelRight,
    touch ? 110 : 77,
    11,
    MUTED,
    "right",
  );
  text(ctx, "THE CUTS", 1016, 151, 12, GOLD);
  rule(ctx, 1016, 176, 176);
  const legend = [
    {
      cut: "brilliant",
      label: "Brilliant",
      copy: "Four in a line",
      detail: "Shatters its ring",
    },
    {
      cut: "star",
      label: "Star",
      copy: "Two lines cross",
      detail: "Takes row + column",
    },
    {
      cut: "prism",
      label: "Prism",
      copy: "Five in a line",
      detail: "Takes every one kind",
    },
  ];
  legend.forEach((item, i) => {
    const y = 220 + i * 104;
    sprite(ctx, s, item.cut === "prism" ? "prism-0" : "beryl-0", 1040, y, 48);
    if (item.cut !== "prism") sprite(ctx, s, item.cut, 1040, y, 48);
    text(ctx, item.label, 1078, y - 4, 21, INK, "left", true);
    text(ctx, item.copy, 1078, y + 21, 11, GOLD);
    text(ctx, item.detail, 1016, y + 48, 13, MUTED);
  });
  if (s.phase === "resolving") {
    text(
      ctx,
      C.HUD_CHAIN_LABEL + "  ×" + Math.min(s.chainStep, C.MAX_MULTIPLIER),
      1104,
      523,
      24,
      GOLD,
      "center",
      true,
    );
    text(
      ctx,
      `+${s.lastPoints}  /  ${s.lastCleared} STONES`,
      1104,
      552,
      12,
      MUTED,
      "center",
    );
  } else {
    text(ctx, "MAKE THE PRESSURE COUNT", 1104, 540, 10, MUTED, "center");
  }
  const t = targets(s).find((t) => t.id === "pause");
  if (t)
    button(
      ctx,
      C.PAUSE_LABEL + "  Ⅱ",
      t.x,
      t.y,
      t.w,
      t.h,
      false,
      s.armedTarget === t.id,
    );
}
function title(ctx: Context, s: State): void {
  const cx = C.STAGE_CX;
  text(
    ctx,
    "AN EXERCISE IN BEAUTIFUL CHAIN REACTIONS",
    cx,
    66,
    12,
    MUTED,
    "center",
  );
  // The jeweller's hallmark: engraved rings around a rotating, produced prism.
  for (let i = 0; i < 3; i++)
    diamond(ctx, cx, 172, 63 + i * 14, i === 1 ? "#695f42" : "#2b4849");
  sprite(ctx, s, `prism-turn/${Math.floor(s.simTime * 8) % 12}`, cx, 172, 96);
  text(ctx, C.TITLE_TEXT, cx, 298, 114, INK, "center", true);
  rule(ctx, cx - 210, 359, 65, "#7e805e");
  rule(ctx, cx + 145, 359, 65, "#7e805e");
  text(ctx, C.TAGLINE_TEXT, cx, 359, 15, GOLD, "center");
  for (const [i, t] of targets(s).entries())
    button(
      ctx,
      C.TITLE_ITEMS[i],
      t.x,
      t.y,
      t.w,
      t.h,
      s.menuIndex === i,
      s.armedTarget === t.id,
    );
  text(
    ctx,
    "SEVEN STONES. THREE CUTS. ONE MORE CHAIN.",
    cx,
    621,
    12,
    MUTED,
    "center",
  );
  text(
    ctx,
    "POINTER TO PLAY  /  ↑ ↓ TO CHOOSE  /  ENTER TO BEGIN  /  M TO MUTE",
    cx,
    666,
    11,
    "#718d90",
    "center",
  );
  for (let i = 0; i < C.GEM_KIND_COUNT; i++) {
    const side = i < 4 ? -1 : 1,
      n = i < 4 ? i : i - 4;
    const x = cx + side * (340 + (n % 2) * 90),
      y = 174 + n * 114;
    diamond(ctx, x, y, 42, "#284246");
    sprite(ctx, s, `${C.GEM_KINDS[i]}-0`, x, y);
  }
  text(ctx, "F / 01", 68, 665, 12, GOLD);
  text(ctx, "A STUDY IN STRAIN", 1212, 665, 11, GOLD, "right");
}
const LESSONS = [
  [
    "01",
    "Make a line",
    [
      "Seven kinds of stone fill the grid. Hold one with a mouse,",
      "pen or finger, carry it onto a neighbor, then let go.",
      "Three or more of one kind in a line shatter. A move that",
      "clears nothing is refused. Carry it back to play nothing.",
    ],
  ],
  [
    "02",
    "Pressure leaves a mark",
    [
      "Every stone beside a clear takes strain. After three hits",
      "it is flawed: cracked through and ready to break.",
      "A flawed stone joins any clear it touches — and scores",
      "double. Work beside worn stones to spend that pressure.",
    ],
  ],
  [
    "03",
    "Earn a better cut",
    [
      "Four in a line leaves a brilliant; it shatters its whole ring.",
      "Cross two lines for a star: the entire row and column go.",
      "Five or more leaves a prism. Swap it with any stone to",
      "clear every stone of that kind. Two prisms take it all.",
    ],
  ],
  [
    "04",
    "Let it run",
    [
      "Stones fall into the gaps and may shatter again. Each",
      "step of a chain scores more, up to an eightfold return.",
      "Fill the level meter to continue to a fresh, harder level.",
      "When no move can shatter anything, the round is over.",
    ],
  ],
] as const;
function howto(ctx: Context, s: State): void {
  text(ctx, "THE JEWELLER’S FIELD GUIDE", 68, 75, 12, GOLD);
  text(ctx, "Beautiful under pressure.", 68, 124, 48, INK, "left", true);
  LESSONS.forEach(([number, heading, lines], i) => {
    const x = 68 + (i % 2) * 584,
      y = 219 + Math.floor(i / 2) * 187;
    text(ctx, number, x, y, 13, GOLD);
    text(ctx, heading, x + 39, y, 27, INK, "left", true);
    rule(ctx, x, y + 26, 526);
    lines.forEach((line, j) => text(ctx, line, x, y + 56 + j * 25, 16, MUTED));
  });
  text(ctx, "POINTER: HOLD · OFFER · RELEASE", 68, 628, 12, GOLD);
  text(
    ctx,
    "↑ ↓ choose    Enter / Space confirm    Esc / P pause    M mute    Esc back",
    68,
    658,
    14,
    MUTED,
  );
  const t = targets(s)[0];
  button(ctx, C.BACK_LABEL, t.x, t.y, t.w, t.h, true, s.armedTarget === t.id);
}
function overlay(ctx: Context, s: State): void {
  ctx.fillStyle = "#08181fe8";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#102a30";
  ctx.fillRect(402, 160, 476, 442);
  ctx.strokeStyle = "#6b7255";
  ctx.strokeRect(402.5, 160.5, 475, 441);
  diamond(ctx, C.STAGE_CX, 207, 12);
  const heading =
    s.screen === "paused"
      ? C.PAUSED_TITLE_TEXT
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_TITLE_TEXT
        : C.GAMEOVER_TITLE_TEXT;
  text(
    ctx,
    heading,
    C.STAGE_CX,
    267,
    s.screen === "gameover" ? 39 : 45,
    INK,
    "center",
    true,
  );
  if (s.screen === "paused") {
    text(ctx, "THE STONES WILL WAIT.", C.STAGE_CX, 323, 12, GOLD, "center");
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString("en-US")}    /    ${C.HUD_LEVEL_LABEL} ${s.level}`,
      C.STAGE_CX,
      359,
      15,
      MUTED,
      "center",
    );
  } else if (s.screen === "levelclear") {
    text(
      ctx,
      C.HUD_LEVEL_LABEL + " " + s.level + "  ·  PRESSURE WELL SPENT",
      C.STAGE_CX,
      320,
      12,
      GOLD,
      "center",
    );
    text(
      ctx,
      `${C.BEST_CHAIN_LABEL}  ${s.bestChain}×`,
      C.STAGE_CX,
      352,
      15,
      MUTED,
      "center",
    );
    text(
      ctx,
      `${C.BEST_MOVE_LABEL}  ${s.bestMove.toLocaleString("en-US")}`,
      C.STAGE_CX,
      380,
      15,
      MUTED,
      "center",
    );
  } else {
    text(
      ctx,
      "EVERY STONE HAS ITS LIMIT.",
      C.STAGE_CX,
      320,
      12,
      GOLD,
      "center",
    );
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString("en-US")}    /    ${C.HUD_LEVEL_LABEL} ${s.level}`,
      C.STAGE_CX,
      362,
      20,
      MUTED,
      "center",
    );
  }
  for (const [i, t] of targets(s).entries())
    button(
      ctx,
      menu(s.screen)[i],
      t.x,
      t.y,
      t.w,
      t.h,
      s.menuIndex === i,
      s.armedTarget === t.id,
    );
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    hud(ctx, s);
    boardView(ctx, s);
    if (s.screen !== "playing") overlay(ctx, s);
  }
  ctx.restore();
}
