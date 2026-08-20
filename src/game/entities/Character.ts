import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { GAME_CONFIG } from "../config";
import { clonePoint, directionFromVector, distance, normalize } from "../geometry";
import type { SpriteAnimator } from "../animation/SpriteAnimator";
import type {
  CharacterId,
  CharacterState,
  MovingMotion,
  SpecialAction,
  WorldPoint
} from "../types";

export interface CharacterOptions {
  id: CharacterId;
  name: string;
  image: HTMLImageElement;
  initialPosition: WorldPoint;
  animator: SpriteAnimator;
}

export type WalkableCheck = (character: Character, position: WorldPoint) => boolean;

export class Character {
  readonly id: CharacterId;
  readonly name: string;
  readonly image: HTMLImageElement;
  readonly state: CharacterState;

  private readonly animator: SpriteAnimator;
  private readonly baseTexture: Texture;
  private readonly frameTextures = new Map<string, Texture>();
  private animationElapsed = 0;
  private actionElapsed = 0;
  private movementIntent: Exclude<MovingMotion, "crawl"> = "walk";
  private speedOverride: number | null = null;
  private waypointQueue: WorldPoint[] = [];

  constructor(options: CharacterOptions) {
    this.id = options.id;
    this.name = options.name;
    this.image = options.image;
    this.animator = options.animator;
    this.baseTexture = Texture.from(options.image);
    this.state = {
      position: clonePoint(options.initialPosition),
      targetPosition: null,
      health: GAME_CONFIG.combat.maxHealth,
      dead: false,
      bound: false,
      selected: false,
      stance: "upright",
      motion: "idle",
      action: null,
      direction: "down",
      frameIndex: 0
    };
  }

  setSelected(selected: boolean): void {
    this.state.selected = selected;
  }

  setTarget(
    targetPosition: WorldPoint,
    requestedMotion: Exclude<MovingMotion, "crawl">,
    speedOverride: number | null = null
  ): void {
    if (this.state.dead || this.state.bound) {
      return;
    }

    this.state.action = null;
    this.actionElapsed = 0;
    this.movementIntent = requestedMotion;
    this.speedOverride = speedOverride;
    this.waypointQueue = [];
    this.state.targetPosition = clonePoint(targetPosition);
    this.state.motion = this.getMotionForCurrentStance();
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
  }

  setPath(
    targetPositions: WorldPoint[],
    requestedMotion: Exclude<MovingMotion, "crawl">,
    speedOverride: number | null = null
  ): void {
    if (this.state.dead || this.state.bound || targetPositions.length === 0) {
      return;
    }

    this.state.action = null;
    this.actionElapsed = 0;
    this.movementIntent = requestedMotion;
    this.speedOverride = speedOverride;
    this.state.targetPosition = clonePoint(targetPositions[0]);
    this.waypointQueue = targetPositions.slice(1).map(clonePoint);
    this.state.motion = this.getMotionForCurrentStance();
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
  }

  retarget(targetPosition: WorldPoint): void {
    if (this.state.targetPosition) {
      this.state.targetPosition = clonePoint(targetPosition);
      this.waypointQueue = [];
    }
  }

  stop(): void {
    this.state.targetPosition = null;
    this.state.action = null;
    this.state.motion = "idle";
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
    this.actionElapsed = 0;
    this.speedOverride = null;
    this.waypointQueue = [];
  }

  startSpecialAction(action: SpecialAction, targetPosition: WorldPoint): void {
    if (this.state.dead || this.state.bound) {
      return;
    }

    const toTarget = {
      x: targetPosition.x - this.state.position.x,
      y: targetPosition.y - this.state.position.y
    };

    this.state.targetPosition = null;
    this.waypointQueue = [];
    this.state.action = action;
    this.state.motion = "idle";
    this.state.direction = directionFromVector(toTarget, this.state.direction);
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
    this.actionElapsed = 0;
  }

