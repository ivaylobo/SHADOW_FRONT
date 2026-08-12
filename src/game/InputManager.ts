import type { Camera } from "./Camera";
import type { WorldPoint } from "./types";

export interface CanvasCommand {
  worldPosition: WorldPoint;
  shiftKey: boolean;
  isDoubleClick: boolean;
}

export interface InputCallbacks {
  onCanvasCommand(command: CanvasCommand): void;
  onCursorMove(worldPosition: WorldPoint): void;
  onKeyDown(key: string, code: string): void;
}

export class InputManager {
  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private callbacks: InputCallbacks
  ) {
    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  destroy(): void {
    this.canvas.removeEventListener("click", this.handleClick);
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleClick = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    this.callbacks.onCanvasCommand({
      worldPosition: this.eventToWorld(event),
      shiftKey: event.shiftKey,
      isDoubleClick: event.detail >= 2
    });
  };

  private handleMouseMove = (event: MouseEvent): void => {
    this.callbacks.onCursorMove(this.eventToWorld(event));
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    this.callbacks.onKeyDown(event.key, event.code);
  };

  private eventToWorld(event: MouseEvent): WorldPoint {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    const internalX = cssX * (this.canvas.width / rect.width);
    const internalY = cssY * (this.canvas.height / rect.height);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const screenPosition = {
      x: internalX / devicePixelRatio,
      y: internalY / devicePixelRatio
    };

    return this.camera.screenToWorld(screenPosition);
  }
}
