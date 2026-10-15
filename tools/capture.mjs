/* global document, PointerEvent */
// Run once against npm run dev. Uses the project's Chromium and the engine's
// recorder, never video or an imitation of the game renderer.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { log } from "node:console";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route("**/src/main.ts", (route) =>
  route.fulfill({ contentType: "text/javascript", body: "" }),
);
await page.goto("http://localhost:5173");
const capture = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/@fs/work/.vendor/engine/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const C = await import("/src/constants.ts");
  const { cellX, cellY, runs } = await import("/src/model.ts");
  const canvas = document.getElementById("stage");
  const engine = createEngine({
    canvas,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  const d = engine.debug;
  await engine.advance(1);
  const title = canvas.toDataURL("image/png");
  const rows = Array.from({ length: C.GRID_ROWS }, (_, r) =>
    Array.from(
      { length: C.GRID_COLS },
      (_, c) => "RACJBSM"[(c + r * 2) % C.GEM_KIND_COUNT] + "0",
    ).join(" "),
  );
  engine.apply((s) => d.loadBoard(d.setScreen(s, "playing"), rows));
  const gems = [
    [0, 0, "A0"],
    [1, 0, "R0"],
    [2, 0, "R0"],
    [0, 5, "R0"],
    [0, 6, "R0"],
    [0, 7, "A0"],
    [1, 7, "R0"],
    [1, 5, "J3"],
    [1, 4, "A3"],
    [2, 4, "B3"],
    [2, 3, "S3b"],
    [3, 2, "A0s"],
    [6, 5, "B0b"],
    [5, 6, "X1"],
  ];
  for (const [c, r, t] of gems) engine.apply((s) => d.setGem(s, c, r, t));
  // The opening position has no run; the player's bottom-left swap makes one.
  if (runs(engine.state.board).length)
    throw new Error("Showcase must begin without a run");
  engine.apply((s) => d.setScore(s, 1260));
  engine.apply((s) => d.setLevelScore(s, 1260));
  engine.apply((s) => d.setRefillKinds(s, 0, "RAC"));
  engine.apply((s) => d.setRefillKinds(s, 1, "A"));
  engine.apply((s) => d.setRefillKinds(s, 2, "C"));
  await engine.advance(24);
  const board = canvas.toDataURL("image/png");
  // Pin only the capture's refill draws, making this scene reproducible. The
  // shipped game never seeds or replaces Math.random.
  const random = Math.random;
  let seed = 35;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  engine.startRecording();
  await engine.advance(24);
  const pointer = (type, col, row, buttons) =>
    document.dispatchEvent(
      new PointerEvent(type, {
        clientX: cellX(col),
        clientY: cellY(row),
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons,
      }),
    );
  pointer("pointerdown", 1, 7, 1);
  await engine.advance(12);
  pointer("pointermove", 0, 7, 1);
  await engine.advance(15);
  pointer("pointerup", 0, 7, 0);
  let action;
  for (let i = 0; i < 210; i++) {
    await engine.advance(1);
    if (i === 38) action = canvas.toDataURL("image/png");
  }
  const recording = engine.stopRecording();
  Math.random = random;
  const result = {
    title,
    board,
    action,
    recording,
    score: engine.state.score,
    chain: engine.state.bestChain,
  };
  engine.destroy();
  return result;
});
await mkdir("showcase", { recursive: true });
for (const name of ["title", "board", "action"])
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(capture[name].split(",")[1], "base64"),
  );
await writeFile(
  "showcase/pressure.json.gz",
  gzipSync(JSON.stringify(capture.recording)),
);
log(
  `Captured ${capture.recording.frames.length} frames, ${capture.recording.images.length} sprites; score ${capture.score}, best chain ${capture.chain}.`,
);
await browser.close();
