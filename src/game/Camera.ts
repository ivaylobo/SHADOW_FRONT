import { GAME_CONFIG } from "./config";
import { clamp, type Size } from "./geometry";
import type { WorldPoint } from "./types";

export class Camera {
  position: WorldPoint = { x: 0, y: 0 };

  private viewport: Size = { width: 1, height: 1 };

  constructor(private worldSize: Size) {}

  setViewport(width: number, height: number): void {
    this.viewport = {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
    this.position = this.clampPosition(this.position);
  }

  update(target: WorldPoint, deltaTime: number): void {
    const desired = this.clampPosition({
      x: target.x - this.viewport.width / 2,
      y: target.y - this.viewport.height / 2
    });
    const t = 1 - Math.exp(-GAME_CONFIG.cameraFollowSharpness * deltaTime);

    this.position = this.clampPosition({
      x: this.position.x + (desired.x - this.position.x) * t,
      y: this.position.y + (desired.y - this.position.y) * t
    });
  }

  worldToScreen(worldPoint: WorldPoint): WorldPoint {
    return {
      x: worldPoint.x - this.position.x,
      y: worldPoint.y - this.position.y
    };
  }

  screenToWorld(screenPoint: WorldPoint): WorldPoint {
    return {
      x: screenPoint.x + this.position.x,
      y: screenPoint.y + this.position.y
    };
  }

  getVisibleBounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.viewport.width,
      height: this.viewport.height
    };
  }

  private clampPosition(position: WorldPoint): WorldPoint {
    const maxX = Math.max(0, this.worldSize.width - this.viewport.width);
    const maxY = Math.max(0, this.worldSize.height - this.viewport.height);

    return {
      x: clamp(position.x, 0, maxX),
      y: clamp(position.y, 0, maxY)
    };
  }
}