  takePhoto(targetPosition: WorldPoint): boolean {
    if (this.id !== "maya" || this.state.dead || this.state.bound) {
      return false;
    }

    this.startSpecialAction("photo", targetPosition);
    return true;
  }

  hasActiveWork(): boolean {
    return (
      (this.state.dead && this.state.frameIndex < this.animator.getFrameCount() - 1) ||
      (!this.state.dead &&
        !this.state.bound &&
        Boolean(this.state.targetPosition || this.state.action))
    );
  }

  toggleStance(): void {
    if (this.state.dead || this.state.bound) {
      return;
    }

    this.state.stance = this.state.stance === "upright" ? "prone" : "upright";

    if (this.state.targetPosition) {
      this.state.motion = this.getMotionForCurrentStance();
    } else {
      this.state.motion = "idle";
      this.state.frameIndex = 0;
      this.animationElapsed = 0;
    }
  }

  update(deltaTime: number, isWalkable: WalkableCheck): void {
    if (this.state.dead) {
      this.updateDeathAnimation(deltaTime);
      return;
    }

    if (this.state.bound) {
      this.state.motion = "idle";
      this.state.frameIndex = 0;
      this.animationElapsed = 0;
      this.actionElapsed = 0;
      return;
    }

    if (this.state.action) {
      this.updateSpecialAction(deltaTime);
      return;
    }

    if (!this.state.targetPosition) {
      this.state.motion = "idle";
      this.state.frameIndex = 0;
      this.animationElapsed = 0;
      return;
    }

    const toTarget = {
      x: this.state.targetPosition.x - this.state.position.x,
      y: this.state.targetPosition.y - this.state.position.y
    };
    const remainingDistance = distance(this.state.position, this.state.targetPosition);

    if (remainingDistance <= GAME_CONFIG.arrivalThreshold) {
      this.state.position = clonePoint(this.state.targetPosition);
      if (this.advancePathTarget()) {
        return;
      }

      this.stop();
      return;
    }

    this.state.direction = directionFromVector(toTarget, this.state.direction);
    const currentMotion = this.getMotionForCurrentStance();
    this.state.motion = currentMotion;

    const speed = this.speedOverride ?? GAME_CONFIG.movementSpeeds[currentMotion];
    const stepDistance = Math.min(speed * deltaTime, remainingDistance);
    const movement = normalize(toTarget);
    const nextPosition = {
      x: this.state.position.x + movement.x * stepDistance,
      y: this.state.position.y + movement.y * stepDistance
    };

    if (!isWalkable(this, nextPosition)) {
      this.stop();
      return;
    }

    this.state.position = nextPosition;
    this.animationElapsed = this.animator.advance(this.state, deltaTime, this.animationElapsed);

    if (distance(this.state.position, this.state.targetPosition) <= GAME_CONFIG.arrivalThreshold) {
      this.state.position = clonePoint(this.state.targetPosition);
      if (this.advancePathTarget()) {
        return;
      }

      this.stop();
    }
  }

  private advancePathTarget(): boolean {
    const nextTarget = this.waypointQueue.shift();

    if (!nextTarget) {
      return false;
    }

    this.state.targetPosition = clonePoint(nextTarget);
    this.state.motion = this.getMotionForCurrentStance();
    return true;
  }

