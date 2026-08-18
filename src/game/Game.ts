import { Graphics, Text } from "pixi.js";
import { SpriteAnimator } from "./animation/SpriteAnimator";
import { AssetLoader } from "./AssetLoader";
import { Camera } from "./Camera";
import { GAME_CONFIG } from "./config";
import { Character } from "./entities/Character";
import { Enemy } from "./entities/Enemy";
import {
  circleIntersectsPolygon,
  distance,
  distanceToSegment,
  getMaxY,
  getPolygonCenter,
  isInsideWorld,
  pointInPolygon,
  polygonsIntersect,
  segmentsIntersect,
  type Size
} from "./geometry";
import { GameLoop } from "./GameLoop";
import { InputManager, type CanvasCommand } from "./InputManager";
import type { CollisionPolygon, ObliquePrism } from "./levels/LevelDefinition";
import { testLevel } from "./levels/testLevel";
import { PixiGameRenderer } from "./rendering/PixiGameRenderer";
import type { CharacterId, Direction, EnemyId, MovingMotion, WorldPoint } from "./types";
import { ControlsPanel } from "./ui/ControlsPanel";

type TerrainMotion = Exclude<MovingMotion, "crawl">;

interface Marker {
  position: WorldPoint;
  type: "target" | "invalid";
  age: number;
  duration: number;
}

interface RenderItem {
  sortY: number;
  draw(): void;
}

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

export class Game {
  private readonly level = testLevel;
  private readonly assetLoader = new AssetLoader();
  private readonly camera = new Camera(testLevel.worldSize);
  private readonly renderer: PixiGameRenderer;
  private readonly controlsPanel: ControlsPanel;
  private readonly loop = new GameLoop();
  private readonly characters = new Map<CharacterId, Character>();
  private readonly enemies = new Map<EnemyId, Enemy>();
  private readonly photoArtifact = {
    position: { x: 880, y: 715 },
    radius: 26,
    interactionRange: GAME_CONFIG.specialActions.photo.range
  };

  private inputManager: InputManager | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private viewport: Size = { width: 1, height: 1 };
  private debugEnabled = false;
  private cursorWorld: WorldPoint | null = null;
  private markers: Marker[] = [];
  private shotTraces: ShotTrace[] = [];
  private photoFlashes: PhotoFlash[] = [];
  private alarmFlash: AlarmFlash | null = null;
  private elapsedTime = 0;
  private readonly tieAttempts = new Map<CharacterId, TieAttempt>();

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
    this.renderMessage("Зареждане на спрайтове...");

    try {
      const assets = await this.assetLoader.loadCharacterAssets();
      const animator = new SpriteAnimator(assets.manifest);

      this.characters.set(
        "maya",
        new Character({
          id: "maya",
          name: "Мая",
          image: assets.images.maya,
          initialPosition: this.level.initialPositions.maya,
          animator
        })
      );
      this.characters.set(
        "alyosha",
        new Character({
          id: "alyosha",
          name: "Альоша",
          image: assets.images.alyosha,
          initialPosition: this.level.initialPositions.alyosha,
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
            route: patrol.route
          })
        );
      }

