# Shadow Front - 2D Real-Time Tactics Prototype

Lightweight browser prototype built with Vanilla TypeScript, Vite, PixiJS, and a standard HTML/CSS side panel.

## Running

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
```

## Controls

The list below mirrors `CONTROL_HELP` in `src/game/config.ts`, which is rendered in the UI panel.

| Command | Action |
| --- | --- |
| Hover + click enemy | Follow the enemy and tie them if close enough |
| Left-click hero | Select the hero |
| Left-click terrain | Move the selected hero to that point |
| X | Maya photographs the artifact up close; Alyosha fires toward the cursor within range |
| Shift + left-click | Run to the point |
| Double left-click | Run to the point |
| C | Toggle prone/upright stance |
| 1 | Select Maya |
| 2 | Select Alyosha |
| Escape | Stop the current movement |
| D | Toggle debug information |

WASD and arrow-key direct movement are intentionally not used.

## Project Layout

```text
public/assets/characters/
  alyosha_movement_8dir_6frames_v8_tie.png
  enemy_movement_8dir_6frames_v6_bound.png
  maya_movement_8dir_6frames_v11_tie.png
  movement-sprites-manifest-6frames.json
src/game/
  animation/SpriteAnimator.ts
  entities/Character.ts
  entities/Enemy.ts
  levels/LevelDefinition.ts
  levels/testLevel.ts
  rendering/PixiGameRenderer.ts
  ui/ControlsPanel.ts
  AssetLoader.ts
  Camera.ts
  Game.ts
  GameLoop.ts
  InputManager.ts
  config.ts
  geometry.ts
  types.ts
src/main.ts
src/styles.css
```

## Sprites

`movement-sprites-manifest-6frames.json` is the source of truth for hero sprite dimensions, row layout, and file names. Character PNG files live in `public/assets/characters/`, load once through `AssetLoader`, and are sliced by `SpriteAnimator`.

Current sprite layout:

- heroes: `6 x 28`; rows `24/25` are the primary special action, row `26` is tie, row `27` is death
- enemies: `6 x 27`; row `24` is shooting, row `25` is bound, row `26` is death

Idle is not a separate animation. Upright idle renders the first `walk` frame; prone idle renders the first `crawl` frame.

Death animation uses the last sprite-sheet row by default and plays once until the final frame. For heroes, override it with `files.<characterId>.death` in the manifest, for example `{ "row": 27 }`. For enemies, use `GAME_CONFIG.enemy.sprite.deadRow` and optionally `deadFrame`. The temporary `X` marker is used only if the configured death row is invalid.

## Screen To World

`InputManager` reads `clientX/clientY`, subtracts the canvas `getBoundingClientRect()`, accounts for CSS size, internal canvas resolution, and `devicePixelRatio`, then passes CSS-pixel screen coordinates to `camera.screenToWorld()`.

Gameplay uses CSS-pixel coordinates. PixiJS scales the backing resolution by `devicePixelRatio`.

## Level Definition

The test level lives in `src/game/levels/testLevel.ts` and uses a logical size of `1800 x 1000`. Collision zones are separate data in `collisionPolygons`; visual blocks are in `decorativeObjects`. This keeps future PNG maps as visual layers rather than collision sources.

`LevelDefinition` already has placeholders for:

- `walkableZones`
- `coverZones`
- `interactionZones`
- `enemySpawnPoints`
- `mapImagePath`

Collision is not inferred from pixels.

## Implemented

- Maya and Alyosha load and exist at the same time.
- Left-clicking a hero selects them.
- Left-clicking terrain assigns a world-coordinate target.
- `Shift + click` and double-click assign run movement.
- `C` toggles `upright/prone`; prone movement uses crawl.
- `Escape` stops the current movement.
- `X` triggers the selected hero special action: Maya photographs the artifact only up close, Alyosha shoots toward the cursor within range.
- Maya gets a temporary `X` prompt when she is near the artifact.
- Heroes and enemies have 100 health; kalashnikov shots deal 50 damage.
- Enemies can rescue bound allies, raise the alarm, investigate gunshots, search a wider route, and return to patrol.
- Movement uses delta time and eight directions via `Math.atan2()`.
- Collision uses ground points and body/radius checks.
- Invalid clicks show a short red marker and do not start movement.
- The camera follows the selected hero and stays inside the level bounds.
- Rendering uses Y-sorting for objects, enemies, the artifact, and heroes.
- Debug mode shows collision polygons, ground points, target lines, cursor world coordinates, frame index, and visible bounds.

## Next Phases

- Pathfinding around collision polygons without changing the public target/path model in `Character`.
- PNG map rendering as a visual layer separated from collision and gameplay zones.
- Cover and interaction zones.
