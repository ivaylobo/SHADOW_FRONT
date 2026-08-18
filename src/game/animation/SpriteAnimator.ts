import { GAME_CONFIG, type SpriteRowRule } from "../config";
import type {
  CharacterId,
  CharacterState,
  Direction,
  MovingMotion,
  MovementSpriteManifest,
  SpecialAction,
  SpriteRowReference,
  Stance
} from "../types";

export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
}

export class SpriteAnimator {
  constructor(private manifest: MovementSpriteManifest) {}

  advance(state: CharacterState, deltaTime: number, elapsed: number): number {
    if (state.motion === "idle") {
      state.frameIndex = 0;
      return 0;
    }

    const fps = GAME_CONFIG.animationFps[state.motion];
    const frameDuration = 1 / fps;
    let nextElapsed = elapsed + deltaTime;

    while (nextElapsed >= frameDuration) {
      state.frameIndex = (state.frameIndex + 1) % this.manifest.framesPerAnimation;
      nextElapsed -= frameDuration;
    }

    return nextElapsed;
  }

  getSourceRect(
    motion: MovingMotion,
    direction: CharacterState["direction"],
    frameIndex: number
  ): SourceRect {
    const motionOverrides = GAME_CONFIG.spriteMotionRowOverrides[motion] as Partial<
      Record<CharacterState["direction"], SpriteRowRule>
    >;
    const rowRule =
      motionOverrides[direction] ?? GAME_CONFIG.spriteRowRules[direction];
    const motionIndex = this.manifest.motions.indexOf(motion);

    if (motionIndex < 0) {
      throw new Error(`Invalid sprite animation motion: ${motion}`);
    }

    const row = motionIndex * this.manifest.directions.length + rowRule.rowOffset;

    return {
      x: frameIndex * this.manifest.frameWidth,
      y: row * this.manifest.frameHeight,
      width: this.manifest.frameWidth,
      height: this.manifest.frameHeight,
      flipX: rowRule.flipX
    };
  }

  getSpecialSourceRect(
    characterId: CharacterId,
    action: SpecialAction,
    stance: Stance,
    direction: Direction,
    frameIndex: number
  ): SourceRect {
    const fileInfo = this.manifest.files[characterId];
    const rowCount = fileInfo.rows ?? this.manifest.rows;
    const row = this.resolveSpecialRow(characterId, action, stance, rowCount);

    if (row < 0 || row >= rowCount) {
      throw new Error(`Invalid sprite special action row: ${action} -> ${row}`);
    }

    return {
      x: frameIndex * this.manifest.frameWidth,
      y: row * this.manifest.frameHeight,
      width: this.manifest.frameWidth,
      height: this.manifest.frameHeight,
      flipX: this.shouldFlipSpecialAction(direction)
    };
  }

  getDeathSourceRect(
    characterId: CharacterId,
    direction: Direction,
    frameIndex: number
  ): SourceRect | null {
    const fileInfo = this.manifest.files[characterId];
    const rowCount = fileInfo.rows ?? this.manifest.rows;
    const death = this.normalizeRowReference(
      fileInfo.death ?? this.manifest.deathRows?.[characterId]
    ) ?? { row: rowCount - 1 };

    if (death.row < 0 || death.row >= rowCount) {
      return null;
    }

    const resolvedFrameIndex = Math.min(
      Math.max(0, death.frame ?? frameIndex),
      this.manifest.framesPerAnimation - 1
    );

    return {
      x: resolvedFrameIndex * this.manifest.frameWidth,
      y: death.row * this.manifest.frameHeight,
      width: this.manifest.frameWidth,
      height: this.manifest.frameHeight,
      flipX: death.flipX ?? this.shouldFlipSpecialAction(direction)
    };
  }

  getRenderSize(): { width: number; height: number } {
    return {
      width: this.manifest.frameWidth * GAME_CONFIG.renderScale,
      height: this.manifest.frameHeight * GAME_CONFIG.renderScale
    };
  }

  getFrameCount(): number {
    return this.manifest.framesPerAnimation;
  }

  getIdleMotion(state: CharacterState): MovingMotion {
    return state.stance === "prone" ? "crawl" : "walk";
  }

  private shouldFlipSpecialAction(direction: Direction): boolean {
    return direction === "left" || direction === "up-left" || direction === "down-left";
  }

  private normalizeRowReference(
    reference: SpriteRowReference | undefined
  ): { row: number; frame?: number; flipX?: boolean } | null {
    if (reference === undefined) {
      return null;
    }

    return typeof reference === "number" ? { row: reference } : reference;
  }

  private resolveSpecialRow(
    characterId: CharacterId,
    action: SpecialAction,
    stance: Stance,
    rowCount: number
  ): number {
    const fileInfo = this.manifest.files[characterId];
    const fileActionRow = fileInfo.specialRows?.[action];

    if (typeof fileActionRow === "number") {
      return fileActionRow;
    }

    if (fileActionRow) {
      return stance === "prone" ? fileActionRow.prone : fileActionRow.upright;
    }

    const manifestActionRow = this.manifest.specialRows?.[action];
    if (typeof manifestActionRow === "number") {
      return manifestActionRow;
    }

    const characterAction = this.manifest.specialActions?.[characterId];
    if (characterAction) {
      return stance === "prone"
        ? characterAction.proneRow ?? characterAction.row
        : characterAction.row;
    }

    return this.manifest.specialRow ?? rowCount - 1;
  }
}
