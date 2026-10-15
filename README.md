# Facet

**Pressure finds the flaw.** A browser puzzle about seven kinds of cut stone and the chain reactions hiding between them.

Swap neighboring gems into lines of three or more. Every clear strains the stones left beside it. At three strain, a stone becomes flawed: a touching clear will take it too, for double points. Four in a line earns a **brilliant**, crossing lines earn a **star**, and five or more earns a kindless **prism**. Fill the level meter to advance; the round ends when no legal move remains.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The game uses no backend, remote assets, accounts, or persistence.

## Production

```sh
npm ci
npm run build
npm run preview
```

`dist/` is the complete static site. Serve its contents at an origin root or under a subdirectory. All resource paths are relative.

**No asset-generation software is needed to install, test, or build.** The original artwork, animation frames, live particle definitions, PCM sound effects, and two original musical scores are committed in `public/assets/`. Vite copies them unchanged. The optional one-time production scripts in `tools/art.py` and `tools/sound.py` document their authorship; they are not build steps. They use `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`'s glass/debris material, and `music`'s instrument bank.

## Controls

- **Mouse, pen, or touch:** hold a gem, carry it onto an orthogonal neighbor, then release. You can also select with one tap and press/release its neighbor. The offered stones are drawn exchanged before release.
- Carry the gem back to its starting cell to withdraw the offer. Press empty space to deselect.
- All menus support pointer press/release; **↑ / ↓** choose and **Enter / Space** confirm.
- **Esc / P** pause or resume. **Esc** also backs out of the field guide and the final screen.
- **M** mutes or unmutes everything. Audio unlocks on the first interaction.
- **Backtick** toggles the engine's diagnostic overlay.

## Engineering and checks

The Simple 2D engine owns the loop, input mapping, canvas fit, loading, audio bus, recording, and debug overlay. The simulation is an immutable, render-free transition over `FacetState`, with elapsed-time carry across swap and chain boundaries. The debug API is returned only through `engine.debug`; its poses use the same controls and move acceptance as play.

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The unit suite runs the actual engine over an in-process canvas and counted clocks, decodes the produced PNGs, and tests rules, propagation waves, strain, cut precedence, gravity, prism combinations, chain timing, menus, all three pointer devices, debug poses, recording, and audio events. It also verifies that the shipped WAVs contain audible PCM.

`showcase/` contains the player-facing description, screenshots, and a four-second engine-recorded chain replay. To recapture it during development, run `node tools/capture.mjs` with the development server at port 5173 and the project's Playwright Chromium installed.
