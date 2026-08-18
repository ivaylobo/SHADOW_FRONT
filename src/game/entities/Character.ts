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
  private animationElapsed = 0;
  private actionElapsed = 0;
  private movementIntent: Exclude<MovingMotion, "crawl"> = "walk";
  private speedOverride: number | null = null;

  constructor(options: CharacterOptions) {
    this.id = options.id;
    this.name = options.name;
    this.image = options.image;
    this.animator = options.animator;
    this.state = {
      position: clonePoint(options.initialPosition),
      targetPosition: null,
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
    this.state.action = null;
    this.actionElapsed = 0;
    this.movementIntent = requestedMotion;
    this.speedOverride = speedOverride;
    this.state.targetPosition = clonePoint(targetPosition);
    this.state.motion = this.getMotionForCurrentStance();
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
  }

  retarget(targetPosition: WorldPoint): void {
    if (this.state.targetPosition) {
      this.state.targetPosition = clonePoint(targetPosition);
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
  }

  startSpecialAction(action: SpecialAction, targetPosition: WorldPoint): void {
    const toTarget = {
      x: targetPosition.x - this.state.position.x,
      y: targetPosition.y - this.state.position.y
    };

    this.state.targetPosition = null;
    this.state.action = action;
    this.state.motion = "idle";
    this.state.direction = directionFromVector(toTarget, this.state.direction);
    this.state.frameIndex = 0;
    this.animationElapsed = 0;
    this.actionElapsed = 0;
  }

  hasActiveWork(): boolean {
    return Boolean(this.state.targetPosition || this.state.action);
  }

  toggleStance(): void {
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
      this.stop();
    }
  }

  containsWorldPoint(point: WorldPoint): boolean {
    const size = this.animator.getRenderSize();
    const left = this.state.position.x - size.width * 0.46;
    const right = this.state.position.x + size.width * 0.46;
    const top = this.state.position.y - size.height * 0.92;
    const bottom = this.state.position.y + 8;

    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  getBodyCollisionPolygon(position: WorldPoint = this.state.position): WorldPoint[] {
    const size = this.animator.getRenderSize();
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

  draw(ctx: CanvasRenderingContext2D): void {
    const source = this.state.action
      ? this.animator.getSpecialSourceRect(
          this.id,
          this.state.action,
          this.state.stance,
          this.state.direction,
          this.state.frameIndex
        )
      : this.animator.getSourceRect(
          this.state.motion === "idle" ? this.animator.getIdleMotion(this.state) : this.state.motion,
          this.state.direction,
          this.state.frameIndex
        );
    const size = this.animator.getRenderSize();
    const drawX = this.state.position.x - size.width / 2;
    const drawY = this.state.position.y - size.height;

    if (this.state.selected) {
      ctx.save();
      ctx.fillStyle = "rgba(222, 218, 160, 0.17)";
      ctx.strokeStyle = "rgba(236, 226, 139, 0.78)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.state.position.x, this.state.position.y - 4, 28, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (source.flipX) {
      ctx.save();
      ctx.translate(this.state.position.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.image,
        source.x,
        source.y,
        source.width,
        source.height,
        -size.width / 2,
        drawY,
        size.width,
        size.height
      );
      ctx.restore();
      return;
    }

    ctx.drawImage(
      this.image,
      source.x,
      source.y,
      source.width,
      source.height,
      drawX,
      drawY,
      size.width,
      size.height
    );
  }

  drawDebug(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = "rgba(90, 204, 255, 0.9)";
    ctx.fillStyle = "rgba(90, 204, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.state.position.x, this.state.position.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      this.state.position.x,
      this.state.position.y,
      GAME_CONFIG.collisionRadius,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 220, 90, 0.88)";
    ctx.beginPath();
    const bodyPolygon = this.getBodyCollisionPolygon();
    ctx.moveTo(bodyPolygon[0].x, bodyPolygon[0].y);
    for (let index = 1; index < bodyPolygon.length; index += 1) {
      ctx.lineTo(bodyPolygon[index].x, bodyPolygon[index].y);
    }
    ctx.closePath();
    ctx.stroke();

    if (this.state.targetPosition) {
      ctx.strokeStyle = "rgba(246, 218, 115, 0.9)";
      ctx.beginPath();
      ctx.moveTo(this.state.position.x, this.state.position.y);
      ctx.lineTo(this.state.targetPosition.x, this.state.targetPosition.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private getMotionForCurrentStance(): MovingMotion {
    return this.state.stance === "prone" ? "crawl" : this.movementIntent;
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
