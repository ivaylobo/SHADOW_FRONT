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
| Left-click prison gate | Send the selected hero to open it |
| Left-click terrain | Move the selected hero to that point |
| X | Maya photographs the artifact, Alyosha fires, Alek deploys or recalls his drone |
| Arrow keys | Pan the camera, or move Alek's deployed drone |
| Shift + left-click | Run to the point |
| Double left-click | Run to the point |
| C | Toggle prone/upright stance |
| E | Open a nearby gate |
| 1 | Select Maya after she is freed |
| 2 | Select Alyosha |
| 3 | Select Alek |
| Escape | Stop the current movement |
| D | Toggle debug information |

WASD direct hero movement is intentionally not used. Arrow keys pan the camera unless Alek is selected with a deployed drone, in which case they move the drone and the camera follows it.

## Project Layout

```text
public/assets/characters/
  alyosha_movement_8dir_6frames_v8_tie.png
  drone_operator_movement_8dir_6frames.png
  enemy_movement_8dir_6frames_v6_bound.png
  fpv_drone_6frames.png
  maya_movement_8dir_6frames_v11_tie.png
  movement-sprites-manifest-6frames.json
public/assets/
  cloud.png
  Maps/map-1.png
  objects/
    military_truck_8dir_6frames.png
    prison_gate_opening_6frames.png
    tractor_8dir_6frames.png
    warehouse.png
    watchtower.png
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
- FPV drone: `6 x 2`; row `0` is flight, row `1` is explosion

Idle is not a separate animation. Upright idle renders the first `walk` frame; prone idle renders the first `crawl` frame.

Death animation uses the last sprite-sheet row by default and plays once until the final frame. For heroes, override it with `files.<characterId>.death` in the manifest, for example `{ "row": 27 }`. For enemies, use `GAME_CONFIG.enemy.sprite.deadRow` and optionally `deadFrame`. The temporary `X` marker is used only if the configured death row is invalid.

## Screen To World

`InputManager` reads `clientX/clientY`, subtracts the canvas `getBoundingClientRect()`, accounts for CSS size, internal canvas resolution, and `devicePixelRatio`, then passes CSS-pixel screen coordinates to `camera.screenToWorld()`.

Gameplay uses CSS-pixel coordinates. PixiJS scales the backing resolution by `devicePixelRatio`.

## Level Definition

The first level lives in `src/game/levels/testLevel.ts`, uses `public/assets/Maps/map-1.png` as the visual map, and renders it as a `2508 x 2508` world. Collision zones are separate data in `collisionPolygons` and `objects[].collisionShapes`. Map pixels are not used as collision data.

`LevelDefinition` already has placeholders for:

- `walkableZones`
- `coverZones`
- `interactionZones`
- `enemySpawnPoints`
- `mapImagePath`
- `objects`
- `captives`

Collision is not inferred from pixels.

## Implemented

- Maya, Alyosha, and Alek load and exist at the same time.
- Left-clicking a hero selects them.
- Maya starts bound in the right-side prison on level one; she cannot be selected or targeted by enemies until the prison gate opens.
- Opening the prison gate releases Maya so she can be selected and moved.
- Buildings and vehicles render as separate map objects and block hero/enemy movement.
- The prison gate plays its opening sprite animation and removes only its gate collision when open.
- Nearby gates show an animated open prompt and can be opened with `E` or by left-clicking the gate.
- Left-clicking terrain assigns a world-coordinate target and uses grid pathfinding to route around blockers.
- Hero object collision uses the ground/foot point instead of the full sprite body.
- `Shift + click` and double-click assign run movement.
- `C` toggles `upright/prone`; prone movement uses crawl.
- `Escape` stops the current movement.
- `X` triggers the selected hero special action: Maya photographs the artifact only up close, Alyosha shoots toward the cursor within range, and Alek deploys or recalls his drone.
- Arrow keys pan the camera without moving a hero; Alek's deployed drone uses the same keys and pulls the camera with it.
- Soft cloud sprites obscure world content until Alek scans them with the drone.
- The drone clears cloud sprites persistently with the same radius as enemy vision range.
- Active cloud sprites block hero movement until the drone clears them.
- Level one has multiple drone-reveal cloud zones across the central road, prison approach, and southeast field.
- Level one has six enemy patrols spread across the route and prison approach.
- Enemies raise the alarm as soon as the drone enters their vision cone, then shoot it after a short delay; one hit destroys it and plays the explosion row.
- The game ends when any hero dies and offers a retry prompt.
- Maya gets a temporary `X` prompt when she is near the artifact.
- Heroes and enemies have 100 health; kalashnikov shots deal 50 damage.
- Enemies can rescue bound allies, raise the alarm, investigate gunshots, search a wider route, and return to patrol.
- Movement uses delta time and eight directions via `Math.atan2()`.
- Collision uses ground points, foot radii, object collision shapes, and active cloud zones.
- Invalid clicks show a short red marker and do not start movement.
- The camera can free-pan, follow the selected hero, or follow the active drone while staying inside level bounds.
- Rendering uses Y-sorting for objects, enemies, the artifact, and heroes.
- Debug mode shows collision polygons, ground points, target lines, cursor world coordinates, frame index, and visible bounds.

## Next Phases

- Cover and interaction zones.
