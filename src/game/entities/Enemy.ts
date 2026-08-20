import { Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { GAME_CONFIG } from "../config";
import { clonePoint, directionFromVector, distance, distanceSquared, normalize } from "../geometry";
import type { Direction, EnemyId, MovingMotion, WorldPoint } from "../types";

type EnemyState =
  | "patrol"
  | "responding"
  | "rescuing"
  | "searching"
  | "shooting"
  | "dead"
  | "bound"
  | "arrested"
  | "escorted";

export interface EnemyOptions {
  id: EnemyId;
  name: string;
  image: HTMLImageElement;
  arrestedImage: HTMLImageElement;
  route: WorldPoint[];
  alarmRoute?: WorldPoint[];
}

export interface EnemyVision {
  eye: WorldPoint;
  facingAngle: number;
  sweepFacingAngle: number;
  closeRange: number;
  farRange: number;
  halfAngle: number;
}

const ENEMY_SHEET = {
  columns: GAME_CONFIG.enemy.sprite.columns,
  rows: GAME_CONFIG.enemy.sprite.rows,
  frameWidth: GAME_CONFIG.enemy.sprite.sheetWidth / GAME_CONFIG.enemy.sprite.columns,
  frameHeight: GAME_CONFIG.enemy.sprite.sheetHeight / GAME_CONFIG.enemy.sprite.rows,
  shootRow: GAME_CONFIG.enemy.sprite.shootRow,
  boundRow: GAME_CONFIG.enemy.sprite.boundRow,
  deadRow: GAME_CONFIG.enemy.sprite.deadRow,
  deadFrame: GAME_CONFIG.enemy.sprite.deadFrame
};

const ROW_OFFSETS: Record<Direction, { row: number; flipX: boolean }> = {
  left: { row: 0, flipX: true },
  right: { row: 0, flipX: false },
  up: { row: 2, flipX: false },
  down: { row: 3, flipX: false },
  "up-left": { row: 4, flipX: true },
  "up-right": { row: 4, flipX: false },
  "down-left": { row: 6, flipX: true },
  "down-right": { row: 6, flipX: false }
};

const MOTION_ROW_OFFSET: Record<MovingMotion, number> = {
  walk: 0,
  run: 8,
  crawl: 16
};

export class Enemy {
  readonly id: EnemyId;
  readonly name: string;
  readonly image: HTMLImageElement;
  readonly arrestedImage: HTMLImageElement;
  readonly route: WorldPoint[];
  readonly alarmRoute: WorldPoint[];

  position: WorldPoint;
  direction: Direction = "down";
  state: EnemyState = "patrol";
  health: number = GAME_CONFIG.combat.maxHealth;
  targetPosition: WorldPoint | null = null;
  alertedBy: EnemyId | null = null;
  rescueTargetId: EnemyId | null = null;

  private readonly baseTexture: Texture;
  private readonly arrestedBaseTexture: Texture;
  private readonly frameTextures = new Map<string, Texture>();
  private routeIndex = 1;
  private alarmRouteIndex = 0;
  private alarmRouteVisits = 0;
  private frameIndex = 0;
  private animationElapsed = 0;
  private stateElapsed = 0;
  private facingAngle = Math.PI / 2;

  constructor(options: EnemyOptions) {
    if (options.route.length < 2) {
      throw new Error(`Enemy ${options.id} needs a patrol route with at least two points.`);
    }

    this.id = options.id;
    this.name = options.name;
    this.image = options.image;
    this.arrestedImage = options.arrestedImage;
    this.route = options.route.map(clonePoint);
    this.alarmRoute = (options.alarmRoute?.length ? options.alarmRoute : options.route).map(clonePoint);
    this.baseTexture = Texture.from(options.image);
    this.arrestedBaseTexture = Texture.from(options.arrestedImage);
    this.position = clonePoint(this.route[0]);
    this.targetPosition = clonePoint(this.route[1]);
  }

  update(deltaTime: number, isWalkable: (position: WorldPoint, radius: number) => boolean): void {
    this.stateElapsed += deltaTime;

    if (this.state === "dead") {
      this.advanceDeathAnimation(deltaTime);
      return;
    }

    if (this.isRestrained()) {
      return;
    }

    if (this.state === "shooting") {
      this.advanceAnimation("run", GAME_CONFIG.enemy.shootFps, deltaTime);
      return;
    }

    if (!this.targetPosition) {
      if (this.state === "searching") {
        this.setNextAlarmRouteTarget();
      } else if (this.state === "rescuing") {
        return;
      } else {
        this.setNextPatrolTarget();
      }
    }

    if (!this.targetPosition) {
      return;
    }

    const toTarget = {
      x: this.targetPosition.x - this.position.x,
      y: this.targetPosition.y - this.position.y
    };
    const remainingDistance = distance(this.position, this.targetPosition);

    if (remainingDistance <= GAME_CONFIG.arrivalThreshold) {
      this.position = clonePoint(this.targetPosition);
      if (this.state === "responding") {
        this.startAlarmSearch();
      } else if (this.state === "rescuing") {
        this.targetPosition = null;
      } else if (this.state === "searching") {
        this.advanceAlarmRoute();
      } else {
        this.setNextPatrolTarget();
      }
      return;
    }

    this.direction = directionFromVector(toTarget, this.direction);
    this.facingAngle = Math.atan2(toTarget.y, toTarget.x);
    const isAlertMovement =
      this.state === "responding" || this.state === "rescuing" || this.state === "searching";
    const speed = isAlertMovement ? GAME_CONFIG.enemy.runSpeed : GAME_CONFIG.enemy.walkSpeed;
    const stepDistance = Math.min(speed * deltaTime, remainingDistance);
    const movement = normalize(toTarget);
    const nextPosition = {
      x: this.position.x + movement.x * stepDistance,
      y: this.position.y + movement.y * stepDistance
    };

    if (!isWalkable(nextPosition, GAME_CONFIG.enemyCollisionRadius)) {
      if (this.state === "searching") {
        this.advanceAlarmRoute();
      } else if (this.state === "rescuing") {
        this.targetPosition = null;
      } else {
        this.setNextPatrolTarget();
      }
      return;
    }

    this.position = nextPosition;
    this.advanceAnimation(
      isAlertMovement ? "run" : "walk",
      isAlertMovement ? GAME_CONFIG.enemy.runFps : GAME_CONFIG.enemy.walkFps,
      deltaTime
    );
  }

  startShooting(target?: WorldPoint): void {
    if (this.state === "dead" || this.isRestrained()) {
      return;
    }

    if (target) {
      this.faceTarget(target);
    }

    this.state = "shooting";
    this.targetPosition = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
    this.rescueTargetId = null;
  }

  faceTarget(target: WorldPoint): void {
    const toTarget = { x: target.x - this.position.x, y: target.y - this.position.y };
    this.direction = directionFromVector(toTarget, this.direction);
    this.facingAngle = Math.atan2(toTarget.y, toTarget.x);
  }

  stopShooting(): void {
    if (this.state !== "shooting") {
      return;
    }

    this.resumePatrol();
  }

  respondTo(enemy: Enemy): void {
    this.respondToPosition(enemy.position, enemy.id);
  }

  respondToPosition(position: WorldPoint, alertedBy: EnemyId | null = null): void {
    if (
      this.state === "shooting" ||
      this.state === "dead" ||
      this.isRestrained() ||
      this.id === alertedBy
    ) {
      return;
    }

    this.state = "responding";
    this.alertedBy = alertedBy;
    this.rescueTargetId = null;
    this.targetPosition = clonePoint(position);
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  startRescue(boundEnemy: Enemy): void {
    if (
      this.state === "shooting" ||
      this.state === "dead" ||
      this.isRestrained() ||
      this.id === boundEnemy.id
    ) {
      return;
    }

    this.state = "rescuing";
    this.alertedBy = boundEnemy.id;
    this.rescueTargetId = boundEnemy.id;
    this.targetPosition = clonePoint(boundEnemy.position);
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  retargetRescue(boundEnemy: Enemy): void {
    if (this.state === "rescuing" && this.rescueTargetId === boundEnemy.id) {
      this.targetPosition = clonePoint(boundEnemy.position);
    }
  }

  completeRescue(): void {
    if (this.state !== "rescuing") {
      return;
    }

    this.resumePatrol();
  }

  unbind(): void {
    if (!this.isRestrained()) {
      return;
    }

    this.resumePatrol();
  }

  startAlarmSearch(): void {
    if (this.state === "shooting" || this.state === "dead" || this.isRestrained()) {
      return;
    }

    this.state = "searching";
    this.alertedBy = null;
    this.rescueTargetId = null;
    this.alarmRouteIndex = this.findClosestRouteIndex(this.alarmRoute);
    this.alarmRouteVisits = 0;
    this.targetPosition = clonePoint(this.alarmRoute[this.alarmRouteIndex]);
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  hasAlarmWork(): boolean {
    return (
      this.state === "responding" ||
      this.state === "rescuing" ||
      this.state === "searching" ||
      this.state === "shooting"
    );
  }

  bind(): void {
    this.arrest();
  }

  arrest(): void {
    if (this.state === "dead") {
      return;
    }

    this.state = "arrested";
    this.targetPosition = null;
    this.alertedBy = null;
    this.rescueTargetId = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  startEscort(): void {
    if (!this.isStationaryArrested()) {
      return;
    }

    this.state = "escorted";
    this.targetPosition = null;
    this.alertedBy = null;
    this.rescueTargetId = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  stopEscort(): void {
    if (this.state !== "escorted") {
      return;
    }

    this.state = "arrested";
    this.targetPosition = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  updateEscortedPosition(
    targetPosition: WorldPoint,
    leaderPosition: WorldPoint,
    deltaTime: number
  ): void {
    if (this.state !== "escorted") {
      return;
    }

    this.targetPosition = clonePoint(targetPosition);
    const toTarget = {
      x: targetPosition.x - this.position.x,
      y: targetPosition.y - this.position.y
    };
    const remainingDistance = distance(this.position, targetPosition);
    const facingTarget = remainingDistance > 0.001 ? targetPosition : leaderPosition;
    const toFacingTarget = {
      x: facingTarget.x - this.position.x,
      y: facingTarget.y - this.position.y
    };

    this.direction = directionFromVector(toFacingTarget, this.direction);
    this.facingAngle = Math.atan2(toFacingTarget.y, toFacingTarget.x);

    if (remainingDistance <= GAME_CONFIG.arrivalThreshold) {
      this.position = clonePoint(targetPosition);
      this.frameIndex = 0;
      this.animationElapsed = 0;
      return;
    }

    if (remainingDistance > GAME_CONFIG.arrest.followDistance * 4) {
      this.position = clonePoint(targetPosition);
      this.frameIndex = 0;
      this.animationElapsed = 0;
      return;
    }

    const stepDistance = Math.min(GAME_CONFIG.arrest.escortSpeed * deltaTime, remainingDistance);
    const movement = normalize(toTarget);
    this.position = {
      x: this.position.x + movement.x * stepDistance,
      y: this.position.y + movement.y * stepDistance
    };
    this.advanceAnimation("walk", GAME_CONFIG.enemy.walkFps, deltaTime);
  }

  isRestrained(): boolean {
    return this.state === "bound" || this.state === "arrested" || this.state === "escorted";
  }

  isStationaryArrested(): boolean {
    return this.state === "bound" || this.state === "arrested";
  }

  isEscorted(): boolean {
    return this.state === "escorted";
  }

  getVision(): EnemyVision {
    const sweepAmplitude = (GAME_CONFIG.enemy.sweepAngleDegrees * Math.PI) / 180 / 2;
    const sweep = Math.sin(this.stateElapsed * (Math.PI * 2 / GAME_CONFIG.enemy.sweepPeriodSeconds)) * sweepAmplitude;
    const sweepFacingAngle = this.facingAngle + (this.state === "shooting" ? 0 : sweep);

    return {
      eye: {
        x: this.position.x,
        y: this.position.y + GAME_CONFIG.enemy.eyeOffsetY
      },
      facingAngle: this.facingAngle,
      sweepFacingAngle,
      closeRange: GAME_CONFIG.enemy.visionRange * GAME_CONFIG.enemy.closeVisionRatio,
      farRange: GAME_CONFIG.enemy.visionRange,
      halfAngle: (GAME_CONFIG.enemy.baseVisionAngleDegrees * Math.PI) / 180 / 2
    };
  }

  containsWorldPoint(point: WorldPoint): boolean {
    if (this.state === "dead") {
      return false;
    }

    const size = this.getRenderSize();
    return (
      point.x >= this.position.x - size.width * 0.46 &&
      point.x <= this.position.x + size.width * 0.46 &&
      point.y >= this.position.y - size.height * 0.92 &&
      point.y <= this.position.y + 8
    );
  }

  getOverheadPoint(): WorldPoint {
    const size = this.getRenderSize();
    return {
      x: this.position.x,
      y: this.position.y - size.height - 18
    };
  }

  draw(container: Container): void {
    if (this.state === "dead") {
      this.drawDead(container);
      return;
    }

    const source = this.getSourceRect();

    const graphics = new Graphics()
      .ellipse(this.position.x, this.position.y - 4, 24, 9)
      .fill({ color: "#000000", alpha: 0.28 });

    if (this.state === "shooting") {
      graphics
        .circle(this.position.x, this.position.y - 52, 23)
        .stroke({ color: "#ff5841", alpha: 0.9, width: 2 });
    }

    container.addChild(graphics);

    const sprite = new Sprite(this.getFrameTexture(source, this.usesArrestedSprite()));
    sprite.anchor.set(0.5, 1);
    sprite.position.set(this.position.x, this.position.y);
    sprite.scale.set(
      source.flipX ? -GAME_CONFIG.enemy.renderScale : GAME_CONFIG.enemy.renderScale,
      GAME_CONFIG.enemy.renderScale
    );
    container.addChild(sprite);

    if (this.health < GAME_CONFIG.combat.maxHealth) {
      this.drawHealthBar(container);
    }
  }

  drawDebug(container: Container): void {
    container.addChild(
      new Graphics()
        .circle(this.position.x, this.position.y, GAME_CONFIG.enemyCollisionRadius)
        .stroke({ color: "#ff7854", alpha: 0.9, width: 1.5 }),
      new Text({
        text: `${this.id} ${this.state}`,
        x: this.position.x + 12,
        y: this.position.y - 92,
        style: {
          fill: "#ffb084",
          fontFamily: "Consolas, monospace",
          fontSize: 12
        }
      })
    );
  }

  private getSourceRect(): { x: number; y: number; width: number; height: number; flipX: boolean } {
    const motion: MovingMotion =
      this.state === "shooting" ||
      this.state === "responding" ||
      this.state === "rescuing" ||
      this.state === "searching"
        ? "run"
        : "walk";
    const rowRule = ROW_OFFSETS[this.direction];
    const row =
      this.isStationaryArrested()
        ? ENEMY_SHEET.boundRow
        : this.state === "shooting"
          ? ENEMY_SHEET.shootRow
          : MOTION_ROW_OFFSET[motion] + rowRule.row;

    return {
      x: this.frameIndex * ENEMY_SHEET.frameWidth,
      y: row * ENEMY_SHEET.frameHeight,
      width: ENEMY_SHEET.frameWidth,
      height: ENEMY_SHEET.frameHeight,
      flipX: rowRule.flipX
    };
  }

  private getDeathSourceRect(): {
    x: number;
    y: number;
    width: number;
    height: number;
    flipX: boolean;
  } | null {
    const deadRow = ENEMY_SHEET.deadRow ?? ENEMY_SHEET.rows - 1;

    if (deadRow < 0 || deadRow >= ENEMY_SHEET.rows) {
      return null;
    }

    const frameIndex = Math.min(
      Math.max(0, ENEMY_SHEET.deadFrame ?? this.frameIndex),
      ENEMY_SHEET.columns - 1
    );

    return {
      x: frameIndex * ENEMY_SHEET.frameWidth,
      y: deadRow * ENEMY_SHEET.frameHeight,
      width: ENEMY_SHEET.frameWidth,
      height: ENEMY_SHEET.frameHeight,
      flipX: this.direction === "left" || this.direction === "up-left" || this.direction === "down-left"
    };
  }

  private getRenderSize(): { width: number; height: number } {
    return {
      width: ENEMY_SHEET.frameWidth * GAME_CONFIG.enemy.renderScale,
      height: ENEMY_SHEET.frameHeight * GAME_CONFIG.enemy.renderScale
    };
  }

  takeDamage(amount: number): boolean {
    if (this.state === "dead") {
      return false;
    }

    this.health = Math.max(0, this.health - amount);

    if (this.health > 0) {
      return false;
    }

    this.die();
    return true;
  }

  isDead(): boolean {
    return this.state === "dead";
  }

  private die(): void {
    this.state = "dead";
    this.health = 0;
    this.targetPosition = null;
    this.alertedBy = null;
    this.rescueTargetId = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  private advanceDeathAnimation(deltaTime: number): void {
    const frameDuration = 1 / GAME_CONFIG.combat.deathFps;
    this.animationElapsed += deltaTime;

    while (
      this.animationElapsed >= frameDuration &&
      this.frameIndex < ENEMY_SHEET.columns - 1
    ) {
      this.frameIndex += 1;
      this.animationElapsed -= frameDuration;
    }
  }

  private drawDeathMarker(container: Container): void {
    container.addChild(
      new Graphics()
        .moveTo(this.position.x - 20, this.position.y - 64)
        .lineTo(this.position.x + 20, this.position.y - 24)
        .moveTo(this.position.x + 20, this.position.y - 64)
        .lineTo(this.position.x - 20, this.position.y - 24)
        .stroke({ color: "#f25f4c", alpha: 0.96, width: 6, cap: "round" })
    );
  }

  private drawDead(container: Container): void {
    const source = this.getDeathSourceRect();

    if (!source) {
      this.drawDeathMarker(container);
      return;
    }

    const sprite = new Sprite(this.getFrameTexture(source, false));
    sprite.anchor.set(0.5, 1);
    sprite.position.set(this.position.x, this.position.y);
    sprite.scale.set(
      source.flipX ? -GAME_CONFIG.enemy.renderScale : GAME_CONFIG.enemy.renderScale,
      GAME_CONFIG.enemy.renderScale
    );
    container.addChild(sprite);
  }

  private drawHealthBar(container: Container): void {
    const width = 48;
    const height = 6;
    const x = this.position.x - width / 2;
    const y = this.position.y - this.getRenderSize().height - 12;
    const fillWidth = width * (this.health / GAME_CONFIG.combat.maxHealth);

    container.addChild(
      new Graphics()
        .rect(x, y, width, height)
        .fill({ color: "#151812", alpha: 0.86 })
        .rect(x, y, fillWidth, height)
        .fill(this.health > 50 ? "#7dd35f" : "#f0c15d")
        .rect(x, y, width, height)
        .stroke({ color: "#10140d", alpha: 0.9, width: 1 })
    );
  }

  private usesArrestedSprite(): boolean {
    return this.state === "bound" || this.state === "arrested" || this.state === "escorted";
  }

  private getFrameTexture(source: {
    x: number;
    y: number;
    width: number;
    height: number;
  }, arrested: boolean): Texture {
    const key = `${arrested ? "arrested" : "normal"}:${source.x}:${source.y}:${source.width}:${source.height}`;
    const cached = this.frameTextures.get(key);

    if (cached) {
      return cached;
    }

    const baseTexture = arrested ? this.arrestedBaseTexture : this.baseTexture;
    const texture = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(source.x, source.y, source.width, source.height)
    });
    this.frameTextures.set(key, texture);

    return texture;
  }

  private setNextPatrolTarget(): void {
    this.state = "patrol";
    this.alertedBy = null;
    this.rescueTargetId = null;
    this.routeIndex = (this.routeIndex + 1) % this.route.length;
    this.targetPosition = clonePoint(this.route[this.routeIndex]);
  }

  private setNextAlarmRouteTarget(): void {
    this.targetPosition = clonePoint(this.alarmRoute[this.alarmRouteIndex]);
  }

  private advanceAlarmRoute(): void {
    this.alarmRouteVisits += 1;

    if (this.alarmRouteVisits >= this.alarmRoute.length) {
      this.resumePatrol();
      return;
    }

    this.alarmRouteIndex = (this.alarmRouteIndex + 1) % this.alarmRoute.length;
    this.targetPosition = clonePoint(this.alarmRoute[this.alarmRouteIndex]);
  }

  private resumePatrol(): void {
    this.state = "patrol";
    this.alertedBy = null;
    this.rescueTargetId = null;
    this.alarmRouteVisits = 0;
    this.routeIndex = this.findClosestRouteIndex(this.route);
    this.targetPosition = clonePoint(this.route[this.routeIndex]);
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  private findClosestRouteIndex(route: WorldPoint[]): number {
    let closestIndex = 0;
    let closestDistance = distanceSquared(this.position, route[0]);

    for (let index = 1; index < route.length; index += 1) {
      const routeDistance = distanceSquared(this.position, route[index]);

      if (routeDistance < closestDistance) {
        closestDistance = routeDistance;
        closestIndex = index;
      }
    }

    return closestIndex;
  }

  private advanceAnimation(_motion: MovingMotion, fps: number, deltaTime: number): void {
    const frameDuration = 1 / fps;
    this.animationElapsed += deltaTime;

    while (this.animationElapsed >= frameDuration) {
      this.frameIndex = (this.frameIndex + 1) % ENEMY_SHEET.columns;
      this.animationElapsed -= frameDuration;
    }
  }
}
