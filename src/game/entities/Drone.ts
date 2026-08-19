import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { GAME_CONFIG } from "../config";
import { clamp, normalize, type Size } from "../geometry";
import type { WorldPoint } from "../types";

interface DroneOptions {
  image: HTMLImageElement;
  position: WorldPoint;
}

const DRONE_SHEET = {
  columns: GAME_CONFIG.drone.sprite.columns,
  rows: GAME_CONFIG.drone.sprite.rows,
  frameWidth: GAME_CONFIG.drone.sprite.sheetWidth / GAME_CONFIG.drone.sprite.columns,
  frameHeight: GAME_CONFIG.drone.sprite.sheetHeight / GAME_CONFIG.drone.sprite.rows,
  flightRow: GAME_CONFIG.drone.sprite.flightRow,
  explosionRow: GAME_CONFIG.drone.sprite.explosionRow
};

type DroneState = "deployed" | "exploding";

export class Drone {
  readonly image: HTMLImageElement;
  position: WorldPoint;

  private readonly baseTexture: Texture;
  private readonly frameTextures = new Map<string, Texture>();
  private state: DroneState = "deployed";
  private frameIndex = 0;
  private animationElapsed = 0;
  private finished = false;

  constructor(options: DroneOptions) {
    this.image = options.image;
    this.position = { ...options.position };
    this.baseTexture = Texture.from(options.image);
  }

  update(deltaTime: number, movement: WorldPoint, worldSize: Size): void {
    if (this.state === "exploding") {
      this.advanceAnimation(deltaTime, GAME_CONFIG.drone.explosionFps, false);
      return;
    }

    if (movement.x !== 0 || movement.y !== 0) {
      const direction = normalize(movement);
      this.position = {
        x: clamp(
          this.position.x + direction.x * GAME_CONFIG.drone.speed * deltaTime,
          GAME_CONFIG.drone.edgePadding,
          worldSize.width - GAME_CONFIG.drone.edgePadding
        ),
        y: clamp(
          this.position.y + direction.y * GAME_CONFIG.drone.speed * deltaTime,
          GAME_CONFIG.drone.edgePadding,
          worldSize.height - GAME_CONFIG.drone.edgePadding
        )
      };
    }

    this.advanceAnimation(deltaTime, GAME_CONFIG.drone.fps, true);
  }

  explode(): void {
    if (this.state === "exploding") {
      return;
    }

    this.state = "exploding";
    this.frameIndex = 0;
    this.animationElapsed = 0;
  }

  isDeployed(): boolean {
    return this.state === "deployed";
  }

  isFinished(): boolean {
    return this.finished;
  }

  draw(container: Container): void {
    const source = this.getSourceRect();

    if (this.state === "deployed") {
      container.addChild(
        new Graphics()
          .ellipse(this.position.x, this.position.y + 26, 20, 7)
          .fill({ color: "#050705", alpha: 0.22 })
      );
    }

    const sprite = new Sprite(this.getFrameTexture(source));
    sprite.anchor.set(0.5);
    sprite.position.set(this.position.x, this.position.y);
    sprite.scale.set(GAME_CONFIG.drone.renderScale);
    container.addChild(sprite);
  }

  private advanceAnimation(deltaTime: number, fps: number, loop: boolean): void {
    const frameDuration = 1 / fps;
    this.animationElapsed += deltaTime;

    while (this.animationElapsed >= frameDuration) {
      this.animationElapsed -= frameDuration;

      if (loop) {
        this.frameIndex = (this.frameIndex + 1) % DRONE_SHEET.columns;
        continue;
      }

      if (this.frameIndex >= DRONE_SHEET.columns - 1) {
        this.finished = true;
        return;
      }

      this.frameIndex += 1;
    }
  }

  private getSourceRect(): { x: number; y: number; width: number; height: number } {
    const row = this.state === "exploding" ? DRONE_SHEET.explosionRow : DRONE_SHEET.flightRow;

    return {
      x: this.frameIndex * DRONE_SHEET.frameWidth,
      y: row * DRONE_SHEET.frameHeight,
      width: DRONE_SHEET.frameWidth,
      height: DRONE_SHEET.frameHeight
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
}
