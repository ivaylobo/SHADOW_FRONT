export type FrameCallback = (deltaTime: number) => void;

export class GameLoop {
  private frameId = 0;
  private lastTime = 0;
  private running = false;

  start(onFrame: FrameCallback): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTime = performance.now();

    const tick = (time: number): void => {
      if (!this.running) {
        return;
      }

      const deltaTime = Math.min((time - this.lastTime) / 1000, 0.05);
      this.lastTime = time;
      onFrame(deltaTime);
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    cancelAnimationFrame(this.frameId);
  }
}