      this.selectCharacter("maya");
      this.inputManager = new InputManager(this.canvas, this.camera, {
        onCanvasCommand: (command) => this.handleCanvasCommand(command),
        onCursorMove: (worldPosition) => {
          this.cursorWorld = worldPosition;
          this.updateCanvasCursor();
        },
        onKeyDown: (key, code) => this.handleKeyDown(key, code)
      });
      this.resizeObserver = new ResizeObserver(this.resizeCanvas);
      this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
      window.addEventListener("resize", this.resizeCanvas);
      this.loop.start((deltaTime) => this.frame(deltaTime));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.renderMessage(`Грешка при зареждане: ${message}`, "#ffb4a8");
      throw error;
    }
  }

  private frame(deltaTime: number): void {
    this.update(deltaTime);
    this.render();
  }

  private update(deltaTime: number): void {
    this.elapsedTime += deltaTime;
    this.syncTieAttemptTargets();

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
    this.updateTieAttempts();
    this.updateEnemyDetection();

    this.markers = this.markers
      .map((marker) => ({
        ...marker,
        age: marker.age + deltaTime
      }))
      .filter((marker) => marker.age <= marker.duration);
    this.shotTraces = this.shotTraces
      .map((trace) => ({
        ...trace,
        age: trace.age + deltaTime
      }))
      .filter((trace) => trace.age <= trace.duration);
    this.photoFlashes = this.photoFlashes
      .map((flash) => ({
        ...flash,
        age: flash.age + deltaTime
      }))
      .filter((flash) => flash.age <= flash.duration);
    if (this.alarmFlash) {
      this.alarmFlash.age += deltaTime;
      if (this.alarmFlash.age >= this.alarmFlash.duration) {
        this.alarmFlash = null;
      }
    }

    const selectedCharacter = this.getSelectedCharacter();
    this.camera.update(selectedCharacter.state.position, deltaTime);
    this.controlsPanel.updateStatus({
      name: selectedCharacter.name,
      state: selectedCharacter.state
    });
    this.controlsPanel.setDebug(this.debugEnabled, this.buildDebugReadout(selectedCharacter));
  }

  private render(): void {
    this.prepareScene();
    this.drawLevelBase();
    this.drawMarkers();
    this.drawEnemyVision();
    this.drawSortedRenderables();
    this.drawSpecialEffects();
    this.drawTiePrompts();
    this.drawMayaPhotoPrompt();

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
    const clickedCharacter = this.findCharacterAt(command.worldPosition);

    if (clickedCharacter) {
      this.selectCharacter(clickedCharacter.id);
      if (clickedCharacter.state.targetPosition) {
        clickedCharacter.stop();
        this.tieAttempts.delete(clickedCharacter.id);
      }
      return;
    }

    const selectedCharacter = this.getSelectedCharacter();
    const clickedEnemy = this.findEnemyAt(command.worldPosition);

    if (clickedEnemy) {
      if (!this.startTieAttempt(selectedCharacter, clickedEnemy)) {
        this.addMarker(clickedEnemy.position, "invalid");
        return;
      }

      this.addMarker(clickedEnemy.position, "target");
      return;
    }

    const requestedMotion: TerrainMotion =
      command.shiftKey || command.isDoubleClick ? "run" : "walk";

    if (!this.isCharacterPositionWalkable(selectedCharacter, command.worldPosition)) {
      this.addMarker(command.worldPosition, "invalid");
      return;
    }

    this.tieAttempts.delete(selectedCharacter.id);
    selectedCharacter.setTarget(command.worldPosition, requestedMotion);
    this.addMarker(command.worldPosition, "target");
  }

  private triggerSelectedSpecialAction(): void {
    const character = this.getSelectedCharacter();

    if (character.state.action) {
      return;
    }

    this.tieAttempts.delete(character.id);

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
    const shotTarget = this.getShotTarget(character, shotOrigin);
    const shotHit = this.findShotHit(shotOrigin, shotTarget);
    const traceTarget = shotHit?.point ?? shotTarget;

    character.startSpecialAction("shoot", shotTarget);
    this.shotTraces.push({
      from: shotOrigin,
      to: traceTarget,
      age: 0,
      duration: 0.18
    });

    shotHit?.enemy.neutralize();
  }

  private handleKeyDown(key: string, code: string): void {
    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "1" || code === "Digit1" || code === "Numpad1") {
      this.selectCharacter("maya");
      return;
    }

    if (normalizedKey === "2" || code === "Digit2" || code === "Numpad2") {
      this.selectCharacter("alyosha");
      return;
    }

    if (normalizedKey === "c" || normalizedKey === "с" || code === "KeyC") {
      this.getSelectedCharacter().toggleStance();
      return;
    }

    if (normalizedKey === "x" || normalizedKey === "х" || code === "KeyX") {
      this.triggerSelectedSpecialAction();
      return;
    }

    if (normalizedKey === "escape" || code === "Escape") {
      const character = this.getSelectedCharacter();
      character.stop();
      this.tieAttempts.delete(character.id);
      return;
    }

    if (normalizedKey === "d" || normalizedKey === "д" || code === "KeyD") {
      this.debugEnabled = !this.debugEnabled;
    }
  }

  private selectCharacter(id: CharacterId): void {
    for (const character of this.characters.values()) {
      character.setSelected(character.id === id);
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
    const charactersFrontToBack = [...this.characters.values()].sort(
      (a, b) => b.state.position.y - a.state.position.y
    );

    return charactersFrontToBack.find((character) => character.containsWorldPoint(point)) ?? null;
  }

  private findEnemyAt(point: WorldPoint): Enemy | null {
    const enemiesFrontToBack = [...this.enemies.values()].sort(
      (a, b) => b.position.y - a.position.y
    );

    return enemiesFrontToBack.find((enemy) => enemy.containsWorldPoint(point)) ?? null;
  }

  private getHoveredTieEnemy(): Enemy | null {
    if (!this.cursorWorld || this.findCharacterAt(this.cursorWorld)) {
      return null;
    }

    const enemy = this.findEnemyAt(this.cursorWorld);
    return enemy && !this.isEnemyUnavailableForTie(enemy) ? enemy : null;
  }

  private updateCanvasCursor(): void {
    this.canvas.style.cursor = this.getHoveredTieEnemy() ? "pointer" : "crosshair";
  }

  private startTieAttempt(character: Character, enemy: Enemy): boolean {
    if (character.state.stance !== "upright") {
      return false;
    }

    if (this.isEnemyUnavailableForTie(enemy)) {
      return false;
    }

    this.tieAttempts.set(character.id, {
      enemyId: enemy.id
    });

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

      if (this.isEnemyUnavailableForTie(enemy)) {
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

  private isEnemyUnavailableForTie(enemy: Enemy): boolean {
    return enemy.state === "shooting" || enemy.state === "neutralized" || enemy.state === "bound";
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

  private updateEnemyDetection(): void {
    for (const enemy of this.enemies.values()) {
      if (
        enemy.state === "shooting" ||
        enemy.state === "neutralized" ||
        enemy.state === "bound"
      ) {
        continue;
      }

      const detected = [...this.characters.values()].find((character) =>
        this.canEnemySeeCharacter(enemy, character)
      );

      if (!detected) {
        continue;
      }

      enemy.startShooting(detected.state.position);
      this.triggerAlarm(enemy);
    }
  }

  private canEnemySeeCharacter(enemy: Enemy, character: Character): boolean {
    const vision = enemy.getVision();
    const target = {
      x: character.state.position.x,
      y: character.state.position.y - 42
    };
    const toTarget = {
      x: target.x - vision.eye.x,
      y: target.y - vision.eye.y
    };
    const targetDistance = Math.hypot(toTarget.x, toTarget.y);

    if (targetDistance > vision.farRange || targetDistance < 0.001) {
      return false;
    }

    const angleToTarget = Math.atan2(toTarget.y, toTarget.x);
    const angleDelta = Math.abs(this.angleDifference(angleToTarget, vision.sweepFacingAngle));
    if (angleDelta > vision.halfAngle) {
      return false;
    }

    if (!this.hasLineOfSight(vision.eye, target)) {
      return false;
    }

    if (targetDistance <= vision.closeRange) {
      return true;
    }

    return character.state.stance !== "prone";
  }

  private findShotHit(from: WorldPoint, to: WorldPoint): { enemy: Enemy; point: WorldPoint } | null {
    const segment = { x: to.x - from.x, y: to.y - from.y };
    const lengthSq = segment.x * segment.x + segment.y * segment.y;

    if (lengthSq < 0.001) {
      return null;
    }

    let nearestHit: { enemy: Enemy; point: WorldPoint; distanceFromShooter: number } | null = null;

    for (const enemy of this.enemies.values()) {
      if (enemy.state === "neutralized" || enemy.state === "bound") {
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

  private triggerAlarm(source: Enemy): void {
    this.alarmFlash = {
      age: 0,
      duration: GAME_CONFIG.enemy.alarmDuration
    };

    for (const enemy of this.enemies.values()) {
      if (enemy.id !== source.id) {
        enemy.respondTo(source);
      }
    }
  }

  private hasLineOfSight(from: WorldPoint, to: WorldPoint): boolean {
    return !this.level.collisionPolygons.some((polygon) =>
      this.segmentIntersectsPolygon(from, to, polygon.points)
    );
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

    return !this.level.collisionPolygons.some((polygon) =>
      circleIntersectsPolygon(position, radius, polygon.points)
    );
  }

  private isCharacterPositionWalkable(character: Character, position: WorldPoint): boolean {
    if (!isInsideWorld(position, this.level.worldSize, GAME_CONFIG.collisionRadius)) {
      return false;
    }

    const bodyPolygon = character.getBodyCollisionPolygon(position);
    return !this.level.collisionPolygons.some((polygon) =>
      polygonsIntersect(bodyPolygon, polygon.points)
    );
  }

  private isMayaNearPhotoArtifact(): boolean {
    const maya = this.characters.get("maya");

    if (!maya) {
      return false;
    }

    return (
      distance(maya.state.position, this.photoArtifact.position) <=
      this.photoArtifact.interactionRange
    );
  }

  private getShotTarget(character: Character, origin: WorldPoint): WorldPoint {
    const range = GAME_CONFIG.specialActions.shoot.range;
    const aimPoint = this.cursorWorld ?? this.getPointAhead(character, range, origin);
    const aimDistance = distance(origin, aimPoint);

    if (aimDistance < 0.001) {
      return this.getPointAhead(character, range, origin);
    }

    const clampedDistance = Math.min(aimDistance, range);
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
    const items: RenderItem[] = [
      ...this.level.decorativeObjects.map((object) => ({
        sortY: getMaxY(object.footprint) + object.height,
        draw: () => this.drawFlatObstacle(object)
      })),
      ...[...this.enemies.values()].map((enemy) => ({
        sortY: enemy.position.y,
        draw: () => enemy.draw(this.renderer.layers.sorted)
      })),
      {
        sortY: this.photoArtifact.position.y,
        draw: () => this.drawPhotoArtifact()
      },
      ...[...this.characters.values()].map((character) => ({
        sortY: character.state.position.y,
        draw: () => character.draw(this.renderer.layers.sorted)
      }))
    ];

    items.sort((a, b) => a.sortY - b.sortY);

    for (const item of items) {
      item.draw();
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
      if (enemy.state === "neutralized" || enemy.state === "bound") {
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
      `enemies: ${[...this.enemies.values()].map((enemy) => `${enemy.id}:${enemy.state}`).join(" ")}`,
      `debug collision: ${this.level.collisionPolygons.length} polygons`
    ].join("\n");
  }

  private drawAlarmIndicator(): void {
    if (!this.alarmFlash) {
      return;
    }

    const progress = this.alarmFlash.age / this.alarmFlash.duration;
    const pulse = 0.45 + Math.sin(progress * Math.PI * 18) * 0.22;

    this.renderer.screenLayer.addChild(
      new Graphics()
        .circle(this.viewport.width - 42, 42, 20 + pulse * 5)
        .fill({ color: "#ff1f1f", alpha: 0.58 + pulse * 0.28 })
        .stroke({ color: "#ffd2be", alpha: 0.82, width: 3 })
        .rect(0, 0, this.viewport.width, 8)
        .fill({ color: "#780000", alpha: 0.34 })
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
