import { Application, Container, Text } from "pixi.js";
import type { WorldPoint } from "../types";

const LAYER_KEYS = [
  "background",
  "vision",
  "markers",
  "sorted",
  "effects",
  "prompts",
  "clouds",
  "debug"
] as const;

type LayerKey = (typeof LAYER_KEYS)[number];

export class PixiGameRenderer {
  readonly app = new Application();
  readonly worldLayer = new Container();
  readonly screenLayer = new Container();
  readonly layers: Record<LayerKey, Container> = Object.fromEntries(
    LAYER_KEYS.map((key) => [key, new Container()])
  ) as Record<LayerKey, Container>;

  private readonly worldLayers = LAYER_KEYS.map((key) => this.layers[key]);
  private readonly clearableLayers = [...this.worldLayers, this.screenLayer];
  private initialized = false;

  constructor(private canvas: HTMLCanvasElement) {}

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const initialBounds = this.canvas.parentElement?.getBoundingClientRect();
    const initialWidth = Math.max(1, Math.floor(initialBounds?.width ?? this.canvas.clientWidth));
    const initialHeight = Math.max(1, Math.floor(initialBounds?.height ?? this.canvas.clientHeight));

    await this.app.init({
      canvas: this.canvas,
      width: initialWidth,
      height: initialHeight,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      background: "#0c0f0a",
      autoStart: false
    });

    this.worldLayer.addChild(...this.worldLayers);
    this.app.stage.addChild(this.worldLayer, this.screenLayer);
    this.initialized = true;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (!this.initialized) {
      return;
    }

    this.app.renderer.resize(width, height, pixelRatio);
  }

  beginFrame(cameraPosition: WorldPoint): void {
    this.clearLayers();
    this.worldLayer.position.set(-cameraPosition.x, -cameraPosition.y);
    this.screenLayer.position.set(0, 0);
  }

  render(): void {
    if (this.initialized) {
      this.app.render();
    }
  }

  renderMessage(message: string, color: string): void {
    this.clearLayers();
    this.screenLayer.addChild(
      new Text({
        text: message,
        x: 24,
        y: 28,
        style: {
          fill: color,
          fontFamily: "system-ui, sans-serif",
          fontSize: 16
        }
      })
    );
    this.render();
  }

  destroy(): void {
    if (!this.initialized) {
      return;
    }

    this.clearLayers();
    this.app.destroy(false, { children: true });
    this.initialized = false;
  }

  private clearLayers(): void {
    for (const layer of this.clearableLayers) {
      for (const child of layer.removeChildren()) {
        child.destroy({ children: true });
      }
    }
  }
}
