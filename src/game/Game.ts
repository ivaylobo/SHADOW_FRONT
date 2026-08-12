import { SpriteAnimator } from "./animation/SpriteAnimator";
import { AssetLoader } from "./AssetLoader";
import { Camera } from "./Camera";
import { GAME_CONFIG } from "./config";
import { Character } from "./entities/Character";
import { Enemy } from "./entities/Enemy";
import {
  circleIntersectsPolygon,
  distance,
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

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly level = testLevel;
  private readonly assetLoader = new AssetLoader();
  private readonly camera = new Camera(testLevel.worldSize);
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
  private pixelRatio = 1;
  private debugEnabled = false;
  private cursorWorld: WorldPoint | null = null;
  private markers: Marker[] = [];
  private shotTraces: ShotTrace[] = [];
  private photoFlashes: PhotoFlash[] = [];
  private alarmFlash: AlarmFlash | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    sidePanel: HTMLElement
  ) {
    const context = this.canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context is not available.");
    }

    this.ctx = context;
    this.controlsPanel = new ControlsPanel(sidePanel);
    window.addEventListener("beforeunload", this.dispose);
  }

  async start(): Promise<void> {
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
        },
        onKeyDown: (key, code) => this.handleKeyDown(key, code)
      });
      this.resizeObserver = new ResizeObserver(this.resizeCanvas);
      this.resizeObserver.observe(this.canvas);
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
    this.prepareContext();
    this.ctx.fillStyle = "#0c0f0a";
    this.ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    this.ctx.save();
    this.ctx.translate(-this.camera.position.x, -this.camera.position.y);
    this.drawLevelBase();
    this.drawMarkers();
    this.drawEnemyVision();
    this.drawSortedRenderables();
    this.drawSpecialEffects();
    this.drawMayaPhotoPrompt();

    if (this.debugEnabled) {
      this.drawWorldDebug();
    }

    this.ctx.restore();

    if (this.debugEnabled) {
      this.drawScreenDebug();
    }
    this.drawAlarmIndicator();
  }

  private handleCanvasCommand(command: CanvasCommand): void {
    const clickedCharacter = this.findCharacterAt(command.worldPosition);

    if (clickedCharacter) {
      this.selectCharacter(clickedCharacter.id);
      if (clickedCharacter.state.targetPosition) {
        clickedCharacter.stop();
      }
      return;
    }

    const selectedCharacter = this.getSelectedCharacter();

    if (!this.isCharacterPositionWalkable(selectedCharacter, command.worldPosition)) {
      this.addMarker(command.worldPosition, "invalid");
      return;
    }

    const requestedMotion: TerrainMotion =
      command.shiftKey || command.isDoubleClick ? "run" : "walk";

    selectedCharacter.setTarget(command.worldPosition, requestedMotion);
    this.addMarker(command.worldPosition, "target");
  }

  private triggerSelectedSpecialAction(): void {
    const character = this.getSelectedCharacter();

    if (character.state.action) {
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

    const shotTarget = this.getShotTarget(character);

    character.startSpecialAction("shoot", shotTarget);
    this.shotTraces.push({
      from: { ...character.state.position },
      to: { ...shotTarget },
      age: 0,
      duration: 0.18
    });
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
      this.getSelectedCharacter().stop();
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

  private updateEnemyDetection(): void {
    for (const enemy of this.enemies.values()) {
      if (enemy.state === "shooting") {
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

  private getShotTarget(character: Character): WorldPoint {
    const range = GAME_CONFIG.specialActions.shoot.range;
    const origin = character.state.position;
    const aimPoint = this.cursorWorld ?? this.getPointAhead(character, range);
    const aimDistance = distance(origin, aimPoint);

    if (aimDistance < 0.001) {
      return this.getPointAhead(character, range);
    }

    const clampedDistance = Math.min(aimDistance, range);
    const scale = clampedDistance / aimDistance;

    return {
      x: origin.x + (aimPoint.x - origin.x) * scale,
      y: origin.y + (aimPoint.y - origin.y) * scale
    };
  }

  private getPointAhead(character: Character, length: number): WorldPoint {
    const vector = this.getDirectionVector(character.state.direction);

    return {
      x: character.state.position.x + vector.x * length,
      y: character.state.position.y + vector.y * length
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
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#28351f");
    gradient.addColorStop(0.48, "#26301f");
    gradient.addColorStop(1, "#30321f");

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.save();
    this.ctx.globalAlpha = 0.25;
    this.ctx.strokeStyle = "#58644b";
    this.ctx.lineWidth = 1;

    for (let y = -220; y < height + 220; y += 95) {
      this.ctx.beginPath();
      this.ctx.moveTo(-40, y);
      this.ctx.lineTo(width + 40, y + 210);
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 0.18;
    this.ctx.strokeStyle = "#11160f";
    for (let x = 120; x < width; x += 180) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x - 140, height);
      this.ctx.stroke();
    }
    this.ctx.restore();

    this.ctx.fillStyle = "rgba(83, 69, 43, 0.22)";
    this.drawPolygon([
      { x: 170, y: 690 },
      { x: 530, y: 650 },
      { x: 585, y: 720 },
      { x: 250, y: 790 }
    ]);
    this.drawPolygon([
      { x: 1110, y: 210 },
      { x: 1560, y: 250 },
      { x: 1515, y: 335 },
      { x: 1085, y: 310 }
    ]);

    this.ctx.strokeStyle = "#10140d";
    this.ctx.lineWidth = 6;
    this.ctx.strokeRect(0, 0, width, height);
    this.ctx.fillStyle = "rgba(15, 18, 12, 0.42)";
    this.ctx.fillRect(0, height - 18, width, 18);
    this.ctx.fillRect(width - 18, 0, 18, height);
  }

  private drawSortedRenderables(): void {
    const items: RenderItem[] = [
      ...this.level.decorativeObjects.map((object) => ({
        sortY: getMaxY(object.footprint) + object.height,
        draw: () => this.drawFlatObstacle(object)
      })),
      ...[...this.enemies.values()].map((enemy) => ({
        sortY: enemy.position.y,
        draw: () => enemy.draw(this.ctx)
      })),
      {
        sortY: this.photoArtifact.position.y,
        draw: () => this.drawPhotoArtifact()
      },
      ...[...this.characters.values()].map((character) => ({
        sortY: character.state.position.y,
        draw: () => character.draw(this.ctx)
      }))
    ];

    items.sort((a, b) => a.sortY - b.sortY);

    for (const item of items) {
      item.draw();
    }
  }

  private drawFlatObstacle(object: ObliquePrism): void {
    this.ctx.save();
    this.ctx.fillStyle = "rgba(76, 86, 66, 0.94)";
    this.drawPolygon(object.footprint);
    this.ctx.strokeStyle = object.strokeColor;
    this.ctx.lineWidth = 2;
    this.strokePolygon(object.footprint);

    const center = getPolygonCenter(object.footprint);
    this.ctx.fillStyle = "rgba(18, 23, 15, 0.16)";
    this.ctx.beginPath();
    this.ctx.ellipse(center.x, center.y, 18, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawPhotoArtifact(): void {
    const { position, radius } = this.photoArtifact;

    this.ctx.save();
    this.ctx.fillStyle = "#4e5a68";
    this.ctx.strokeStyle = "#151b21";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.ellipse(position.x, position.y, radius, radius * 0.62, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = "#87919c";
    this.ctx.beginPath();
    this.ctx.ellipse(position.x, position.y - 12, radius * 0.68, radius * 0.38, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.strokeStyle = this.isMayaNearPhotoArtifact() ? "#f0e58f" : "rgba(240, 229, 143, 0.38)";
    this.ctx.setLineDash([5, 6]);
    this.ctx.beginPath();
    this.ctx.arc(position.x, position.y, this.photoArtifact.interactionRange, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawSpecialEffects(): void {
    for (const trace of this.shotTraces) {
      const alpha = Math.max(0, 1 - trace.age / trace.duration);

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = "#f5d46b";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(trace.from.x, trace.from.y - 34);
      this.ctx.lineTo(trace.to.x, trace.to.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    for (const flash of this.photoFlashes) {
      const progress = flash.age / flash.duration;
      const alpha = Math.max(0, 1 - progress);

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = "#f6f2ce";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(flash.position.x, flash.position.y - 12, 20 + progress * 44, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private drawEnemyVision(): void {
    for (const enemy of this.enemies.values()) {
      const cone = this.buildDetectionCone(enemy);

      this.ctx.save();
      this.ctx.fillStyle = "rgba(26, 104, 45, 0.32)";
      this.drawPolygon(cone.far);
      this.ctx.fillStyle = "rgba(132, 238, 104, 0.38)";
      this.drawPolygon(cone.close);
      this.ctx.strokeStyle = enemy.state === "shooting" ? "rgba(255, 80, 62, 0.74)" : "rgba(142, 232, 114, 0.7)";
      this.ctx.lineWidth = 1.6;
      this.strokePolygon(cone.far);
      this.ctx.restore();
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

    this.ctx.save();
    this.ctx.strokeStyle = "#f6f2ce";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(maya.state.position.x - 8, maya.state.position.y - 132);
    this.ctx.lineTo(maya.state.position.x + 8, maya.state.position.y - 116);
    this.ctx.moveTo(maya.state.position.x + 8, maya.state.position.y - 132);
    this.ctx.lineTo(maya.state.position.x - 8, maya.state.position.y - 116);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawMarkers(): void {
    for (const marker of this.markers) {
      const progress = marker.age / marker.duration;
      const alpha = Math.max(0, 1 - progress);

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.translate(marker.position.x, marker.position.y);

      if (marker.type === "target") {
        const radius = 7 + progress * 12;
        this.ctx.strokeStyle = "#f0e58f";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-12, 0);
        this.ctx.lineTo(12, 0);
        this.ctx.moveTo(0, -12);
        this.ctx.lineTo(0, 12);
        this.ctx.stroke();
      } else {
        this.ctx.strokeStyle = "#f25f4c";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 9 + progress * 4, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-7, -7);
        this.ctx.lineTo(7, 7);
        this.ctx.moveTo(7, -7);
        this.ctx.lineTo(-7, 7);
        this.ctx.stroke();
      }

      this.ctx.restore();
    }
  }

  private drawWorldDebug(): void {
    for (const polygon of this.level.collisionPolygons) {
      this.drawDebugPolygon(polygon);
    }

    for (const character of this.characters.values()) {
      character.drawDebug(this.ctx);
    }

    for (const enemy of this.enemies.values()) {
      enemy.drawDebug(this.ctx);
    }

    const bounds = this.camera.getVisibleBounds();
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
    this.ctx.setLineDash([8, 6]);
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

    if (this.cursorWorld) {
      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      this.ctx.beginPath();
      this.ctx.moveTo(this.cursorWorld.x - 8, this.cursorWorld.y);
      this.ctx.lineTo(this.cursorWorld.x + 8, this.cursorWorld.y);
      this.ctx.moveTo(this.cursorWorld.x, this.cursorWorld.y - 8);
      this.ctx.lineTo(this.cursorWorld.x, this.cursorWorld.y + 8);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private drawDebugPolygon(polygon: CollisionPolygon): void {
    this.ctx.save();
    this.ctx.fillStyle = "rgba(255, 64, 64, 0.18)";
    this.ctx.strokeStyle = "rgba(255, 96, 96, 0.9)";
    this.ctx.lineWidth = 2;
    this.drawPolygon(polygon.points);
    this.strokePolygon(polygon.points);
    this.ctx.fillStyle = "rgba(255, 215, 180, 0.95)";
    this.ctx.font = "12px Consolas, monospace";
    this.ctx.fillText(polygon.label, polygon.points[0].x + 6, polygon.points[0].y - 6);
    this.ctx.restore();
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

    this.ctx.save();
    this.ctx.fillStyle = "rgba(8, 10, 7, 0.76)";
    this.ctx.fillRect(12, 12, 245, 104);
    this.ctx.fillStyle = "#e9eddf";
    this.ctx.font = "12px Consolas, monospace";
    lines.forEach((line, index) => {
      this.ctx.fillText(line, 24, 34 + index * 17);
    });
    this.ctx.restore();
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

    this.ctx.save();
    this.ctx.fillStyle = `rgba(255, 31, 31, ${0.58 + pulse * 0.28})`;
    this.ctx.strokeStyle = "rgba(255, 210, 190, 0.82)";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(this.viewport.width - 42, 42, 20 + pulse * 5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.fillStyle = "rgba(120, 0, 0, 0.34)";
    this.ctx.fillRect(0, 0, this.viewport.width, 8);
    this.ctx.restore();
  }

  private drawPolygon(points: WorldPoint[]): void {
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i += 1) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }

    this.ctx.closePath();
    this.ctx.fill();
  }

  private strokePolygon(points: WorldPoint[]): void {
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i += 1) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }

    this.ctx.closePath();
    this.ctx.stroke();
  }

  private angleDifference(a: number, b: number): number {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  private renderMessage(message: string, color = "#e5e1d6"): void {
    this.prepareContext();
    this.ctx.fillStyle = "#10130d";
    this.ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
    this.ctx.fillStyle = color;
    this.ctx.font = "16px system-ui, sans-serif";
    this.ctx.fillText(message, 24, 36);
  }

  private prepareContext(): void {
    this.resizeCanvas();
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.ctx.imageSmoothingEnabled = true;
  }

  private resizeCanvas = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const pixelRatio = window.devicePixelRatio || 1;
    const internalWidth = Math.max(1, Math.floor(width * pixelRatio));
    const internalHeight = Math.max(1, Math.floor(height * pixelRatio));

    if (this.canvas.width !== internalWidth || this.canvas.height !== internalHeight) {
      this.canvas.width = internalWidth;
      this.canvas.height = internalHeight;
    }

    this.pixelRatio = pixelRatio;
    this.viewport = { width, height };
    this.camera.setViewport(width, height);
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
  };
}
