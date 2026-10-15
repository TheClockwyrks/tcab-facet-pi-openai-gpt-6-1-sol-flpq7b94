import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { FacetDebugApi, FacetState, State } from "./game";
import * as C from "./constants";
import { debug } from "./debug";
import { action, pointer } from "./controls";
import { advance, initial, lastFall, legalSwap, same } from "./model";

export async function initialize(
  api: InitApi<FacetState>,
): Promise<[FacetState, FacetDebugApi]> {
  for (const name of C.ACTIONS)
    api.input.register(name, { keys: [...C.BINDINGS[name]] });
  const imagePaths: string[] = [];
  for (const kind of [...C.GEM_KINDS, "prism"])
    for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
      imagePaths.push(`${kind}-${strain}`);
  imagePaths.push("brilliant", "star", "frame");
  for (const kind of [...C.GEM_KINDS, "prism"])
    for (let f = 0; f < 7; f++) imagePaths.push(`break/${kind}/${f}`);
  for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
    for (let f = 0; f < 12; f++)
      imagePaths.push(`prism-turn/${strain === 0 ? "" : strain + "-"}${f}`);
  const [images, effects] = await Promise.all([
    Promise.all(
      imagePaths.map(
        async (key) =>
          [key, await api.assets.loadImage(`gems/${key}.png`)] as const,
      ),
    ),
    Promise.all(
      ["clear", "flawed", "cut", "aura"].map(
        async (key) =>
          [
            key,
            JSON.parse(
              await (await api.assets.load(`fx/${key}.json`)).text(),
            ) as ParticleSystem,
          ] as const,
      ),
    ),
    ...Object.values(C.CUES).map((cue) =>
      api.audio.load(
        cue,
        `audio/${cue === C.CUES.clear ? "shatter" : cue}.wav`,
      ),
    ),
    ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.audio.load(`clear-tone-${i + 1}`, `audio/ladder-${i + 1}.wav`),
    ),
    api.audio.load("title-theme", "audio/title.wav"),
    api.audio.load("play-bed", "audio/play.wav"),
  ]);
  const sources: Record<string, (s: State) => string | number | boolean> = {
    screen: (s) => s.screen,
    phase: (s) => s.phase,
    board: (s) => `${s.board.cols} x ${s.board.rows}`,
    score: (s) => s.score,
    level: (s) => s.level,
    levelScore: (s) => `${s.levelScore} / ${s.level * C.LEVEL_TARGET_STEP}`,
    chainStep: (s) => s.chainStep,
    multiplier: (s) => Math.min(s.chainStep, C.MAX_MULTIPLIER),
    lastCleared: (s) => s.lastCleared,
    lastPoints: (s) => s.lastPoints,
    lastWaves: (s) => s.lastWaves,
    lastFall,
    selection: (s) =>
      s.selection ? `${s.selection.col},${s.selection.row}` : "none",
    offer: (s) => (s.offer ? `${s.offer.col},${s.offer.row}` : "none"),
    bestMove: (s) => s.bestMove,
    bestChain: (s) => s.bestChain,
    legalSwap: (s) => legalSwap(s.board),
    pointer: (s) =>
      `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
  };
  for (const [key, read] of Object.entries(sources))
    api.diagnostics.register(key, read);
  return [
    initial({
      images: Object.fromEntries(images),
      effects: Object.fromEntries(effects),
    }),
    debug,
  ];
}
function inputSounds(before: State, after: State, events: Set<string>): void {
  if (after.selection && !same(before.selection, after.selection))
    events.add(C.CUES.select);
  if (before.phase !== "swapping" && after.phase === "swapping")
    events.add(C.CUES.swap);
  if (
    after.refusal &&
    after.refusal !== before.refusal &&
    after.refusal.timer === 0
  )
    events.add(C.CUES.refuse);
}
export function update(state: State, api: UpdateApi, dt: number): FacetState {
  let next: FacetState = { ...state, simTime: state.simTime + dt };
  const events = new Set<string>();
  // Consume each keyboard edge once, even where that action has no effect.
  const pressed = Object.fromEntries(
    C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
  );
  if (pressed.mute) api.audio.setMuted(!api.audio.muted());
  const screenAtInput = next.screen;
  for (const name of ["up", "down", "confirm", "pause", "back"] as const) {
    if (pressed[name] && next.screen === screenAtInput)
      next = action(next, name);
  }
  for (const sample of api.input.pointerSamples()) {
    if (
      !sample.primary ||
      (sample.type !== "move" && sample.button !== "primary")
    )
      continue;
    const before = next;
    next = pointer(next, sample.type, sample.x, sample.y, sample.device);
    inputSounds(before, next, events);
  }
  const p = api.input.pointer();
  next = {
    ...next,
    pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
    muted: api.audio.muted(),
  };
  if (next.screen === "playing") {
    next = { ...next, motion: { ...next.motion, time: next.motion.time + dt } };
    next = advance(next, dt, events);
  }
  for (const cue of events) {
    api.audio.play(cue);
    if (cue === C.CUES.clear) api.audio.play(`clear-tone-${next.motion.rung}`);
  }
  const title = next.screen === "title" || next.screen === "howto";
  const theme = title ? "title-theme" : "play-bed",
    other = title ? "play-bed" : "title-theme";
  if (api.audio.looping(other)) api.audio.stop(other);
  if (!api.audio.looping(theme)) api.audio.loop(theme);
  return next;
}