  containsWorldPoint(point: WorldPoint): boolean {
    if (this.state.dead) {
      return false;
    }

    const size = this.animator.getRenderSize(this.id);
    const left = this.state.position.x - size.width * 0.46;
    const right = this.state.position.x + size.width * 0.46;
    const top = this.state.position.y - size.height * 0.92;
    const bottom = this.state.position.y + 8;

    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  getBodyCollisionPolygon(position: WorldPoint = this.state.position): WorldPoint[] {
    const size = this.animator.getRenderSize(this.id);
    const halfWidth = size.width * GAME_CONFIG.characterBodyCollisionWidthRatio * 0.5;
    const shoulderY = position.y - size.height * GAME_CONFIG.characterBodyCollisionTopRatio;
    const hipY = position.y - size.height * GAME_CONFIG.characterBodyCollisionBottomRatio;
    const footY = position.y - GAME_CONFIG.characterBodyFootInset;

    return [
      { x: position.x - halfWidth * 0.72, y: shoulderY },
      { x: position.x + halfWidth * 0.72, y: shoulderY },
      { x: position.x + halfWidth, y: hipY },
      { x: position.x + halfWidth * 0.78, y: footY },
      { x: position.x - halfWidth * 0.78, y: footY },
      { x: position.x - halfWidth, y: hipY }
    ];
  }

  draw(container: Container): void {
    if (this.state.dead) {
      this.drawDead(container);
      return;
    }

    const source = this.state.action
      ? this.animator.getSpecialSourceRect(
          this.id,
          this.state.action,
          this.state.stance,
          this.state.direction,
          this.state.frameIndex
        )
      : this.animator.getSourceRect(
          this.id,
          this.state.motion === "idle" ? this.animator.getIdleMotion(this.state) : this.state.motion,
          this.state.direction,
          this.state.frameIndex
        );

    if (this.state.selected) {
      container.addChild(
        new Graphics()
          .ellipse(this.state.position.x, this.state.position.y - 4, 28, 10)
          .fill({ color: "#dedaa0", alpha: 0.17 })
          .stroke({ color: "#ece28b", alpha: 0.78, width: 2 })
      );
    }

    const sprite = new Sprite(this.getFrameTexture(source));
    sprite.anchor.set(0.5, 1);
    sprite.position.set(this.state.position.x, this.state.position.y);
    sprite.scale.set(
      source.flipX ? -GAME_CONFIG.renderScale : GAME_CONFIG.renderScale,
      GAME_CONFIG.renderScale
    );
    container.addChild(sprite);

    if (this.state.bound) {
      this.drawBoundOverlay(container);
    }

    if (this.state.selected || this.state.health < GAME_CONFIG.combat.maxHealth) {
      this.drawHealthBar(container);
    }
  }

  private drawDead(container: Container): void {
    const source = this.animator.getDeathSourceRect(
      this.id,
      this.state.direction,
      this.state.frameIndex
    );

    if (!source) {
      this.drawDeathMarker(container);
      return;
    }

    const sprite = new Sprite(this.getFrameTexture(source));
    sprite.anchor.set(0.5, 1);
    sprite.position.set(this.state.position.x, this.state.position.y);
    sprite.scale.set(
      source.flipX ? -GAME_CONFIG.renderScale : GAME_CONFIG.renderScale,
      GAME_CONFIG.renderScale
    );
    container.addChild(sprite);
  }

  drawDebug(container: Container): void {
    const graphics = new Graphics()
      .circle(this.state.position.x, this.state.position.y, 3)
      .fill({ color: "#5accff", alpha: 0.9 })
      .circle(this.state.position.x, this.state.position.y, GAME_CONFIG.characterFootCollisionRadius)
      .stroke({ color: "#5accff", alpha: 0.9, width: 1.5 });
    const bodyPolygon = this.getBodyCollisionPolygon();
    graphics.poly(bodyPolygon, true).stroke({ color: "#ffdc5a", alpha: 0.88, width: 1.5 });

    if (this.state.targetPosition) {
      graphics
        .moveTo(this.state.position.x, this.state.position.y)
        .lineTo(this.state.targetPosition.x, this.state.targetPosition.y)
        .stroke({ color: "#f6da73", alpha: 0.9, width: 1.5 });
    }

    container.addChild(graphics);
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

  private getMotionForCurrentStance(): MovingMotion {
    return this.state.stance === "prone" ? "crawl" : this.movementIntent;
  }

  takeDamage(amount: number): boolean {
    if (this.state.dead) {
      return false;
    }

    this.state.health = Math.max(0, this.state.health - amount);

    if (this.state.health > 0) {
      return false;
    }

    this.die();
    return true;
  }

  isDead(): boolean {
    return this.state.dead;
  }

  isBound(): boolean {
    return this.state.bound;
  }

  bind(position?: WorldPoint): void {
    if (this.state.dead) {
      return;
    }

    this.stop();
    if (position) {
      this.state.position = clonePoint(position);
    }
    this.state.bound = true;
    this.state.stance = "upright";
    this.state.motion = "idle";
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
    this.actionElapsed = 0;
  }

  unbind(): void {
    if (this.state.dead || !this.state.bound) {
      return;
    }

    this.state.bound = false;
    this.stop();
  }

  private die(): void {
    this.stop();
    this.state.health = 0;
    this.state.dead = true;
    this.state.bound = false;
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
  }

  private drawBoundOverlay(container: Container): void {
    const size = this.animator.getRenderSize(this.id);
    const x = this.state.position.x;
    const y = this.state.position.y - size.height * 0.52;

    container.addChild(
      new Graphics()
        .moveTo(x - 20, y - 10)
        .lineTo(x + 20, y + 8)
        .moveTo(x - 18, y + 6)
        .lineTo(x + 18, y - 10)
        .stroke({ color: "#140f08", alpha: 0.8, width: 7, cap: "round" })
        .moveTo(x - 20, y - 10)
        .lineTo(x + 20, y + 8)
        .moveTo(x - 18, y + 6)
        .lineTo(x + 18, y - 10)
        .stroke({ color: "#d8c07a", alpha: 0.95, width: 3, cap: "round" })
    );
  }

  private drawDeathMarker(container: Container): void {
    container.addChild(
      new Graphics()
        .moveTo(this.state.position.x - 20, this.state.position.y - 64)
        .lineTo(this.state.position.x + 20, this.state.position.y - 24)
        .moveTo(this.state.position.x + 20, this.state.position.y - 64)
        .lineTo(this.state.position.x - 20, this.state.position.y - 24)
        .stroke({ color: "#f25f4c", alpha: 0.96, width: 6, cap: "round" })
    );
  }

  private drawHealthBar(container: Container): void {
    const width = 48;
    const height = 6;
    const x = this.state.position.x - width / 2;
    const y = this.state.position.y - this.animator.getRenderSize(this.id).height - 12;
    const fillWidth = width * (this.state.health / GAME_CONFIG.combat.maxHealth);

    container.addChild(
      new Graphics()
        .rect(x, y, width, height)
        .fill({ color: "#151812", alpha: 0.86 })
        .rect(x, y, fillWidth, height)
        .fill(this.state.health > 50 ? "#7dd35f" : "#f0c15d")
        .rect(x, y, width, height)
        .stroke({ color: "#10140d", alpha: 0.9, width: 1 })
    );
  }

  private updateDeathAnimation(deltaTime: number): void {
    const frameDuration = 1 / GAME_CONFIG.combat.deathFps;
    this.animationElapsed += deltaTime;

    while (
      this.animationElapsed >= frameDuration &&
      this.state.frameIndex < this.animator.getFrameCount() - 1
    ) {
      this.state.frameIndex += 1;
      this.animationElapsed -= frameDuration;
    }
  }

  private updateSpecialAction(deltaTime: number): void {
    if (!this.state.action) {
      return;
    }

    const actionConfig = GAME_CONFIG.specialActions[this.state.action];
    const frameDuration = 1 / actionConfig.fps;

    this.actionElapsed += deltaTime;
    this.animationElapsed += deltaTime;

    while (this.animationElapsed >= frameDuration) {
      this.state.frameIndex = Math.min(this.state.frameIndex + 1, this.animator.getFrameCount() - 1);
      this.animationElapsed -= frameDuration;
    }

    if (this.actionElapsed >= actionConfig.duration) {
      this.stop();
    }
  }
}
