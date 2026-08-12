# Shadow Front - 2D real-time tactics prototype

Лек браузърен прототип с Vanilla TypeScript, Vite, HTML5 Canvas 2D за света и обикновен HTML/CSS за десния UI панел.

## Стартиране

```bash
npm install
npm run dev
```

Production проверка:

```bash
npm run build
```

## Управление

Списъкът по-долу съответства на `CONTROL_HELP` в `src/game/config.ts`, който се използва от UI панела.

| Команда | Действие |
| --- | --- |
| Ляв клик върху герой | избира героя |
| Ляв клик върху терена | героят ходи до точката |
| X | Мая снима artifact отблизо; Альоша стреля към курсора до ограничен range |
| Shift + ляв клик | героят тича до точката |
| Двоен ляв клик | героят тича до точката |
| C | лягане или изправяне |
| 1 | избор на Мая |
| 2 | избор на Альоша |
| Escape | прекратяване на текущото движение |
| D | показване или скриване на debug информация |

Не се използва WASD или директно движение със стрелки.

## Структура на проекта

```text
public/assets/characters/
  alyosha_movement_8dir_6frames_v6_shoot_fixed.png
  maya_movement_8dir_6frames_v9_aligned_photo.png
  movement-sprites-manifest-6frames.json
src/game/
  animation/SpriteAnimator.ts
  entities/Character.ts
  levels/LevelDefinition.ts
  levels/testLevel.ts
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

## Спрайтове

`movement-sprites-manifest-6frames.json` е основният източник за размери, подредба и файлове. PNG файловете са в `public/assets/characters/`, зареждат се веднъж от `AssetLoader`, а `SpriteAnimator` използва manifest данните за:

- размер на кадъра;
- брой кадри;
- ред по `motion` и `direction`;
- source rectangle за `drawImage()`.

Текущият layout е `6 x 25`: 6 кадъра на ред, 25 реда, кадър `192 x 256`.
Последният ред (`row 24`) е специалното действие и е описан в manifest-а чрез `specialActions`.

Idle състоянието не е отделна анимация: при `upright` се рисува първият кадър от `walk`, а при `prone` - първият кадър от `crawl`.

## Screen-to-world

`InputManager` взима `clientX/clientY`, изважда `getBoundingClientRect()` на Canvas, отчита CSS размера, вътрешната Canvas резолюция и `devicePixelRatio`, след което подава резултата към `camera.screenToWorld()`.

Canvas използва CSS pixel координати за game логиката, а вътрешната му резолюция се мащабира според `devicePixelRatio`.

## Level definition

Тестовото ниво е в `src/game/levels/testLevel.ts` и има логически размер `1800 x 1000`. Collision зоните са отделни данни в `collisionPolygons`, а визуалните блокове са в `decorativeObjects`. Това подготвя бъдеща PNG карта, при която изображението ще бъде само визуален слой.

`LevelDefinition` вече има места за бъдещи:

- `walkableZones`;
- `coverZones`;
- `interactionZones`;
- `enemySpawnPoints`;
- `mapImagePath`.

Collision не се извлича от пиксели.

## Реализирано

- Мая и Альоша се зареждат и присъстват едновременно.
- Ляв клик върху герой го избира.
- Ляв клик върху терен задава target в world coordinates.
- `Shift + click` и двоен клик задават run.
- `C` превключва `upright/prone`; при `prone` командите използват crawl.
- `Escape` спира текущото движение.
- `X` задейства специалното действие: при Мая снима artifact-а само отблизо; при Альоша стреля към курсора до ограничен range.
- Когато Мая е близо до artifact-а, над нея се показва временно `X` placeholder за бъдещия camera SVG.
- Движението е плавно с delta time и осем посоки чрез `Math.atan2()`.
- Collision се проверява чрез ground point и малък radius.
- Невалиден клик показва кратък червен маркер и не стартира движение.
- Камерата следва избрания герой и остава в границите на нивото.
- Render-ът използва Y-sorting за обекти и герои.
- Debug режимът показва collision polygons, ground points, target линии, cursor world coordinates, frame index и visible bounds.

## Следващи фази

- Pathfinding около collision polygons, без да се променя публичната идея за target/path в `Character`.
- PNG карта като визуален слой, отделен от collision и gameplay зоните.
- Врагове, patrol поведение и enemy vision.
- Vision конус с близка зона за `upright` и `prone`, далечна зона само за `upright`, и line-of-sight прекъсване от стени.
- Cover и interaction zones.
