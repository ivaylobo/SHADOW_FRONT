import { Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { GAME_CONFIG } from "../config";
import { clonePoint, directionFromVector, distance, normalize } from "../geometry";
import type { Direction, EnemyId, MovingMotion, WorldPoint } from "../types";

type EnemyState = "patrol" | "responding" | "shooting" | "neutralized" | "bound";

export interface EnemyOptions {
  id: EnemyId;
  name: string;
  image: HTMLImageElement;
  route: WorldPoint[];
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
  boundRow: GAME_CONFIG.enemy.sprite.boundRow
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
  readonly route: WorldPoint[];

  position: WorldPoint;
  direction: Direction = "down";
  state: EnemyState = "patrol";
  targetPosition: WorldPoint | null = null;
  alertedBy: EnemyId | null = null;

  private readonly baseTexture: Texture;
  private readonly frameTextures = new Map<string, Texture>();
  private routeIndex = 1;
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
    this.route = options.route.map(clonePoint);
    this.baseTexture = Texture.from(options.image);
    this.position = clonePoint(this.route[0]);
    this.targetPosition = clonePoint(this.route[1]);
  }

  update(deltaTime: number, isWalkable: (position: WorldPoint, radius: number) => boolean): void {
    this.stateElapsed += deltaTime;

    if (this.state === "neutralized" || this.state === "bound") {
      return;
    }

    if (this.state === "shooting") {
      this.advanceAnimation("run", GAME_CONFIG.enemy.shootFps, deltaTime);
      return;
    }

    if (!this.targetPosition) {
      this.setNextPatrolTarget();
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
        this.startShooting();
      } else {
        this.setNextPatrolTarget();
      }
      return;
    }

    this.direction = directionFromVector(toTarget, this.direction);
    this.facingAngle = Math.atan2(toTarget.y, toTarget.x);
    const speed = this.state === "responding" ? GAME_CONFIG.enemy.runSpeed : GAME_CONFIG.enemy.walkSpeed;
    const stepDistance = Math.min(speed * deltaTime, remainingDistance);
    const movement = normalize(toTarget);
    const nextPosition = {
      x: this.position.x + movement.x * stepDistance,
      y: this.position.y + movement.y * stepDistance
    };

    if (!isWalkable(nextPosition, GAME_CONFIG.enemyCollisionRadius)) {
      this.setNextPatrolTarget();
      return;
    }

    this.position = nextPosition;
    this.advanceAnimation(this.state === "responding" ? "run" : "walk", this.state === "responding" ? GAME_CONFIG.enemy.runFps : GAME_CONFIG.enemy.walkFps, deltaTime);
  }

  startShooting(target?: WorldPoint): void {
    if (target) {
      const toTarget = { x: target.x - this.position.x, y: target.y - this.position.y };
      this.direction = directionFromVector(toTarget, this.direction);
      this.facingAngle = Math.atan2(toTarget.y, toTarget.x);
    }

    this.state = "shooting";
    this.targetPosition = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  respondTo(enemy: Enemy): void {
    if (
      this.state === "shooting" ||
      this.state === "neutralized" ||
      this.state === "bound" ||
      this.id === enemy.id
    ) {
      return;
    }

    this.state = "responding";
    this.alertedBy = enemy.id;
    this.targetPosition = clonePoint(enemy.position);
    this.frameIndex = 0;
    this.animationElapsed = 0;
  }

  neutralize(): void {
    this.state = "neutralized";
    this.targetPosition = null;
    this.alertedBy = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
  }

  bind(): void {
    this.state = "bound";
    this.targetPosition = null;
    this.alertedBy = null;
    this.frameIndex = 0;
    this.animationElapsed = 0;
    this.stateElapsed = 0;
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

    const sprite = new Sprite(this.getFrameTexture(source));
    sprite.anchor.set(0.5, 1);
    sprite.alpha = this.state === "neutralized" ? 0.52 : 1;
    sprite.position.set(this.position.x, this.position.y);
    sprite.scale.set(
      source.flipX ? -GAME_CONFIG.enemy.renderScale : GAME_CONFIG.enemy.renderScale,
      GAME_CONFIG.enemy.renderScale
    );
    container.addChild(sprite);

    if (this.state === "neutralized") {
      container.addChild(
        new Graphics()
          .moveTo(this.position.x - 18, this.position.y - 50)
          .lineTo(this.position.x + 18, this.position.y - 24)
          .moveTo(this.position.x + 18, this.position.y - 50)
          .lineTo(this.position.x - 18, this.position.y - 24)
          .stroke({ color: "#141410", alpha: 0.9, width: 4 })
      );
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
    const motion: MovingMotion = this.state === "shooting" ? "run" : this.state === "responding" ? "run" : "walk";
    const rowRule = ROW_OFFSETS[this.direction];
    const row =
      this.state === "bound"
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

  private getRenderSize(): { width: number; height: number } {
    return {
      width: ENEMY_SHEET.frameWidth * GAME_CONFIG.enemy.renderScale,
      height: ENEMY_SHEET.frameHeight * GAME_CONFIG.enemy.renderScale
    };
  }

  private getFrameTexture(source: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Texture {
    const key = `${source.x}:${source.y}:${source.width}:${source.height}`;
    const cached = this.frameTextures.get(key);

    if (cached) {
      return cached;
    }

    const texture = new Texture({
      source: this.baseTexture.source,
      frame: new Rectangle(source.x, source.y, source.width, source.height)
    });
    this.frameTextures.set(key, texture);

    return texture;
  }

  private setNextPatrolTarget(): void {
    this.state = "patrol";
    this.alertedBy = null;
    this.routeIndex = (this.routeIndex + 1) % this.route.length;
    this.targetPosition = clonePoint(this.route[this.routeIndex]);
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
