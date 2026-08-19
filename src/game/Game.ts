import { Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { SpriteAnimator } from "./animation/SpriteAnimator";
import { AssetLoader } from "./AssetLoader";
import { Camera } from "./Camera";
import { GAME_CONFIG } from "./config";
import { Character } from "./entities/Character";
import { Drone } from "./entities/Drone";
import { Enemy } from "./entities/Enemy";
import {
  clamp,
  circleIntersectsPolygon,
  distance,
  distanceSquared,
  distanceToSegment,
  getMaxY,
  getPolygonCenter,
  isInsideWorld,
  pointInPolygon,
  segmentsIntersect,
  type Size
} from "./geometry";
import { GameLoop } from "./GameLoop";
import { InputManager, type CanvasCommand } from "./InputManager";
import type {
  CloudZone,
  CollisionPolygon,
  LevelObjectDefinition,
  ObliquePrism
} from "./levels/LevelDefinition";
import { testLevel } from "./levels/testLevel";
import { PixiGameRenderer } from "./rendering/PixiGameRenderer";
import type { CharacterId, Direction, EnemyId, MovingMotion, WorldPoint } from "./types";
import { ControlsPanel } from "./ui/ControlsPanel";

type TerrainMotion = Exclude<MovingMotion, "crawl">;
type CameraMode = "follow-selected" | "follow-drone" | "free";

interface Marker {
  position: WorldPoint;
  type: "target" | "invalid";
  age: number;
  duration: number;
}

interface TimedEffect {
  age: number;
  duration: number;
}

type RenderItem =
  | {
      sortY: number;
      kind: "obstacle";
      object: ObliquePrism;
    }
  | {
      sortY: number;
      kind: "level-object";
      object: PlacedLevelObject;
    }
  | {
      sortY: number;
      kind: "enemy";
      enemy: Enemy;
    }
  | {
      sortY: number;
      kind: "photo";
    }
  | {
      sortY: number;
      kind: "drone";
      drone: Drone;
    }
  | {
      sortY: number;
      kind: "character";
      character: Character;
    };

interface ShotTrace {
  from: WorldPoint;
  to: WorldPoint;
  age: number;
  duration: number;
}

interface PhotoFlash {
  position: WorldPoint;
  age: number;
  duration: number;
}

interface AlarmFlash {
  age: number;
  duration: number;
}

interface DetectionCone {
  close: WorldPoint[];
  far: WorldPoint[];
}

interface TieAttempt {
  enemyId: EnemyId;
}

interface DoorOpenAttempt {
  objectId: string;
}

type DoorRuntimeStatus = "closed" | "opening" | "open";

interface DoorRuntimeState {
  status: DoorRuntimeStatus;
  frameIndex: number;
  elapsed: number;
}

interface EnemyShotState {
  targetId: CharacterId;
  cooldown: number;
}

interface DroneShotState {
  enemyId: EnemyId;
  cooldown: number;
}

interface CloudSpritePlacement {
  position: WorldPoint;
  width: number;
  height: number;
  rotation: number;
}

interface PlacedLevelObject extends LevelObjectDefinition {
  position: WorldPoint;
}

interface PathCell {
  x: number;
  y: number;
}

interface PathNode {
  key: string;
  cell: PathCell;
  position: WorldPoint;
  g: number;
  f: number;
  parentKey: string | null;
}

export class Game {
  private readonly level = testLevel;
  private readonly assetLoader = new AssetLoader();
  private readonly camera = new Camera(testLevel.worldSize);
  private readonly renderer: PixiGameRenderer;
  private readonly controlsPanel: ControlsPanel;
  private readonly loop = new GameLoop();
  private readonly characters = new Map<CharacterId, Character>();
  private readonly enemies = new Map<EnemyId, Enemy>();
  private readonly levelObjects: PlacedLevelObject[] = [];
  private readonly renderItems: RenderItem[] = [];
  private readonly droneInput = new Set<string>();
  private readonly cameraInput = new Set<string>();
  private readonly photoArtifact = {
    position: { x: 880, y: 715 },
    radius: 26,
    interactionRange: GAME_CONFIG.specialActions.photo.range
  };

  private inputManager: InputManager | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private droneImage: HTMLImageElement | null = null;
  private cloudTexture: Texture | null = null;
  private mapTexture: Texture | null = null;
  private readonly objectTextures = new Map<string, Texture>();
  private readonly objectFrameTextures = new Map<string, Texture>();
  private drone: Drone | null = null;
  private viewport: Size = { width: 1, height: 1 };
  private debugEnabled = false;
  private cameraMode: CameraMode = "follow-selected";
  private cursorWorld: WorldPoint | null = null;
  private markers: Marker[] = [];
  private shotTraces: ShotTrace[] = [];
  private photoFlashes: PhotoFlash[] = [];
  private cloudReveals: WorldPoint[] = [];
  private lastCloudRevealPosition: WorldPoint | null = null;
  private alarmFlash: AlarmFlash | null = null;
  private alarmActive = false;
  private gameOver = false;
  private gameOverPromptShown = false;
  private elapsedTime = 0;
  private readonly tieAttempts = new Map<CharacterId, TieAttempt>();
  private readonly doorOpenAttempts = new Map<CharacterId, DoorOpenAttempt>();
  private readonly doorStates = new Map<string, DoorRuntimeState>();
  private readonly aimTargets = new Map<CharacterId, EnemyId>();
  private readonly enemyShotStates = new Map<EnemyId, EnemyShotState>();
  private pendingDroneShot: DroneShotState | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    sidePanel: HTMLElement
  ) {
    this.renderer = new PixiGameRenderer(canvas);
    this.controlsPanel = new ControlsPanel(sidePanel);
    window.addEventListener("beforeunload", this.dispose);
  }

  async start(): Promise<void> {
    await this.renderer.init();
    this.resizeCanvas();
    this.renderMessage("Loading sprites...");

    try {
      const assets = await this.assetLoader.loadCharacterAssets({
        mapImagePath: this.level.mapImagePath,
        objectImagePaths: this.level.objects.map((object) => object.imagePath)
      });
      const animator = new SpriteAnimator(assets.manifest);
      this.droneImage = assets.droneImage;
      this.cloudTexture = this.createCloudTexture(assets.cloudImage);
      this.mapTexture = assets.mapImage ? Texture.from(assets.mapImage) : null;
      this.initializeLevelObjects(assets.objectImages);

      this.characters.set(
        "maya",
        new Character({
          id: "maya",
          name: "Maya",
          image: assets.images.maya,
          initialPosition: this.level.initialPositions.maya,
          animator
        })
      );
      this.characters.set(
        "alyosha",
        new Character({
          id: "alyosha",
          name: "Alyosha",
          image: assets.images.alyosha,
          initialPosition: this.level.initialPositions.alyosha,
          animator
        })
      );
      this.characters.set(
        "alek",
        new Character({
          id: "alek",
          name: "Alek",
          image: assets.images.alek,
          initialPosition: this.level.initialPositions.alek,
          animator
        })
      );
      for (const patrol of this.level.enemyPatrols) {
        this.enemies.set(
          patrol.id,
          new Enemy({
            id: patrol.id,
            name: patrol.name,
            image: assets.enemyImage,
            route: patrol.route,
            alarmRoute: patrol.alarmRoute
          })
        );
      }

      this.applyLevelCaptives();
      this.selectInitialCharacter();
      this.inputManager = new InputManager(this.canvas, this.camera, {
        onCanvasCommand: (command) => this.handleCanvasCommand(command),
        onCursorMove: (worldPosition) => {
          if (this.gameOver) {
            return;
          }

          this.cursorWorld = worldPosition;
          this.updateAimTargetFromPoint(worldPosition);
          this.updateCanvasCursor();
        },
        onKeyDown: (key, code, repeat) => this.handleKeyDown(key, code, repeat),
        onKeyUp: (_key, code) => this.handleKeyUp(code)
      });
      this.resizeObserver = new ResizeObserver(this.resizeCanvas);
      this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
      window.addEventListener("resize", this.resizeCanvas);
      this.loop.start((deltaTime) => this.frame(deltaTime));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.renderMessage(`Load error: ${message}`, "#ffb4a8");
      throw error;
    }
  }

  private createCloudTexture(image: HTMLImageElement | null): Texture {
    return Texture.from(image ? this.createCloudCanvas(image) : this.createFallbackCloudCanvas());
  }

  private createCloudCanvas(image: HTMLImageElement): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth || image.width);
    canvas.height = Math.max(1, image.naturalHeight || image.height);

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Cannot create cloud texture context.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (this.canvasHasAlpha(context, canvas.width, canvas.height)) {
      return canvas;
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const cutoff = GAME_CONFIG.cloud.backgroundCutoff;

    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      const brightness = Math.max(red, green, blue);
      const alpha = clamp((brightness - cutoff) / (255 - cutoff), 0, 1);

      imageData.data[index + 3] = Math.round(imageData.data[index + 3] * alpha);
    }

    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  private canvasHasAlpha(
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ): boolean {
    const samplePoints = [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: 0, y: height - 1 },
      { x: width - 1, y: height - 1 },
      { x: Math.floor(width / 2), y: Math.floor(height / 2) }
    ];

    for (const point of samplePoints) {
      const alpha = context.getImageData(point.x, point.y, 1, 1).data[3];
      if (alpha < 250) {
        return true;
      }
    }

    return false;
  }

  private createFallbackCloudCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 576;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Cannot create fallback cloud texture context.");
    }

    const puffs = [
      { x: 0.26, y: 0.52, r: 0.34, a: 0.78 },
      { x: 0.42, y: 0.42, r: 0.32, a: 0.72 },
      { x: 0.58, y: 0.48, r: 0.36, a: 0.68 },
      { x: 0.73, y: 0.54, r: 0.28, a: 0.64 },
      { x: 0.5, y: 0.62, r: 0.3, a: 0.7 }
    ];

    for (const puff of puffs) {
      const radius = puff.r * canvas.height;
      const gradient = context.createRadialGradient(
        puff.x * canvas.width,
        puff.y * canvas.height,
        radius * 0.08,
        puff.x * canvas.width,
        puff.y * canvas.height,
        radius
      );
      gradient.addColorStop(0, `rgba(238, 238, 238, ${puff.a})`);
      gradient.addColorStop(0.45, `rgba(150, 150, 150, ${puff.a * 0.7})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.ellipse(
        puff.x * canvas.width,
        puff.y * canvas.height,
        radius * 1.65,
        radius,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
    }

    return canvas;
  }

  private initializeLevelObjects(objectImages: Record<string, HTMLImageElement>): void {
    this.levelObjects.length = 0;
    this.objectTextures.clear();
    this.objectFrameTextures.clear();
    this.doorStates.clear();

    for (const [path, image] of Object.entries(objectImages)) {
      this.objectTextures.set(path, Texture.from(image));
    }

    for (const object of this.level.objects) {
      const position = object.position ?? this.pickRandomObjectPosition(object);
      this.levelObjects.push({
        ...object,
        position
      });

      if (object.interaction?.type === "open-door") {
        this.doorStates.set(object.id, {
          status: "closed",
          frameIndex: object.frame?.column ?? 0,
          elapsed: 0
        });
      }
    }
  }

  private pickRandomObjectPosition(object: LevelObjectDefinition): WorldPoint {
    const positions = object.randomPositions;

    if (!positions?.length) {
      throw new Error(`Level object has no fixed or random position: ${object.id}`);
    }

    const index = Math.floor(Math.random() * positions.length);
    return { ...positions[index] };
  }

  private frame(deltaTime: number): void {
    if (!this.gameOver) {
      this.update(deltaTime);
    }
    this.render();
  }

  private update(deltaTime: number): void {
    this.elapsedTime += deltaTime;
    this.syncTieAttemptTargets();
    this.syncDoorOpenAttemptTargets();

    for (const character of this.characters.values()) {
      if (character.hasActiveWork()) {
        character.update(deltaTime, (movingCharacter, position) =>
          this.isCharacterPositionWalkable(movingCharacter, position)
        );
      }
    }

    for (const enemy of this.enemies.values()) {
      enemy.update(deltaTime, (position, radius) =>
        this.isEnemyPositionWalkable(position, radius)
      );
    }
    this.updateDrone(deltaTime);
    this.updateTieAttempts();
    this.updateDoorOpenAttempts();
    this.updateDoorAnimations(deltaTime);
    this.updateRescueAttempts();
    this.updatePendingDroneShot(deltaTime);
    this.updateEnemyShooting(deltaTime);
    this.updateEnemyDetection();
    this.updateDroneDetection();
    this.updateAlarmState();

    this.updateTimedEffects(this.markers, deltaTime);
    this.updateTimedEffects(this.shotTraces, deltaTime);
    this.updateTimedEffects(this.photoFlashes, deltaTime);
    if (this.alarmFlash) {
      this.alarmFlash.age += deltaTime;
      if (this.alarmFlash.age >= this.alarmFlash.duration) {
        this.alarmFlash = null;
      }
    }

    const selectedCharacter = this.getSelectedCharacter();
    this.updateCamera(deltaTime, selectedCharacter);
    this.controlsPanel.updateStatus({
      name: selectedCharacter.name,
      state: selectedCharacter.state
    });
    this.controlsPanel.setDebug(this.debugEnabled, this.buildDebugReadout(selectedCharacter));
  }

  private updateTimedEffects<T extends TimedEffect>(items: T[], deltaTime: number): void {
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < items.length; readIndex += 1) {
      const item = items[readIndex];
      item.age += deltaTime;

      if (item.age <= item.duration) {
        items[writeIndex] = item;
        writeIndex += 1;
      }
    }

    items.length = writeIndex;
  }

  private updateCamera(deltaTime: number, selectedCharacter: Character): void {
    if (this.cameraInput.size > 0) {
      this.cameraMode = "free";
      this.camera.pan({
        x: this.getDirectionalInput(this.cameraInput, "ArrowLeft", "ArrowRight") *
          GAME_CONFIG.cameraPanSpeed *
          deltaTime,
        y: this.getDirectionalInput(this.cameraInput, "ArrowUp", "ArrowDown") *
          GAME_CONFIG.cameraPanSpeed *
          deltaTime
      });
      return;
    }

    if (this.cameraMode === "follow-drone" && this.drone?.isDeployed()) {
      this.camera.update(this.drone.position, deltaTime);
      return;
    }

    if (this.cameraMode === "free") {
      return;
    }

    this.camera.update(selectedCharacter.state.position, deltaTime);
  }

  private getDirectionalInput(keys: Set<string>, negativeCode: string, positiveCode: string): number {
    return (keys.has(positiveCode) ? 1 : 0) - (keys.has(negativeCode) ? 1 : 0);
  }

  private updateDrone(deltaTime: number): void {
    if (!this.drone) {
      return;
    }

    this.drone.update(deltaTime, this.getDroneMovementVector(), this.level.worldSize);

    if (this.drone.isDeployed()) {
      this.revealCloudsFromDrone(this.drone.position);
    }

    if (this.drone.isFinished()) {
      this.drone = null;
      this.droneInput.clear();
      this.pendingDroneShot = null;
    }
  }

  private getDroneMovementVector(): WorldPoint {
    if (!this.canControlDrone()) {
      return { x: 0, y: 0 };
    }

    return {
      x: this.getDirectionalInput(this.droneInput, "ArrowLeft", "ArrowRight"),
      y: this.getDirectionalInput(this.droneInput, "ArrowUp", "ArrowDown")
    };
  }

  private canControlDrone(): boolean {
    const selectedCharacter = this.getSelectedCharacter();

    return Boolean(
      this.drone?.isDeployed() &&
        selectedCharacter.id === "alek" &&
        !selectedCharacter.isDead() &&
        !selectedCharacter.isBound()
    );
  }

  private revealCloudsFromDrone(position: WorldPoint): void {
    if (this.level.cloudZones.length === 0) {
      return;
    }

    const radius = GAME_CONFIG.enemy.visionRange;
    const spacing = GAME_CONFIG.cloud.revealSampleSpacing;

    if (
      this.lastCloudRevealPosition &&
      distanceSquared(this.lastCloudRevealPosition, position) < spacing * spacing
    ) {
      return;
    }

    if (!this.doesRevealReachCloud(position, radius)) {
      return;
    }

    this.cloudReveals.push({ ...position });
    this.lastCloudRevealPosition = { ...position };
  }

  private doesRevealReachCloud(position: WorldPoint, radius: number): boolean {
    for (const zone of this.level.cloudZones) {
      if (circleIntersectsPolygon(position, radius, zone.points)) {
        return true;
      }
    }

    return false;
  }

  private render(): void {
    this.prepareScene();
    this.drawLevelBase();
    this.drawMarkers();
    this.drawEnemyVision();
    this.drawSortedRenderables();
    this.drawSpecialEffects();
    this.drawTiePrompts();
    this.drawDoorOpenPrompts();
    this.drawMayaPhotoPrompt();
    this.drawCloudZones();

    if (this.debugEnabled) {
      this.drawWorldDebug();
    }

    if (this.debugEnabled) {
      this.drawScreenDebug();
    }
    this.drawAlarmIndicator();
    this.renderer.render();
  }

  private handleCanvasCommand(command: CanvasCommand): void {
    if (this.gameOver) {
      return;
    }

    this.cursorWorld = command.worldPosition;
    this.updateAimTargetFromPoint(command.worldPosition);

    const selectedCharacter = this.getSelectedCharacter();
    const clickedCharacter = this.findCharacterAt(command.worldPosition);

    if (clickedCharacter) {
      if (clickedCharacter.isBound()) {
        this.addMarker(clickedCharacter.state.position, "invalid");
        return;
      }

      this.selectCharacter(clickedCharacter.id);
      if (clickedCharacter.state.targetPosition) {
        clickedCharacter.stop();
        this.tieAttempts.delete(clickedCharacter.id);
        this.doorOpenAttempts.delete(clickedCharacter.id);
      }
      return;
    }

    const clickedEnemy = this.findEnemyAt(command.worldPosition);

    if (selectedCharacter.isDead() || selectedCharacter.isBound()) {
      this.addMarker(command.worldPosition, "invalid");
      return;
    }

    if (clickedEnemy) {
      this.cameraMode = "follow-selected";
      this.doorOpenAttempts.delete(selectedCharacter.id);
      this.aimTargets.set(selectedCharacter.id, clickedEnemy.id);

      if (!this.startTieAttempt(selectedCharacter, clickedEnemy)) {
        this.addMarker(clickedEnemy.position, "invalid");
        return;
      }

      this.addMarker(clickedEnemy.position, "target");
      return;
    }

    const clickedDoorObject = this.findInteractiveLevelObjectAt(command.worldPosition);
    if (clickedDoorObject) {
      this.cameraMode = "follow-selected";
      this.tieAttempts.delete(selectedCharacter.id);
      this.aimTargets.delete(selectedCharacter.id);

      if (!this.startDoorOpenAttempt(selectedCharacter, clickedDoorObject)) {
        this.addMarker(this.getDoorInteractionPoint(clickedDoorObject), "invalid");
        return;
      }

      this.addMarker(this.getDoorInteractionPoint(clickedDoorObject), "target");
      return;
    }

    const requestedMotion: TerrainMotion =
      command.shiftKey || command.isDoubleClick ? "run" : "walk";

    if (!this.moveCharacterTo(selectedCharacter, command.worldPosition, requestedMotion)) {
      this.addMarker(command.worldPosition, "invalid");
      return;
    }

    this.tieAttempts.delete(selectedCharacter.id);
    this.doorOpenAttempts.delete(selectedCharacter.id);
    this.aimTargets.delete(selectedCharacter.id);
    this.cameraMode = "follow-selected";
    this.addMarker(command.worldPosition, "target");
  }

  private triggerSelectedSpecialAction(): void {
    const character = this.getSelectedCharacter();

    if (
      character.isDead() ||
      character.isBound() ||
      (character.state.action && character.state.action !== "shoot")
    ) {
      this.logCombat("player shot blocked", {
        character: character.id,
        dead: character.isDead(),
        bound: character.isBound(),
        action: character.state.action
      });
      return;
    }

    const pendingEnemyTargetId = this.tieAttempts.get(character.id)?.enemyId ?? null;
    this.tieAttempts.delete(character.id);
    this.doorOpenAttempts.delete(character.id);

    if (character.id === "alek") {
      this.toggleDrone(character);
      return;
    }

    if (character.id === "maya") {
      if (!this.isMayaNearPhotoArtifact()) {
        this.addMarker(this.photoArtifact.position, "invalid");
        return;
      }

      character.startSpecialAction("photo", this.photoArtifact.position);
      this.photoFlashes.push({
        position: { ...this.photoArtifact.position },
        age: 0,
        duration: GAME_CONFIG.specialActions.photo.duration
      });
      return;
    }

    const shotOrigin = this.getShotOrigin(character);
    const shotTarget = this.getShotTarget(character, shotOrigin, pendingEnemyTargetId);
    const shotHit = this.findShotHit(shotOrigin, shotTarget);
    const traceTarget = shotHit?.point ?? shotTarget;

    this.logCombat("player shot", {
      shooter: character.id,
      origin: this.formatPoint(shotOrigin),
      target: this.formatPoint(shotTarget),
      cursor: this.formatPoint(this.cursorWorld),
      pendingEnemyTargetId,
      lockedEnemyTargetId: this.aimTargets.get(character.id) ?? null,
      hitEnemyId: shotHit?.enemy.id ?? null
    });

    character.startSpecialAction("shoot", shotTarget);
    this.shotTraces.push({
      from: shotOrigin,
      to: traceTarget,
      age: 0,
      duration: 0.18
    });
    this.triggerGunshotAlarm(character, shotOrigin);

    if (!shotHit) {
      this.logCombat("player shot miss", {
        shooter: character.id,
        target: this.formatPoint(shotTarget)
      });
      return;
    }

    const healthBefore = shotHit.enemy.health;
    const killed = shotHit.enemy.takeDamage(GAME_CONFIG.combat.kalashnikovDamage);

    this.logCombat("player shot hit", {
      shooter: character.id,
      enemy: shotHit.enemy.id,
      healthBefore,
      healthAfter: shotHit.enemy.health,
      enemyState: shotHit.enemy.state,
      killed
    });

    if (killed) {
      this.clearAimTarget(shotHit.enemy.id);
      this.enemyShotStates.delete(shotHit.enemy.id);
    } else {
      this.aimTargets.set(character.id, shotHit.enemy.id);
      this.startEnemyShooting(shotHit.enemy, character, "hit-by-player");
    }
  }

  private toggleDrone(operator: Character): void {
    if (this.drone?.isDeployed()) {
      const recallRange = GAME_CONFIG.drone.recallRange;

      if (distanceSquared(this.drone.position, operator.state.position) <= recallRange * recallRange) {
        this.logCombat("drone recalled", {
          operator: operator.id,
          dronePosition: this.formatPoint(this.drone.position)
        });
        this.drone = null;
        this.droneInput.clear();
        this.cameraMode = "follow-selected";
        return;
      }

      this.addMarker(this.drone.position, "invalid");
      this.logCombat("drone recall blocked", {
        operator: operator.id,
        dronePosition: this.formatPoint(this.drone.position),
        operatorPosition: this.formatPoint(operator.state.position)
      });
      return;
    }

    if (this.drone || !this.droneImage) {
      return;
    }

    const spawnPosition = {
      x: clamp(
        operator.state.position.x + GAME_CONFIG.drone.spawnOffset.x,
        GAME_CONFIG.drone.edgePadding,
        this.level.worldSize.width - GAME_CONFIG.drone.edgePadding
      ),
      y: clamp(
        operator.state.position.y + GAME_CONFIG.drone.spawnOffset.y,
        GAME_CONFIG.drone.edgePadding,
        this.level.worldSize.height - GAME_CONFIG.drone.edgePadding
      )
    };

    this.drone = new Drone({
      image: this.droneImage,
      position: spawnPosition
    });
    this.cameraMode = "follow-drone";

    this.logCombat("drone deployed", {
      operator: operator.id,
      position: this.formatPoint(spawnPosition)
    });
  }

  private handleKeyDown(key: string, code: string, repeat: boolean): void {
    if (this.gameOver) {
      return;
    }

    const normalizedKey = key.toLowerCase();

    if (this.isDroneControlKey(code)) {
      if (this.canControlDrone()) {
        this.droneInput.add(code);
        this.cameraInput.clear();
        this.cameraMode = "follow-drone";
      } else {
        this.cameraInput.add(code);
        this.droneInput.clear();
        this.cameraMode = "free";
      }
      return;
    }

    if (normalizedKey === "1" || code === "Digit1" || code === "Numpad1") {
      this.selectCharacter("maya");
      return;
    }

    if (normalizedKey === "2" || code === "Digit2" || code === "Numpad2") {
      this.selectCharacter("alyosha");
      return;
    }

    if (normalizedKey === "3" || code === "Digit3" || code === "Numpad3") {
      this.selectCharacter("alek");
      return;
    }

    if (normalizedKey === "c" || code === "KeyC") {
      this.getSelectedCharacter().toggleStance();
      return;
    }

    if (normalizedKey === "e" || code === "KeyE") {
      if (repeat) {
        return;
      }

      this.triggerSelectedDoorOpen();
      return;
    }

    if (normalizedKey === "x" || code === "KeyX") {
      if (repeat) {
        this.logCombat("key x ignored repeat", {
          selected: this.getSelectedCharacter().id
        });
        return;
      }

      this.logCombat("key x", {
        selected: this.getSelectedCharacter().id,
        action: this.getSelectedCharacter().state.action
      });
      this.triggerSelectedSpecialAction();
      return;
    }

    if (normalizedKey === "escape" || code === "Escape") {
      const character = this.getSelectedCharacter();
      character.stop();
      this.tieAttempts.delete(character.id);
      this.doorOpenAttempts.delete(character.id);
      this.aimTargets.delete(character.id);
      this.droneInput.clear();
      this.cameraInput.clear();
      this.cameraMode = "follow-selected";
      return;
    }

    if (normalizedKey === "d" || code === "KeyD") {
      this.debugEnabled = !this.debugEnabled;
    }
  }

  private handleKeyUp(code: string): void {
    if (this.isDroneControlKey(code)) {
      this.droneInput.delete(code);
      this.cameraInput.delete(code);
    }
  }

  private isDroneControlKey(code: string): boolean {
    return code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
  }

  private selectCharacter(id: CharacterId): void {
    const selectedCharacter = this.characters.get(id);
    if (!selectedCharacter || selectedCharacter.isDead() || selectedCharacter.isBound()) {
      return;
    }

    for (const character of this.characters.values()) {
      character.setSelected(character.id === id);
    }

    this.cameraInput.clear();
    this.cameraMode =
      id === "alek" && this.drone?.isDeployed() ? "follow-drone" : "follow-selected";
  }

  private selectInitialCharacter(): void {
    const preferredOrder: CharacterId[] = ["alyosha", "alek", "maya"];

    for (const id of preferredOrder) {
      const character = this.characters.get(id);
      if (character && !character.isDead() && !character.isBound()) {
        this.selectCharacter(id);
        return;
      }
    }

    throw new Error("No selectable character.");
  }

  private applyLevelCaptives(): void {
    for (const captive of this.level.captives ?? []) {
      const character = this.characters.get(captive.characterId);
      if (character) {
        character.bind(captive.position);
      }
    }
  }

  private getSelectedCharacter(): Character {
    for (const character of this.characters.values()) {
      if (character.state.selected) {
        return character;
      }
    }

    throw new Error("No selected character.");
  }

  private findCharacterAt(point: WorldPoint): Character | null {
    let topCharacter: Character | null = null;
    let topY = -Infinity;

    for (const character of this.characters.values()) {
      const sortY = character.state.position.y;

      if (sortY <= topY || !character.containsWorldPoint(point)) {
        continue;
      }

      topCharacter = character;
      topY = sortY;
    }

    return topCharacter;
  }

  private findEnemyAt(point: WorldPoint): Enemy | null {
    let topEnemy: Enemy | null = null;
    let topY = -Infinity;

    for (const enemy of this.enemies.values()) {
      const sortY = enemy.position.y;

      if (sortY <= topY || !enemy.containsWorldPoint(point)) {
        continue;
      }

      topEnemy = enemy;
      topY = sortY;
    }

    return topEnemy;
  }

  private findInteractiveLevelObjectAt(point: WorldPoint): PlacedLevelObject | null {
    let topObject: PlacedLevelObject | null = null;
    let topY = -Infinity;

    for (const object of this.levelObjects) {
      if (!object.interaction || !this.containsLevelObjectPoint(object, point)) {
        continue;
      }

      if (object.position.y <= topY) {
        continue;
      }

      topObject = object;
      topY = object.position.y;
    }

    return topObject;
  }

  private containsLevelObjectPoint(object: PlacedLevelObject, point: WorldPoint): boolean {
    const size = this.getLevelObjectRenderSize(object);
    const anchor = this.getLevelObjectAnchor(object);
    const left = object.position.x - size.width * anchor.x;
    const top = object.position.y - size.height * anchor.y;

    return (
      point.x >= left &&
      point.x <= left + size.width &&
      point.y >= top &&
      point.y <= top + size.height
    );
  }

  private getLevelObjectRenderSize(object: PlacedLevelObject): Size {
    const texture = this.objectTextures.get(object.imagePath);
    if (!texture) {
      return { width: 0, height: 0 };
    }

    const frame = object.frame;
    return {
      width: ((frame ? texture.width / frame.columns : texture.width) || 0) * object.scale,
      height: ((frame ? texture.height / frame.rows : texture.height) || 0) * object.scale
    };
  }

  private getLevelObjectAnchor(object: PlacedLevelObject): WorldPoint {
    return object.anchor ?? { x: 0.5, y: 1 };
  }

  private updateAimTargetFromPoint(point: WorldPoint): void {
    const selectedCharacter = this.getSelectedCharacter();
    const enemy = this.findEnemyAt(point);

    if (enemy && !enemy.isDead()) {
      this.aimTargets.set(selectedCharacter.id, enemy.id);
      return;
    }

    this.aimTargets.delete(selectedCharacter.id);
  }

  private getAimTarget(characterId: CharacterId): Enemy | null {
    const targetId = this.aimTargets.get(characterId);

    if (!targetId) {
      return null;
    }

    const target = this.enemies.get(targetId) ?? null;

    if (!target || target.isDead()) {
      this.aimTargets.delete(characterId);
      return null;
    }

    return target;
  }

  private clearAimTarget(enemyId: EnemyId): void {
    for (const [characterId, targetId] of this.aimTargets) {
      if (targetId === enemyId) {
        this.aimTargets.delete(characterId);
      }
    }
  }

  private getHoveredTieEnemy(): Enemy | null {
    if (!this.cursorWorld || this.findCharacterAt(this.cursorWorld)) {
      return null;
    }

    const enemy = this.findEnemyAt(this.cursorWorld);
    return enemy && !this.isEnemyUnavailableForTie(enemy) ? enemy : null;
  }

  private getHoveredDoorObject(): PlacedLevelObject | null {
    if (!this.cursorWorld || this.findCharacterAt(this.cursorWorld)) {
      return null;
    }

    const object = this.findInteractiveLevelObjectAt(this.cursorWorld);
    return object && this.canStartDoorOpenAttempt(this.getSelectedCharacter(), object)
      ? object
      : null;
  }

  private updateCanvasCursor(): void {
    this.canvas.style.cursor =
      this.getHoveredTieEnemy() || this.getHoveredDoorObject()
        ? "pointer"
        : "crosshair";
  }

  private moveCharacterTo(
    character: Character,
    targetPosition: WorldPoint,
    requestedMotion: TerrainMotion,
    speedOverride: number | null = null
  ): boolean {
    if (!this.isCharacterPositionWalkable(character, targetPosition)) {
      return false;
    }

    const path = this.findCharacterPath(character, character.state.position, targetPosition);
    if (!path) {
      return false;
    }

    if (path.length <= 1) {
      character.setTarget(targetPosition, requestedMotion, speedOverride);
      return true;
    }

    character.setPath(path, requestedMotion, speedOverride);
    return true;
  }

  private findCharacterPath(
    character: Character,
    start: WorldPoint,
    target: WorldPoint
  ): WorldPoint[] | null {
    if (this.isPathSegmentWalkable(character, start, target)) {
      return [target];
    }

    const cellSize = GAME_CONFIG.pathfinding.cellSize;
    const columns = Math.ceil(this.level.worldSize.width / cellSize);
    const rows = Math.ceil(this.level.worldSize.height / cellSize);
    const startCell = this.pointToPathCell(start, cellSize, columns, rows);
    const targetCell = this.pointToPathCell(target, cellSize, columns, rows);
    const startKey = this.getPathCellKey(startCell);
    const targetKey = this.getPathCellKey(targetCell);
    const open = new Map<string, PathNode>();
    const records = new Map<string, PathNode>();
    const closed = new Set<string>();
    const startNode: PathNode = {
      key: startKey,
      cell: startCell,
      position: { ...start },
      g: 0,
      f: distance(start, target),
      parentKey: null
    };

    open.set(startKey, startNode);
    records.set(startKey, startNode);

    let visitedNodes = 0;

    while (open.size > 0 && visitedNodes < GAME_CONFIG.pathfinding.maxNodes) {
      const current = this.getLowestCostOpenNode(open);
      open.delete(current.key);
      closed.add(current.key);
      visitedNodes += 1;

      if (
        current.key === targetKey ||
        this.isPathSegmentWalkable(character, current.position, target)
      ) {
        return this.smoothCharacterPath(
          character,
          start,
          this.reconstructPath(records, current, target)
        );
      }

      for (const neighborCell of this.getPathNeighborCells(current.cell, columns, rows)) {
        const neighborKey = this.getPathCellKey(neighborCell);
        if (closed.has(neighborKey)) {
          continue;
        }

        if (
          neighborCell.x !== current.cell.x &&
          neighborCell.y !== current.cell.y &&
          !this.canUseDiagonalPathStep(character, current.cell, neighborCell, cellSize, columns, rows)
        ) {
          continue;
        }

        const neighborPosition =
          neighborKey === targetKey
            ? { ...target }
            : this.pathCellToPoint(neighborCell, cellSize);

        if (
          !this.isCharacterPositionWalkable(character, neighborPosition) ||
          !this.isPathSegmentWalkable(character, current.position, neighborPosition)
        ) {
          continue;
        }

        const tentativeG = current.g + distance(current.position, neighborPosition);
        const existing = records.get(neighborKey);

        if (existing && tentativeG >= existing.g) {
          continue;
        }

        const nextNode: PathNode = {
          key: neighborKey,
          cell: neighborCell,
          position: neighborPosition,
          g: tentativeG,
          f: tentativeG + distance(neighborPosition, target),
          parentKey: current.key
        };

        records.set(neighborKey, nextNode);
        open.set(neighborKey, nextNode);
      }
    }

    return null;
  }

  private getLowestCostOpenNode(open: Map<string, PathNode>): PathNode {
    let bestNode: PathNode | null = null;

    for (const node of open.values()) {
      if (!bestNode || node.f < bestNode.f) {
        bestNode = node;
      }
    }

    if (!bestNode) {
      throw new Error("Cannot read empty pathfinding open set.");
    }

    return bestNode;
  }

  private pointToPathCell(
    point: WorldPoint,
    cellSize: number,
    columns: number,
    rows: number
  ): PathCell {
    return {
      x: clamp(Math.floor(point.x / cellSize), 0, columns - 1),
      y: clamp(Math.floor(point.y / cellSize), 0, rows - 1)
    };
  }

  private pathCellToPoint(cell: PathCell, cellSize: number): WorldPoint {
    return {
      x: Math.min(this.level.worldSize.width - GAME_CONFIG.characterFootCollisionRadius, cell.x * cellSize + cellSize / 2),
      y: Math.min(this.level.worldSize.height - GAME_CONFIG.characterFootCollisionRadius, cell.y * cellSize + cellSize / 2)
    };
  }

  private getPathCellKey(cell: PathCell): string {
    return `${cell.x}:${cell.y}`;
  }

  private getPathNeighborCells(cell: PathCell, columns: number, rows: number): PathCell[] {
    const neighbors: PathCell[] = [];

    for (let y = cell.y - 1; y <= cell.y + 1; y += 1) {
      for (let x = cell.x - 1; x <= cell.x + 1; x += 1) {
        if ((x === cell.x && y === cell.y) || x < 0 || y < 0 || x >= columns || y >= rows) {
          continue;
        }

        neighbors.push({ x, y });
      }
    }

    return neighbors;
  }

  private canUseDiagonalPathStep(
    character: Character,
    from: PathCell,
    to: PathCell,
    cellSize: number,
    columns: number,
    rows: number
  ): boolean {
    const horizontal = { x: to.x, y: from.y };
    const vertical = { x: from.x, y: to.y };

    return (
      horizontal.x >= 0 &&
      horizontal.x < columns &&
      vertical.y >= 0 &&
      vertical.y < rows &&
      this.isCharacterPositionWalkable(character, this.pathCellToPoint(horizontal, cellSize)) &&
      this.isCharacterPositionWalkable(character, this.pathCellToPoint(vertical, cellSize))
    );
  }

  private isPathSegmentWalkable(character: Character, from: WorldPoint, to: WorldPoint): boolean {
    const segmentDistance = distance(from, to);
    const steps = Math.max(
      1,
      Math.ceil(segmentDistance / GAME_CONFIG.pathfinding.sampleSpacing)
    );

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const point = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      };

      if (!this.isCharacterPositionWalkable(character, point)) {
        return false;
      }
    }

    return true;
  }

  private reconstructPath(
    records: Map<string, PathNode>,
    endNode: PathNode,
    target: WorldPoint
  ): WorldPoint[] {
    const points: WorldPoint[] = [];
    let current: PathNode | undefined = endNode;

    while (current) {
      if (current.parentKey) {
        points.push(current.position);
      }
      current = current.parentKey ? records.get(current.parentKey) : undefined;
    }

    points.reverse();

    const lastPoint = points[points.length - 1];
    if (!lastPoint || distanceSquared(lastPoint, target) > 1) {
      points.push({ ...target });
    }

    return points;
  }

  private smoothCharacterPath(
    character: Character,
    start: WorldPoint,
    path: WorldPoint[]
  ): WorldPoint[] {
    const smoothed: WorldPoint[] = [];
    let anchor = start;
    let index = 0;

    while (index < path.length) {
      let nextIndex = path.length - 1;

      while (
        nextIndex > index &&
        !this.isPathSegmentWalkable(character, anchor, path[nextIndex])
      ) {
        nextIndex -= 1;
      }

      smoothed.push(path[nextIndex]);
      anchor = path[nextIndex];
      index = nextIndex + 1;
    }

    return smoothed;
  }

  private startTieAttempt(character: Character, enemy: Enemy): boolean {
    if (character.isDead() || character.isBound()) {
      return false;
    }

    if (character.state.stance !== "upright") {
      return false;
    }

    if (this.isEnemyUnavailableForTie(enemy)) {
      return false;
    }

    this.tieAttempts.set(character.id, {
      enemyId: enemy.id
    });
    this.doorOpenAttempts.delete(character.id);

    character.setTarget(enemy.position, "walk", GAME_CONFIG.tie.walkSpeed);
    return true;
  }

  private syncTieAttemptTargets(): void {
    for (const [characterId, attempt] of this.tieAttempts) {
      const character = this.characters.get(characterId);
      const enemy = this.enemies.get(attempt.enemyId);

      if (!character || !enemy) {
        this.tieAttempts.delete(characterId);
        continue;
      }

      if (
        character.state.action ||
        character.isBound() ||
        character.state.stance !== "upright" ||
        !character.state.targetPosition ||
        this.isEnemyUnavailableForTie(enemy)
      ) {
        character.stop();
        this.tieAttempts.delete(characterId);
        continue;
      }

      character.retarget(enemy.position);
    }
  }

  private updateTieAttempts(): void {
    for (const [characterId, attempt] of this.tieAttempts) {
      const character = this.characters.get(characterId);
      const enemy = this.enemies.get(attempt.enemyId);

      if (!character || !enemy) {
        this.tieAttempts.delete(characterId);
        continue;
      }

      if (character.isBound() || this.isEnemyUnavailableForTie(enemy)) {
        character.stop();
        this.tieAttempts.delete(characterId);
        continue;
      }

      if (!character.state.targetPosition) {
        this.tieAttempts.delete(characterId);
        continue;
      }

      const distanceToEnemy = distance(character.state.position, enemy.position);

      if (
        distanceToEnemy <= GAME_CONFIG.tie.catchRange &&
        this.hasTieLineOfSight(character, enemy)
      ) {
        character.startSpecialAction("tie", enemy.position);
        enemy.bind();
        this.tieAttempts.delete(characterId);
      }
    }
  }

  private triggerSelectedDoorOpen(): void {
    const character = this.getSelectedCharacter();
    const object = this.findNearestOpenableDoorInRange(character);

    if (!object || !this.startDoorOpenAttempt(character, object)) {
      this.addMarker(character.state.position, "invalid");
    }
  }

  private startDoorOpenAttempt(character: Character, object: PlacedLevelObject): boolean {
    if (!this.canStartDoorOpenAttempt(character, object)) {
      return false;
    }

    this.tieAttempts.delete(character.id);
    this.aimTargets.delete(character.id);

    if (this.tryCompleteDoorOpen(character, object)) {
      return true;
    }

    if (!this.moveCharacterTo(
      character,
      this.getDoorInteractionPoint(object),
      "walk",
      GAME_CONFIG.tie.walkSpeed
    )) {
      return false;
    }

    this.doorOpenAttempts.set(character.id, {
      objectId: object.id
    });
    return true;
  }

  private syncDoorOpenAttemptTargets(): void {
    for (const [characterId, attempt] of this.doorOpenAttempts) {
      const character = this.characters.get(characterId);
      const object = this.getLevelObject(attempt.objectId);

      if (!character || !object) {
        this.doorOpenAttempts.delete(characterId);
        continue;
      }

      if (
        character.state.action ||
        character.state.stance !== "upright" ||
        !character.state.targetPosition ||
        !this.canStartDoorOpenAttempt(character, object)
      ) {
        character.stop();
        this.doorOpenAttempts.delete(characterId);
        continue;
      }
    }
  }

  private updateDoorOpenAttempts(): void {
    for (const [characterId, attempt] of this.doorOpenAttempts) {
      const character = this.characters.get(characterId);
      const object = this.getLevelObject(attempt.objectId);

      if (!character || !object) {
        this.doorOpenAttempts.delete(characterId);
        continue;
      }

      if (!this.canStartDoorOpenAttempt(character, object)) {
        character.stop();
        this.doorOpenAttempts.delete(characterId);
        continue;
      }

      if (this.tryCompleteDoorOpen(character, object)) {
        this.doorOpenAttempts.delete(characterId);
        continue;
      }

      if (!character.state.targetPosition) {
        this.doorOpenAttempts.delete(characterId);
      }
    }
  }

  private updateDoorAnimations(deltaTime: number): void {
    for (const object of this.levelObjects) {
      const interaction = object.interaction;
      const state = this.doorStates.get(object.id);

      if (!interaction || !state || state.status !== "opening") {
        continue;
      }

      const frame = object.frame;
      if (!frame) {
        this.completeDoorOpen(object);
        continue;
      }

      const frameDuration = 1 / interaction.fps;
      state.elapsed += deltaTime;

      while (state.elapsed >= frameDuration && state.status === "opening") {
        state.elapsed -= frameDuration;

        if (state.frameIndex >= frame.columns - 1) {
          state.frameIndex = frame.columns - 1;
          this.completeDoorOpen(object);
          break;
        }

        state.frameIndex += 1;
      }
    }
  }

  private tryCompleteDoorOpen(character: Character, object: PlacedLevelObject): boolean {
    if (!this.canStartDoorOpenAttempt(character, object)) {
      return false;
    }

    const interactionPoint = this.getDoorInteractionPoint(object);
    const range = object.interaction?.range ?? GAME_CONFIG.tie.catchRange;

    if (
      distanceSquared(character.state.position, interactionPoint) >
      range * range
    ) {
      return false;
    }

    const state = this.doorStates.get(object.id);
    if (!state) {
      return false;
    }

    state.status = "opening";
    state.frameIndex = object.frame?.column ?? 0;
    state.elapsed = 0;
    character.startSpecialAction("tie", interactionPoint);
    this.addMarker(interactionPoint, "target");
    this.logCombat("door opening", {
      character: character.id,
      object: object.id,
      requiresKeyId: object.interaction?.requiresKeyId ?? null
    });
    return true;
  }

  private completeDoorOpen(object: PlacedLevelObject): void {
    const state = this.doorStates.get(object.id);
    if (!state || state.status === "open") {
      return;
    }

    state.status = "open";
    state.elapsed = 0;

    for (const captiveId of object.interaction?.releaseCaptiveIds ?? []) {
      const captive = this.characters.get(captiveId);
      if (!captive?.isBound()) {
        continue;
      }

      captive.unbind();
      this.addMarker(captive.state.position, "target");
      this.logCombat("captive released by door", {
        object: object.id,
        captive: captive.id
      });
    }
  }

  private canStartDoorOpenAttempt(character: Character, object: PlacedLevelObject): boolean {
    const interaction = object.interaction;

    if (
      !interaction ||
      interaction.type !== "open-door" ||
      character.isDead() ||
      character.isBound() ||
      character.state.stance !== "upright" ||
      character.state.action ||
      this.isDoorOpenOrOpening(object)
    ) {
      return false;
    }

    return this.hasDoorKeyRequirement(character, interaction.requiresKeyId);
  }

  private hasDoorKeyRequirement(character: Character, requiresKeyId: string | undefined): boolean {
    void character;
    return !requiresKeyId;
  }

  private findNearestOpenableDoorInRange(character: Character): PlacedLevelObject | null {
    let nearest: PlacedLevelObject | null = null;
    let nearestDistanceSquared = Infinity;

    for (const object of this.levelObjects) {
      if (!this.canStartDoorOpenAttempt(character, object)) {
        continue;
      }

      const range = object.interaction?.range ?? GAME_CONFIG.tie.catchRange;
      const currentDistanceSquared = distanceSquared(
        character.state.position,
        this.getDoorInteractionPoint(object)
      );

      if (currentDistanceSquared > range * range || currentDistanceSquared >= nearestDistanceSquared) {
        continue;
      }

      nearest = object;
      nearestDistanceSquared = currentDistanceSquared;
    }

    return nearest;
  }

  private getLevelObject(id: string): PlacedLevelObject | null {
    return this.levelObjects.find((object) => object.id === id) ?? null;
  }

  private getDoorInteractionPoint(object: PlacedLevelObject): WorldPoint {
    const point = object.interaction?.point ?? { x: 0, y: 0 };
    return this.localObjectPointToWorld(object, point);
  }

  private getDoorPromptPoint(object: PlacedLevelObject): WorldPoint {
    const interaction = object.interaction;
    if (!interaction) {
      return object.position;
    }

    return this.localObjectPointToWorld(object, {
      x: interaction.point.x + interaction.promptOffset.x,
      y: interaction.point.y + interaction.promptOffset.y
    });
  }

  private isDoorOpenOrOpening(object: PlacedLevelObject): boolean {
    const state = this.doorStates.get(object.id);
    return state?.status === "open" || state?.status === "opening";
  }

  private isDoorOpen(object: PlacedLevelObject): boolean {
    return this.doorStates.get(object.id)?.status === "open";
  }

  private isEnemyUnavailableForTie(enemy: Enemy): boolean {
    return enemy.state === "shooting" || enemy.state === "dead" || enemy.state === "bound";
  }

  private hasTieLineOfSight(character: Character, enemy: Enemy): boolean {
    return this.hasLineOfSight(this.getCharacterSightPoint(character), this.getEnemyTiePoint(enemy));
  }

  private getCharacterSightPoint(character: Character): WorldPoint {
    return {
      x: character.state.position.x,
      y: character.state.position.y + (character.state.stance === "prone" ? -26 : -42)
    };
  }

  private getEnemyTiePoint(enemy: Enemy): WorldPoint {
    return {
      x: enemy.position.x,
      y: enemy.position.y + GAME_CONFIG.enemy.hitPointOffsetY
    };
  }

  private updateEnemyShooting(deltaTime: number): void {
    for (const enemy of this.enemies.values()) {
      if (this.pendingDroneShot?.enemyId === enemy.id) {
        continue;
      }

      const shotState = this.enemyShotStates.get(enemy.id);

      if (enemy.state !== "shooting") {
        if (shotState) {
          this.enemyShotStates.delete(enemy.id);
        }
        continue;
      }

      const currentTarget = shotState ? this.characters.get(shotState.targetId) : null;
      const target =
        currentTarget && this.canEnemyShootCharacter(enemy, currentTarget)
          ? currentTarget
          : this.findEnemyShootTarget(enemy);

      if (!target) {
        this.stopEnemyShooting(enemy, "no-shootable-target");
        continue;
      }

      enemy.faceTarget(target.state.position);

      const nextShotState: EnemyShotState = shotState ?? {
        targetId: target.id,
        cooldown: GAME_CONFIG.combat.enemyShotInterval
      };
      nextShotState.targetId = target.id;
      nextShotState.cooldown -= deltaTime;

      if (nextShotState.cooldown <= 0) {
        this.fireEnemyShot(enemy, target, "cooldown");
        nextShotState.cooldown = GAME_CONFIG.combat.enemyShotInterval;
      }

      this.enemyShotStates.set(enemy.id, nextShotState);
    }
  }

  private startEnemyShooting(enemy: Enemy, target: Character, reason: string): void {
    if (enemy.isDead() || target.isDead() || target.isBound()) {
      return;
    }

    enemy.startShooting(target.state.position);
    this.enemyShotStates.set(enemy.id, {
      targetId: target.id,
      cooldown: GAME_CONFIG.combat.enemyShotInterval
    });

    this.logCombat("enemy shooting started", {
      enemy: enemy.id,
      target: target.id,
      reason,
      enemyHealth: enemy.health,
      targetHealth: target.state.health
    });

    this.fireEnemyShot(enemy, target, reason);
  }

  private fireEnemyShot(enemy: Enemy, target: Character, reason: string): void {
    if (!this.canEnemyShootCharacter(enemy, target)) {
      this.logCombat("enemy shot blocked", {
        enemy: enemy.id,
        target: target.id,
        reason,
        enemyState: enemy.state,
        targetDead: target.isDead(),
        targetBound: target.isBound()
      });
      return;
    }

    enemy.faceTarget(target.state.position);
    const healthBefore = target.state.health;
    const killed = this.damageCharacter(target, enemy);

    this.logCombat("enemy shot hit", {
      enemy: enemy.id,
      target: target.id,
      reason,
      healthBefore,
      healthAfter: target.state.health,
      killed
    });
  }

  private canEnemyShootCharacter(enemy: Enemy, character: Character): boolean {
    if (enemy.isDead() || enemy.state === "bound" || character.isDead() || character.isBound()) {
      return false;
    }

    const from = enemy.getVision().eye;
    const to = this.getCharacterSightPoint(character);
    const range = GAME_CONFIG.specialActions.shoot.range;

    return distanceSquared(from, to) <= range * range && this.hasLineOfSight(from, to);
  }

  private findEnemyShootTarget(enemy: Enemy): Character | null {
    let nearestTarget: Character | null = null;
    let nearestDistance = Infinity;

    for (const character of this.characters.values()) {
      if (!this.canEnemyShootCharacter(enemy, character)) {
        continue;
      }

      const targetDistance = distanceSquared(enemy.position, character.state.position);

      if (targetDistance < nearestDistance) {
        nearestTarget = character;
        nearestDistance = targetDistance;
      }
    }

    return nearestTarget;
  }

  private stopEnemyShooting(enemy: Enemy, reason: string): void {
    this.enemyShotStates.delete(enemy.id);
    enemy.stopShooting();
    if (this.alarmActive) {
      enemy.startAlarmSearch();
    }
    this.logCombat("enemy shooting stopped", {
      enemy: enemy.id,
      reason
    });
  }

  private updateEnemyDetection(): void {
    for (const enemy of this.enemies.values()) {
      if (
        enemy.state === "shooting" ||
        enemy.state === "dead" ||
        enemy.state === "bound"
      ) {
        continue;
      }

      const detected = this.findVisibleCharacter(enemy);

      if (detected) {
        this.startEnemyShooting(enemy, detected, "vision");
        this.triggerAlarmAt(detected.state.position, "enemy-saw-character", enemy.id);
        continue;
      }

      const boundEnemy = this.findVisibleBoundEnemy(enemy);
      if (boundEnemy && !this.isRescueInProgress(boundEnemy.id)) {
        this.alarmActive = true;
        enemy.startRescue(boundEnemy);
      }
    }
  }

  private updateDroneDetection(): void {
    if (!this.drone?.isDeployed() || this.pendingDroneShot) {
      return;
    }

    for (const enemy of this.enemies.values()) {
      if (enemy.state === "dead" || enemy.state === "bound") {
        continue;
      }

      if (this.getEnemyVisionDistance(enemy, this.drone.position) !== null) {
        this.scheduleDroneShot(enemy, this.drone);
        return;
      }
    }
  }

  private scheduleDroneShot(enemy: Enemy, drone: Drone): void {
    const dronePosition = { ...drone.position };

    this.enemyShotStates.delete(enemy.id);
    enemy.startShooting(dronePosition);
    this.pendingDroneShot = {
      enemyId: enemy.id,
      cooldown: GAME_CONFIG.drone.enemyShotDelay
    };
    this.triggerAlarmAt(dronePosition, "drone-spotted", enemy.id);
    this.logCombat("drone spotted", {
      enemy: enemy.id,
      dronePosition: this.formatPoint(dronePosition),
      shotDelay: GAME_CONFIG.drone.enemyShotDelay
    });
  }

  private updatePendingDroneShot(deltaTime: number): void {
    if (!this.pendingDroneShot) {
      return;
    }

    const drone = this.drone;
    const enemy = this.enemies.get(this.pendingDroneShot.enemyId);

    if (!drone?.isDeployed() || !enemy || enemy.state === "dead" || enemy.state === "bound") {
      this.pendingDroneShot = null;
      return;
    }

    enemy.faceTarget(drone.position);

    if (this.getEnemyVisionDistance(enemy, drone.position) === null) {
      this.logCombat("drone shot canceled", {
        enemy: enemy.id,
        reason: "lost-vision",
        dronePosition: this.formatPoint(drone.position)
      });
      this.pendingDroneShot = null;
      this.stopEnemyShooting(enemy, "lost-drone-vision");
      return;
    }

    this.pendingDroneShot.cooldown -= deltaTime;

    if (this.pendingDroneShot.cooldown <= 0) {
      this.shootDrone(enemy, drone);
    }
  }

  private shootDrone(enemy: Enemy, drone: Drone): void {
    const shotOrigin = enemy.getVision().eye;
    const dronePosition = { ...drone.position };

    this.pendingDroneShot = null;
    this.enemyShotStates.delete(enemy.id);
    enemy.startShooting(dronePosition);
    drone.explode();
    this.droneInput.clear();
    this.shotTraces.push({
      from: shotOrigin,
      to: dronePosition,
      age: 0,
      duration: 0.18
    });
    this.logCombat("drone shot down", {
      enemy: enemy.id,
      dronePosition: this.formatPoint(dronePosition)
    });
  }

  private canEnemySeeCharacter(enemy: Enemy, character: Character): boolean {
    if (character.isDead() || character.isBound()) {
      return false;
    }

    const target = {
      x: character.state.position.x,
      y: character.state.position.y - 42
    };
    const targetDistance = this.getEnemyVisionDistance(enemy, target);

    if (targetDistance === null) {
      return false;
    }

    const vision = enemy.getVision();

    if (targetDistance <= vision.closeRange) {
      return true;
    }

    return character.state.stance !== "prone";
  }

  private findVisibleCharacter(enemy: Enemy): Character | null {
    for (const character of this.characters.values()) {
      if (this.canEnemySeeCharacter(enemy, character)) {
        return character;
      }
    }

    return null;
  }

  private findVisibleBoundEnemy(watcher: Enemy): Enemy | null {
    for (const enemy of this.enemies.values()) {
      if (
        enemy.id !== watcher.id &&
        enemy.state === "bound" &&
        this.getEnemyVisionDistance(watcher, this.getEnemyTiePoint(enemy)) !== null
      ) {
        return enemy;
      }
    }

    return null;
  }

  private getEnemyVisionDistance(enemy: Enemy, target: WorldPoint): number | null {
    const vision = enemy.getVision();
    const toTarget = {
      x: target.x - vision.eye.x,
      y: target.y - vision.eye.y
    };
    const targetDistance = Math.hypot(toTarget.x, toTarget.y);

    if (targetDistance > vision.farRange || targetDistance < 0.001) {
      return null;
    }

    const angleToTarget = Math.atan2(toTarget.y, toTarget.x);
    const angleDelta = Math.abs(this.angleDifference(angleToTarget, vision.sweepFacingAngle));
    if (angleDelta > vision.halfAngle) {
      return null;
    }

    if (!this.hasLineOfSight(vision.eye, target)) {
      return null;
    }

    return targetDistance;
  }

  private isRescueInProgress(enemyId: EnemyId): boolean {
    for (const enemy of this.enemies.values()) {
      if (enemy.rescueTargetId === enemyId) {
        return true;
      }
    }

    return false;
  }

  private updateRescueAttempts(): void {
    for (const rescuer of this.enemies.values()) {
      if (!rescuer.rescueTargetId) {
        continue;
      }

      const boundEnemy = this.enemies.get(rescuer.rescueTargetId);
      if (!boundEnemy || boundEnemy.state !== "bound") {
        rescuer.completeRescue();
        continue;
      }

      rescuer.retargetRescue(boundEnemy);

      if (
        distanceSquared(rescuer.position, boundEnemy.position) >
        GAME_CONFIG.enemy.rescueRange * GAME_CONFIG.enemy.rescueRange
      ) {
        continue;
      }

      boundEnemy.unbind();
      rescuer.completeRescue();
      this.startAlarmSearch();
    }
  }

  private startAlarmSearch(): void {
    this.alarmActive = true;

    for (const enemy of this.enemies.values()) {
      enemy.startAlarmSearch();
    }
  }

  private updateAlarmState(): void {
    if (!this.alarmActive) {
      return;
    }

    if (this.pendingDroneShot) {
      this.alarmActive = true;
      return;
    }

    for (const enemy of this.enemies.values()) {
      if (enemy.hasAlarmWork()) {
        this.alarmActive = true;
        return;
      }
    }

    this.alarmActive = false;
  }

  private findShotHit(from: WorldPoint, to: WorldPoint): { enemy: Enemy; point: WorldPoint } | null {
    const segment = { x: to.x - from.x, y: to.y - from.y };
    const lengthSq = segment.x * segment.x + segment.y * segment.y;

    if (lengthSq < 0.001) {
      return null;
    }

    let nearestHit: { enemy: Enemy; point: WorldPoint; distanceFromShooter: number } | null = null;

    for (const enemy of this.enemies.values()) {
      if (enemy.state === "dead") {
        continue;
      }

      const targetPoint = {
        x: enemy.position.x,
        y: enemy.position.y + GAME_CONFIG.enemy.hitPointOffsetY
      };
      const projection =
        ((targetPoint.x - from.x) * segment.x + (targetPoint.y - from.y) * segment.y) / lengthSq;

      if (projection < 0 || projection > 1) {
        continue;
      }

      if (distanceToSegment(targetPoint, from, to) > GAME_CONFIG.enemy.hitRadius) {
        continue;
      }

      if (!this.hasLineOfSight(from, targetPoint)) {
        continue;
      }

      const point = {
        x: from.x + segment.x * projection,
        y: from.y + segment.y * projection
      };
      const distanceFromShooter = distance(from, point);

      if (!nearestHit || distanceFromShooter < nearestHit.distanceFromShooter) {
        nearestHit = { enemy, point, distanceFromShooter };
      }
    }

    return nearestHit ? { enemy: nearestHit.enemy, point: nearestHit.point } : null;
  }

  private triggerGunshotAlarm(shooter: Character, shotOrigin: WorldPoint): void {
    const investigationPosition = { ...shooter.state.position };
    this.triggerAlarmAt(investigationPosition, "player-shot");
    this.logCombat("gunshot alarm", {
      shooter: shooter.id,
      shotOrigin: this.formatPoint(shotOrigin),
      investigationPosition: this.formatPoint(investigationPosition)
    });
  }

  private triggerAlarmAt(
    position: WorldPoint,
    reason: string,
    sourceEnemyId: EnemyId | null = null
  ): void {
    this.alarmFlash = {
      age: 0,
      duration: GAME_CONFIG.enemy.alarmDuration
    };
    this.alarmActive = true;

    this.logCombat("alarm triggered", {
      reason,
      position: this.formatPoint(position),
      sourceEnemyId
    });

    for (const enemy of this.enemies.values()) {
      enemy.respondToPosition(position, sourceEnemyId);
    }
  }

  private damageCharacter(character: Character, source: Enemy): boolean {
    const killed = character.takeDamage(GAME_CONFIG.combat.kalashnikovDamage);

    if (killed) {
      this.tieAttempts.delete(character.id);
      this.doorOpenAttempts.delete(character.id);
      this.aimTargets.delete(character.id);
      this.endGame(character, source);
    }

    const vision = source.getVision();
    this.shotTraces.push({
      from: vision.eye,
      to: this.getCharacterSightPoint(character),
      age: 0,
      duration: 0.18
    });

    return killed;
  }

  private endGame(killedCharacter: Character, source: Enemy): void {
    if (this.gameOver) {
      return;
    }

    this.gameOver = true;
    this.droneInput.clear();
    this.enemyShotStates.clear();
    this.doorOpenAttempts.clear();
    this.pendingDroneShot = null;
    this.logCombat("game over", {
      killedCharacter: killedCharacter.id,
      source: source.id
    });
    this.loop.stop();
    window.setTimeout(() => this.showGameOverPrompt(), 0);
  }

  private showGameOverPrompt(): void {
    if (this.gameOverPromptShown) {
      return;
    }

    this.gameOverPromptShown = true;

    if (window.confirm("game over, you want to try again?")) {
      window.location.reload();
    }
  }

  private hasLineOfSight(from: WorldPoint, to: WorldPoint): boolean {
    for (const polygon of this.level.collisionPolygons) {
      if (this.segmentIntersectsPolygon(from, to, polygon.points)) {
        return false;
      }
    }

    for (const polygon of this.getActiveLevelObjectCollisionPolygons()) {
      if (this.segmentIntersectsPolygon(from, to, polygon)) {
        return false;
      }
    }

    return true;
  }

  private segmentIntersectsPolygon(from: WorldPoint, to: WorldPoint, polygon: WorldPoint[]): boolean {
    if (pointInPolygon(from, polygon) || pointInPolygon(to, polygon)) {
      return true;
    }

    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      if (segmentsIntersect(from, to, a, b)) {
        return true;
      }
    }

    return false;
  }

  private isEnemyPositionWalkable(position: WorldPoint, radius: number): boolean {
    if (!isInsideWorld(position, this.level.worldSize, radius)) {
      return false;
    }

    for (const polygon of this.level.collisionPolygons) {
      if (circleIntersectsPolygon(position, radius, polygon.points)) {
        return false;
      }
    }

    for (const polygon of this.getActiveLevelObjectCollisionPolygons()) {
      if (circleIntersectsPolygon(position, radius, polygon)) {
        return false;
      }
    }

    return true;
  }

  private isCharacterPositionWalkable(character: Character, position: WorldPoint): boolean {
    if (!isInsideWorld(position, this.level.worldSize, GAME_CONFIG.characterFootCollisionRadius)) {
      return false;
    }

    for (const polygon of this.level.collisionPolygons) {
      if (
        circleIntersectsPolygon(
          position,
          GAME_CONFIG.characterFootCollisionRadius,
          polygon.points
        )
      ) {
        return false;
      }
    }

    if (this.doesCharacterFootOverlapLevelObject(character, position)) {
      return false;
    }

    if (this.doesCharacterFootOverlapActiveCloud(position)) {
      return false;
    }

    return true;
  }

  private doesCharacterFootOverlapLevelObject(character: Character, position: WorldPoint): boolean {
    for (const object of this.levelObjects) {
      if (this.canCharacterEnterLevelObject(character, object, position)) {
        continue;
      }

      for (const polygon of this.getLevelObjectCollisionPolygons(object)) {
        if (circleIntersectsPolygon(position, GAME_CONFIG.characterFootCollisionRadius, polygon)) {
          return true;
        }
      }
    }

    return false;
  }

  private canCharacterEnterLevelObject(
    character: Character,
    object: PlacedLevelObject,
    position: WorldPoint
  ): boolean {
    const entryZones = object.entryZones;

    if (!entryZones?.length) {
      void character;
      return false;
    }

    if (object.kind === "gate" && !this.isDoorOpen(object)) {
      return false;
    }

    return entryZones.some((zone) => {
      if (!this.hasDoorKeyRequirement(character, zone.requiresKeyId)) {
        return false;
      }

      const zonePolygon = zone.points.map((point) => this.localObjectPointToWorld(object, point));
      return pointInPolygon(position, zonePolygon);
    });
  }

  private getActiveLevelObjectCollisionPolygons(): WorldPoint[][] {
    return this.levelObjects.flatMap((object) => this.getLevelObjectCollisionPolygons(object));
  }

  private getLevelObjectCollisionPolygons(object: PlacedLevelObject): WorldPoint[][] {
    return object.collisionShapes
      .filter((shape) => !(shape.disabledWhenOpen && this.isDoorOpen(object)))
      .map((shape) => shape.points.map((point) => this.localObjectPointToWorld(object, point)));
  }

  private localObjectPointToWorld(object: PlacedLevelObject, point: WorldPoint): WorldPoint {
    return {
      x: object.position.x + point.x,
      y: object.position.y + point.y
    };
  }

  private doesCharacterFootOverlapActiveCloud(position: WorldPoint): boolean {
    let overlapsCloud = false;

    this.forEachActiveCloudSprite((cloud) => {
      if (overlapsCloud) {
        return;
      }

      if (
        circleIntersectsPolygon(
          position,
          GAME_CONFIG.characterFootCollisionRadius,
          this.getCloudCollisionPolygon(cloud)
        )
      ) {
        overlapsCloud = true;
      }
    });

    return overlapsCloud;
  }

  private getCloudCollisionPolygon(cloud: CloudSpritePlacement): WorldPoint[] {
    const halfWidth = (cloud.width * GAME_CONFIG.cloud.collisionWidthRatio) / 2;
    const halfHeight = (cloud.height * GAME_CONFIG.cloud.collisionHeightRatio) / 2;
    const cos = Math.cos(cloud.rotation);
    const sin = Math.sin(cloud.rotation);
    const corners = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight }
    ];

    return corners.map((corner) => ({
      x: cloud.position.x + corner.x * cos - corner.y * sin,
      y: cloud.position.y + corner.x * sin + corner.y * cos
    }));
  }

  private isMayaNearPhotoArtifact(): boolean {
    const maya = this.characters.get("maya");

    if (!maya || maya.isDead() || maya.isBound()) {
      return false;
    }

    return (
      distanceSquared(maya.state.position, this.photoArtifact.position) <=
      this.photoArtifact.interactionRange * this.photoArtifact.interactionRange
    );
  }

  private getShotTarget(
    character: Character,
    origin: WorldPoint,
    pendingEnemyTargetId: EnemyId | null = null
  ): WorldPoint {
    const range = GAME_CONFIG.specialActions.shoot.range;
    const pendingEnemyTarget = pendingEnemyTargetId ? this.enemies.get(pendingEnemyTargetId) : null;
    const cursorEnemyTarget = this.cursorWorld ? this.findEnemyAt(this.cursorWorld) : null;
    const aimTarget = this.getAimTarget(character.id);
    const enemyTarget =
      pendingEnemyTarget && !pendingEnemyTarget.isDead()
        ? pendingEnemyTarget
        : cursorEnemyTarget && !cursorEnemyTarget.isDead()
          ? cursorEnemyTarget
          : aimTarget;
    const aimPoint = enemyTarget
      ? this.getEnemyTiePoint(enemyTarget)
      : this.cursorWorld ?? this.getPointAhead(character, range, origin);
    const aimDistance = distance(origin, aimPoint);

    if (aimDistance < 0.001) {
      return this.getPointAhead(character, range, origin);
    }

    const clampedDistance = enemyTarget ? Math.min(aimDistance, range) : range;
    const scale = clampedDistance / aimDistance;

    return {
      x: origin.x + (aimPoint.x - origin.x) * scale,
      y: origin.y + (aimPoint.y - origin.y) * scale
    };
  }

  private getShotOrigin(character: Character): WorldPoint {
    return {
      x: character.state.position.x,
      y: character.state.position.y + (character.state.stance === "prone" ? -18 : -42)
    };
  }

  private getPointAhead(character: Character, length: number, origin = character.state.position): WorldPoint {
    const vector = this.getDirectionVector(character.state.direction);

    return {
      x: origin.x + vector.x * length,
      y: origin.y + vector.y * length
    };
  }

  private getDirectionVector(direction: Direction): WorldPoint {
    const diagonal = Math.SQRT1_2;

    switch (direction) {
      case "left":
        return { x: -1, y: 0 };
      case "right":
        return { x: 1, y: 0 };
      case "up":
        return { x: 0, y: -1 };
      case "down":
        return { x: 0, y: 1 };
      case "up-left":
        return { x: -diagonal, y: -diagonal };
      case "up-right":
        return { x: diagonal, y: -diagonal };
      case "down-left":
        return { x: -diagonal, y: diagonal };
      case "down-right":
        return { x: diagonal, y: diagonal };
    }
  }

  private addMarker(position: WorldPoint, type: Marker["type"]): void {
    this.markers.push({
      position: { ...position },
      type,
      age: 0,
      duration:
        type === "target" ? GAME_CONFIG.markerDuration : GAME_CONFIG.invalidMarkerDuration
    });
  }

  private drawLevelBase(): void {
    const { width, height } = this.level.worldSize;

    if (this.mapTexture) {
      const mapSprite = new Sprite(this.mapTexture);
      mapSprite.position.set(0, 0);
      mapSprite.width = width;
      mapSprite.height = height;
      this.renderer.layers.background.addChild(mapSprite);
      this.renderer.layers.background.addChild(
        new Graphics().rect(0, 0, width, height).stroke({ color: "#10140d", width: 6 })
      );
      return;
    }

    const graphics = new Graphics();
    this.renderer.layers.background.addChild(graphics);

    graphics.rect(0, 0, width, height).fill("#28351f");
    graphics.rect(0, Math.floor(height * 0.32), width, Math.ceil(height * 0.36)).fill({
      color: "#26301f",
      alpha: 0.72
    });
    graphics.rect(0, Math.floor(height * 0.66), width, Math.ceil(height * 0.34)).fill({
      color: "#30321f",
      alpha: 0.78
    });

    for (let y = -220; y < height + 220; y += 95) {
      graphics
        .moveTo(-40, y)
        .lineTo(width + 40, y + 210)
        .stroke({ color: "#58644b", alpha: 0.25, width: 1 });
    }

    for (let x = 120; x < width; x += 180) {
      graphics
        .moveTo(x, 0)
        .lineTo(x - 140, height)
        .stroke({ color: "#11160f", alpha: 0.18, width: 1 });
    }

    this.fillPolygon(
      graphics,
      [
        { x: 170, y: 690 },
        { x: 530, y: 650 },
        { x: 585, y: 720 },
        { x: 250, y: 790 }
      ],
      "#53452b",
      0.22
    );
    this.fillPolygon(
      graphics,
      [
        { x: 1110, y: 210 },
        { x: 1560, y: 250 },
        { x: 1515, y: 335 },
        { x: 1085, y: 310 }
      ],
      "#53452b",
      0.22
    );

    graphics.rect(0, 0, width, height).stroke({ color: "#10140d", width: 6 });
    graphics.rect(0, height - 18, width, 18).fill({ color: "#0f120c", alpha: 0.42 });
    graphics.rect(width - 18, 0, 18, height).fill({ color: "#0f120c", alpha: 0.42 });
  }

  private drawSortedRenderables(): void {
    const items = this.renderItems;
    items.length = 0;

    for (const object of this.level.decorativeObjects) {
      items.push({
        sortY: getMaxY(object.footprint) + object.height,
        kind: "obstacle",
        object
      });
    }

    for (const object of this.levelObjects) {
      items.push({
        sortY: object.sortY ?? object.position.y,
        kind: "level-object",
        object
      });
    }

    for (const enemy of this.enemies.values()) {
      items.push({
        sortY: enemy.position.y,
        kind: "enemy",
        enemy
      });
    }

    items.push({
      sortY: this.photoArtifact.position.y,
      kind: "photo"
    });

    if (this.drone) {
      items.push({
        sortY: this.drone.position.y,
        kind: "drone",
        drone: this.drone
      });
    }

    for (const character of this.characters.values()) {
      items.push({
        sortY: character.state.position.y,
        kind: "character",
        character
      });
    }

    items.sort((a, b) => a.sortY - b.sortY);

    for (const item of items) {
      this.drawRenderItem(item);
    }
  }

  private drawRenderItem(item: RenderItem): void {
    switch (item.kind) {
      case "obstacle":
        this.drawFlatObstacle(item.object);
        return;
      case "level-object":
        this.drawLevelObject(item.object);
        return;
      case "enemy":
        item.enemy.draw(this.renderer.layers.sorted);
        return;
      case "photo":
        this.drawPhotoArtifact();
        return;
      case "drone":
        item.drone.draw(this.renderer.layers.sorted);
        return;
      case "character":
        item.character.draw(this.renderer.layers.sorted);
        return;
    }
  }

  private drawFlatObstacle(object: ObliquePrism): void {
    const graphics = new Graphics();
    this.renderer.layers.sorted.addChild(graphics);
    this.fillPolygon(graphics, object.footprint, "#4c5642", 0.94);
    this.strokePolygon(graphics, object.footprint, object.strokeColor, 2);

    const center = getPolygonCenter(object.footprint);
    graphics.ellipse(center.x, center.y, 18, 8).fill({ color: "#12170f", alpha: 0.16 });
  }

  private drawLevelObject(object: PlacedLevelObject): void {
    const texture = this.getLevelObjectTexture(object);
    if (!texture) {
      return;
    }

    const sprite = new Sprite(texture);
    const anchor = this.getLevelObjectAnchor(object);
    sprite.anchor.set(anchor.x, anchor.y);
    sprite.position.set(object.position.x, object.position.y);
    sprite.scale.set(object.scale);
    this.renderer.layers.sorted.addChild(sprite);
  }

  private getLevelObjectTexture(object: PlacedLevelObject): Texture | null {
    const texture = this.objectTextures.get(object.imagePath);
    if (!texture) {
      return null;
    }

    if (!object.frame) {
      return texture;
    }

    const frame = object.frame;
    const state = this.doorStates.get(object.id);
    const column = state?.frameIndex ?? frame.column;
    const frameWidth = texture.width / frame.columns;
    const frameHeight = texture.height / frame.rows;
    const key = `${object.imagePath}:${frame.columns}:${frame.rows}:${column}:${frame.row}`;
    const cached = this.objectFrameTextures.get(key);

    if (cached) {
      return cached;
    }

    const frameTexture = new Texture({
      source: texture.source,
      frame: new Rectangle(column * frameWidth, frame.row * frameHeight, frameWidth, frameHeight)
    });
    this.objectFrameTextures.set(key, frameTexture);
    return frameTexture;
  }

  private drawPhotoArtifact(): void {
    const { position, radius } = this.photoArtifact;
    const graphics = new Graphics();
    this.renderer.layers.sorted.addChild(graphics);

    graphics
      .ellipse(position.x, position.y, radius, radius * 0.62)
      .fill("#4e5a68")
      .stroke({ color: "#151b21", width: 2 });
    graphics
      .ellipse(position.x, position.y - 12, radius * 0.68, radius * 0.38)
      .fill("#87919c")
      .stroke({ color: "#151b21", width: 2 });
    graphics
      .circle(position.x, position.y, this.photoArtifact.interactionRange)
      .stroke({
        color: "#f0e58f",
        alpha: this.isMayaNearPhotoArtifact() ? 1 : 0.38,
        width: 1
      });
  }

  private drawSpecialEffects(): void {
    const graphics = new Graphics();
    this.renderer.layers.effects.addChild(graphics);

    for (const trace of this.shotTraces) {
      const alpha = Math.max(0, 1 - trace.age / trace.duration);

      graphics
        .moveTo(trace.from.x, trace.from.y)
        .lineTo(trace.to.x, trace.to.y)
        .stroke({ color: "#f5d46b", alpha, width: 3 });
    }

    for (const flash of this.photoFlashes) {
      const progress = flash.age / flash.duration;
      const alpha = Math.max(0, 1 - progress);

      graphics
        .circle(flash.position.x, flash.position.y - 12, 20 + progress * 44)
        .stroke({ color: "#f6f2ce", alpha, width: 2 });
    }
  }

  private drawTiePrompts(): void {
    const prompts = new Map<EnemyId, { enemy: Enemy; hovered: boolean }>();
    const hoveredEnemy = this.getHoveredTieEnemy();

    if (hoveredEnemy) {
      prompts.set(hoveredEnemy.id, { enemy: hoveredEnemy, hovered: true });
    }

    for (const attempt of this.tieAttempts.values()) {
      const enemy = this.enemies.get(attempt.enemyId);
      if (enemy && !this.isEnemyUnavailableForTie(enemy)) {
        prompts.set(enemy.id, {
          enemy,
          hovered: prompts.get(enemy.id)?.hovered ?? false
        });
      }
    }

    for (const prompt of prompts.values()) {
      this.drawTiePrompt(prompt.enemy, prompt.hovered);
    }
  }

  private drawDoorOpenPrompts(): void {
    const prompts = new Map<string, { object: PlacedLevelObject; hovered: boolean }>();
    const selectedCharacter = this.getSelectedCharacter();
    const hoveredObject = this.getHoveredDoorObject();

    if (hoveredObject) {
      prompts.set(hoveredObject.id, { object: hoveredObject, hovered: true });
    }

    for (const object of this.levelObjects) {
      if (!this.canStartDoorOpenAttempt(selectedCharacter, object)) {
        continue;
      }

      const range = object.interaction?.range ?? GAME_CONFIG.tie.catchRange;
      if (
        distanceSquared(selectedCharacter.state.position, this.getDoorInteractionPoint(object)) <=
        range * range
      ) {
        prompts.set(object.id, {
          object,
          hovered: prompts.get(object.id)?.hovered ?? false
        });
      }
    }

    for (const [rescuerId, attempt] of this.doorOpenAttempts) {
      const rescuer = this.characters.get(rescuerId);
      const object = this.getLevelObject(attempt.objectId);
      if (object && rescuer && this.canStartDoorOpenAttempt(rescuer, object)) {
        prompts.set(object.id, {
          object,
          hovered: prompts.get(object.id)?.hovered ?? false
        });
      }
    }

    for (const prompt of prompts.values()) {
      this.drawDoorOpenPrompt(prompt.object, prompt.hovered);
    }
  }

  private drawDoorOpenPrompt(object: PlacedLevelObject, hovered: boolean): void {
    const promptPoint = this.getDoorPromptPoint(object);
    const blink = 0.5 + Math.sin(this.elapsedTime * Math.PI * 4.8) * 0.5;
    const bob = Math.sin(this.elapsedTime * Math.PI * 2.1) * 2;
    const openAmount = 0.22 + blink * 0.28;
    const alpha = hovered ? 0.42 + blink * 0.58 : 0.5 + blink * 0.18;
    const graphics = new Graphics();

    graphics.position.set(promptPoint.x, promptPoint.y + bob);
    graphics.alpha = alpha;
    graphics
      .rect(-18, -16, 36, 30)
      .stroke({ color: "#080a07", alpha: 0.86, width: 6, join: "round" })
      .moveTo(-2, -16)
      .lineTo(-2, 14)
      .stroke({ color: "#080a07", alpha: 0.86, width: 6, cap: "round" })
      .rect(-18, -16, 36, 30)
      .stroke({ color: "#eadba8", width: 2, join: "round" })
      .moveTo(-2, -16)
      .lineTo(-2, 14)
      .stroke({ color: "#eadba8", width: 2, cap: "round" })
      .moveTo(-9, -6)
      .lineTo(-9 - openAmount * 13, 3)
      .moveTo(6, -6)
      .lineTo(6 + openAmount * 13, 3)
      .stroke({ color: "#f6f2ce", width: 3, cap: "round" })
      .circle(-11, 1, 2.2)
      .circle(8, 1, 2.2)
      .fill("#f6f2ce");

    this.renderer.layers.prompts.addChild(graphics);
  }

  private drawTiePrompt(enemy: Enemy, hovered: boolean): void {
    const position = enemy.getOverheadPoint();
    const blink = 0.5 + Math.sin(this.elapsedTime * Math.PI * 4.8) * 0.5;
    const bob = Math.sin(this.elapsedTime * Math.PI * 2.2) * 2;
    const alpha = hovered ? 0.35 + blink * 0.65 : 0.48 + blink * 0.18;
    const graphics = new Graphics();

    graphics.position.set(position.x, position.y + bob);
    graphics.alpha = alpha;
    this.strokeRopeIcon(graphics, "#080a07", 6, 0.86);
    this.strokeRopeIcon(graphics, "#eadba8", 3);
    graphics.circle(0, 11, 3.5).fill("#eadba8");
    this.renderer.layers.prompts.addChild(graphics);
  }

  private strokeRopeIcon(graphics: Graphics, color: string, width: number, alpha = 1): void {
    graphics
      .ellipse(-8, 0, 8, 11)
      .ellipse(8, 0, 8, 11)
      .moveTo(-18, -10)
      .bezierCurveTo(-10, -18, 10, -18, 18, -10)
      .moveTo(-5, 11)
      .lineTo(5, 11)
      .stroke({ color, alpha, width, cap: "round", join: "round" });
  }

  private drawEnemyVision(): void {
    const graphics = new Graphics();
    this.renderer.layers.vision.addChild(graphics);

    for (const enemy of this.enemies.values()) {
      if (enemy.state === "dead" || enemy.state === "bound") {
        continue;
      }

      const cone = this.buildDetectionCone(enemy);

      this.fillPolygon(graphics, cone.far, "#1a682d", 0.32);
      this.fillPolygon(graphics, cone.close, "#84ee68", 0.38);
      this.strokePolygon(
        graphics,
        cone.far,
        enemy.state === "shooting" ? "#ff503e" : "#8ee872",
        1.6,
        enemy.state === "shooting" ? 0.74 : 0.7
      );
    }
  }

  private buildDetectionCone(enemy: Enemy): DetectionCone {
    const vision = enemy.getVision();
    const leftAngle = vision.sweepFacingAngle - vision.halfAngle;
    const rightAngle = vision.sweepFacingAngle + vision.halfAngle;

    const pointAt = (angle: number, range: number): WorldPoint => ({
      x: vision.eye.x + Math.cos(angle) * range,
      y: vision.eye.y + Math.sin(angle) * range
    });

    return {
      close: [vision.eye, pointAt(leftAngle, vision.closeRange), pointAt(rightAngle, vision.closeRange)],
      far: [
        vision.eye,
        pointAt(leftAngle, vision.closeRange),
        pointAt(leftAngle, vision.farRange),
        pointAt(rightAngle, vision.farRange),
        pointAt(rightAngle, vision.closeRange)
      ]
    };
  }

  private drawMayaPhotoPrompt(): void {
    if (!this.isMayaNearPhotoArtifact()) {
      return;
    }

    const maya = this.characters.get("maya");
    if (!maya) {
      return;
    }

    this.renderer.layers.prompts.addChild(
      new Graphics()
        .moveTo(maya.state.position.x - 8, maya.state.position.y - 132)
        .lineTo(maya.state.position.x + 8, maya.state.position.y - 116)
        .moveTo(maya.state.position.x + 8, maya.state.position.y - 132)
        .lineTo(maya.state.position.x - 8, maya.state.position.y - 116)
        .stroke({ color: "#f6f2ce", width: 3 })
    );
  }

  private drawCloudZones(): void {
    if (this.level.cloudZones.length === 0 || !this.cloudTexture) {
      return;
    }

    this.forEachActiveCloudSprite((cloud) => {
      if (!this.cloudTexture) {
        return;
      }

      const sprite = new Sprite(this.cloudTexture);
      const textureScale = cloud.width / this.cloudTexture.width;
      sprite.anchor.set(0.5);
      sprite.position.set(cloud.position.x, cloud.position.y);
      sprite.scale.set(textureScale);
      sprite.rotation = cloud.rotation;
      sprite.alpha = GAME_CONFIG.cloud.alpha;
      this.renderer.layers.clouds.addChild(sprite);
    });
  }

  private forEachActiveCloudSprite(callback: (cloud: CloudSpritePlacement) => void): void {
    for (const zone of this.level.cloudZones) {
      this.forEachCloudSpriteInZone(zone, (cloud) => {
        if (!this.isCloudSpriteRevealed(cloud.position, cloud.width, cloud.height)) {
          callback(cloud);
        }
      });
    }
  }

  private forEachCloudSpriteInZone(
    zone: CloudZone,
    callback: (cloud: CloudSpritePlacement) => void
  ): void {
    const bounds = this.getPointBounds(zone.points);
    const baseWidth = GAME_CONFIG.cloud.tileWidth;
    const baseHeight = baseWidth * this.getCloudTextureAspectRatio();
    let row = 0;

    for (
      let y = bounds.minY - baseHeight * 0.25;
      y <= bounds.maxY + baseHeight * 0.25;
      y += GAME_CONFIG.cloud.tileSpacingY
    ) {
      let column = 0;

      for (
        let x = bounds.minX - baseWidth * 0.18 + (row % 2) * GAME_CONFIG.cloud.tileSpacingX * 0.5;
        x <= bounds.maxX + baseWidth * 0.18;
        x += GAME_CONFIG.cloud.tileSpacingX
      ) {
        const scale =
          1 + (this.getCloudJitter(zone.id, row, column, 2) - 0.5) * GAME_CONFIG.cloud.scaleJitter;
        const width = baseWidth * scale;
        const height = baseHeight * scale;
        const position = {
          x: x + (this.getCloudJitter(zone.id, row, column, 0) - 0.5) * GAME_CONFIG.cloud.jitterX,
          y: y + (this.getCloudJitter(zone.id, row, column, 1) - 0.5) * GAME_CONFIG.cloud.jitterY
        };

        if (
          pointInPolygon(position, zone.points) ||
          circleIntersectsPolygon(position, Math.min(width, height) * 0.42, zone.points)
        ) {
          callback({
            position,
            width,
            height,
            rotation: (this.getCloudJitter(zone.id, row, column, 3) - 0.5) * 0.26
          });
        }

        column += 1;
      }

      row += 1;
    }
  }

  private getCloudTextureAspectRatio(): number {
    if (!this.cloudTexture || this.cloudTexture.width <= 0 || this.cloudTexture.height <= 0) {
      return 0.56;
    }

    return this.cloudTexture.height / this.cloudTexture.width;
  }

  private isCloudSpriteRevealed(position: WorldPoint, width: number, height: number): boolean {
    const revealRadius = GAME_CONFIG.enemy.visionRange;
    const spriteRadius = Math.min(width, height) * 0.36;
    const revealDistance = revealRadius + spriteRadius;

    for (const reveal of this.cloudReveals) {
      if (distanceSquared(reveal, position) <= revealDistance * revealDistance) {
        return true;
      }
    }

    return false;
  }

  private getPointBounds(points: WorldPoint[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return { minX, maxX, minY, maxY };
  }

  private getCloudJitter(id: string, row: number, column: number, salt: number): number {
    let seed = salt * 97;

    for (let index = 0; index < id.length; index += 1) {
      seed += id.charCodeAt(index) * (index + 1);
    }

    const value = Math.sin(seed + row * 12.9898 + column * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  private drawMarkers(): void {
    const graphics = new Graphics();
    this.renderer.layers.markers.addChild(graphics);

    for (const marker of this.markers) {
      const progress = marker.age / marker.duration;
      const alpha = Math.max(0, 1 - progress);

      if (marker.type === "target") {
        const radius = 7 + progress * 12;
        graphics
          .circle(marker.position.x, marker.position.y, radius)
          .stroke({ color: "#f0e58f", alpha, width: 2 })
          .moveTo(marker.position.x - 12, marker.position.y)
          .lineTo(marker.position.x + 12, marker.position.y)
          .moveTo(marker.position.x, marker.position.y - 12)
          .lineTo(marker.position.x, marker.position.y + 12)
          .stroke({ color: "#f0e58f", alpha, width: 2 });
      } else {
        graphics
          .circle(marker.position.x, marker.position.y, 9 + progress * 4)
          .stroke({ color: "#f25f4c", alpha, width: 3 })
          .moveTo(marker.position.x - 7, marker.position.y - 7)
          .lineTo(marker.position.x + 7, marker.position.y + 7)
          .moveTo(marker.position.x + 7, marker.position.y - 7)
          .lineTo(marker.position.x - 7, marker.position.y + 7)
          .stroke({ color: "#f25f4c", alpha, width: 3 });
      }
    }
  }

  private drawWorldDebug(): void {
    for (const polygon of this.level.collisionPolygons) {
      this.drawDebugPolygon(polygon);
    }

    for (const object of this.levelObjects) {
      this.getLevelObjectCollisionPolygons(object).forEach((points, index) => {
        this.drawDebugPolygon({
          id: `${object.id}-collision-${index}`,
          label: `${object.label} ${index + 1}`,
          points
        });
      });
    }

    for (const character of this.characters.values()) {
      character.drawDebug(this.renderer.layers.debug);
    }

    for (const enemy of this.enemies.values()) {
      enemy.drawDebug(this.renderer.layers.debug);
    }

    const bounds = this.camera.getVisibleBounds();
    const graphics = new Graphics()
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .stroke({ color: "#ffffff", alpha: 0.48, width: 2 });

    if (this.cursorWorld) {
      graphics
        .moveTo(this.cursorWorld.x - 8, this.cursorWorld.y)
        .lineTo(this.cursorWorld.x + 8, this.cursorWorld.y)
        .moveTo(this.cursorWorld.x, this.cursorWorld.y - 8)
        .lineTo(this.cursorWorld.x, this.cursorWorld.y + 8)
        .stroke({ color: "#ffffff", alpha: 0.8, width: 2 });
    }

    this.renderer.layers.debug.addChild(graphics);
  }

  private drawDebugPolygon(polygon: CollisionPolygon): void {
    const layer = this.renderer.layers.debug;
    const graphics = new Graphics();
    this.fillPolygon(graphics, polygon.points, "#ff4040", 0.18);
    this.strokePolygon(graphics, polygon.points, "#ff6060", 2, 0.9);
    layer.addChild(graphics);
    layer.addChild(
      new Text({
        text: polygon.label,
        x: polygon.points[0].x + 6,
        y: polygon.points[0].y - 20,
        style: {
          fill: "#ffd7b4",
          fontFamily: "Consolas, monospace",
          fontSize: 12
        }
      })
    );
  }

  private drawScreenDebug(): void {
    const selected = this.getSelectedCharacter();
    const lines = [
      `cursor: ${this.formatPoint(this.cursorWorld)}`,
      `selected: ${selected.name}`,
      `direction: ${selected.state.direction}`,
      `motion: ${selected.state.motion}`,
      `frame: ${selected.state.frameIndex}`
    ];

    this.renderer.screenLayer.addChild(
      new Graphics().rect(12, 12, 245, 104).fill({ color: "#080a07", alpha: 0.76 }),
      new Text({
        text: lines.join("\n"),
        x: 24,
        y: 25,
        style: {
          fill: "#e9eddf",
          fontFamily: "Consolas, monospace",
          fontSize: 12,
          lineHeight: 17
        }
      })
    );
  }

  private buildDebugReadout(selected: Character): string {
    const bounds = this.camera.getVisibleBounds();

    return [
      `cursor: ${this.formatPoint(this.cursorWorld)}`,
      `camera: x=${bounds.x.toFixed(1)} y=${bounds.y.toFixed(1)}`,
      `visible: ${bounds.width.toFixed(0)} x ${bounds.height.toFixed(0)}`,
      `hero: ${this.formatPoint(selected.state.position)}`,
      `target: ${this.formatPoint(selected.state.targetPosition)}`,
      `direction: ${selected.state.direction}`,
      `motion: ${selected.state.motion}`,
      `frame: ${selected.state.frameIndex}`,
      `heroes: ${[...this.characters.values()]
        .map(
          (character) =>
            `${character.id}:${character.state.health}${character.isBound() ? ":bound" : ""}`
        )
        .join(" ")}`,
      `alarm: ${this.alarmActive ? "active" : "idle"}`,
      `enemy shots: ${[...this.enemyShotStates.entries()]
        .map(([enemyId, state]) => `${enemyId}->${state.targetId}:${state.cooldown.toFixed(2)}`)
        .join(" ") || "-"}`,
      `enemies: ${[...this.enemies.values()].map((enemy) => `${enemy.id}:${enemy.state}:${enemy.health}`).join(" ")}`,
      `debug collision: ${
        this.level.collisionPolygons.length + this.getActiveLevelObjectCollisionPolygons().length
      } polygons`
    ].join("\n");
  }

  private drawAlarmIndicator(): void {
    if (!this.alarmFlash && !this.alarmActive) {
      return;
    }

    const pulse = this.alarmFlash
      ? 0.45 + Math.sin((this.alarmFlash.age / this.alarmFlash.duration) * Math.PI * 18) * 0.22
      : 0.55 + Math.sin(this.elapsedTime * Math.PI * 5.5) * 0.26;

    this.renderer.screenLayer.addChild(
      new Graphics()
        .circle(this.viewport.width - 42, 42, 20 + pulse * 5)
        .fill({ color: "#ff1f1f", alpha: this.alarmActive ? 0.76 + pulse * 0.18 : 0.58 + pulse * 0.28 })
        .stroke({ color: "#ffd2be", alpha: 0.82, width: 3 })
        .circle(this.viewport.width - 42, 42, 8 + pulse * 2)
        .fill({ color: "#ffd2be", alpha: 0.52 })
        .rect(0, 0, this.viewport.width, 8)
        .fill({ color: "#780000", alpha: this.alarmActive ? 0.46 : 0.34 })
    );
  }

  private fillPolygon(graphics: Graphics, points: WorldPoint[], color: string, alpha = 1): void {
    graphics.poly(points, true).fill({ color, alpha });
  }

  private strokePolygon(
    graphics: Graphics,
    points: WorldPoint[],
    color: string,
    width: number,
    alpha = 1
  ): void {
    graphics.poly(points, true).stroke({ color, alpha, width });
  }

  private angleDifference(a: number, b: number): number {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  private renderMessage(message: string, color = "#e5e1d6"): void {
    this.resizeCanvas();
    this.renderer.renderMessage(message, color);
  }

  private prepareScene(): void {
    this.resizeCanvas();
    this.renderer.beginFrame(this.camera.position);
  }

  private resizeCanvas = (): void => {
    const rect = this.canvas.parentElement?.getBoundingClientRect() ?? this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const pixelRatio = window.devicePixelRatio || 1;

    this.viewport = { width, height };
    this.camera.setViewport(width, height);
    this.renderer.resize(width, height, pixelRatio);
  };

  private logCombat(message: string, details: Record<string, unknown> = {}): void {
    console.log(`[combat] ${message}`, details);
  }

  private formatPoint(point: WorldPoint | null): string {
    if (!point) {
      return "-";
    }

    return `${point.x.toFixed(1)}, ${point.y.toFixed(1)}`;
  }

  private dispose = (): void => {
    this.loop.stop();
    this.inputManager?.destroy();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.resizeCanvas);
    window.removeEventListener("beforeunload", this.dispose);
    this.renderer.destroy();
  };
}
