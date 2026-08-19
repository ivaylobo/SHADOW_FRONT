export interface WorldPoint {
  x: number;
  y: number;
}

export type CharacterId = "maya" | "alyosha" | "alek";

export type EnemyId = `enemy-${number}`;

export type Direction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

export type Stance = "upright" | "prone";

export type MovingMotion = "walk" | "run" | "crawl";

export type Motion = "idle" | MovingMotion;

export type SpecialAction = "shoot" | "photo" | "tie";

export type SpriteRowReference =
  | number
  | {
      row: number;
      frame?: number;
      flipX?: boolean;
    };

export interface CharacterState {
  position: WorldPoint;
  targetPosition: WorldPoint | null;
  health: number;
  dead: boolean;
  bound: boolean;
  selected: boolean;
  stance: Stance;
  motion: Motion;
  action: SpecialAction | null;
  direction: Direction;
  frameIndex: number;
}

export interface MovementSpriteManifest {
  format: string;
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  sheetWidth: number;
  sheetHeight: number;
  framesPerAnimation: number;
  movementRows?: number;
  specialRow?: number;
  deathRows?: Partial<Record<CharacterId, SpriteRowReference>>;
  motions: MovingMotion[];
  directions: Direction[];
  rowFormula: string;
  rowOrder: string[];
  specialRows?: Partial<Record<SpecialAction, number>>;
  specialActions?: Partial<Record<CharacterId, { name: string; row: number; proneRow?: number }>>;
  files: Record<
    CharacterId,
    {
      file: string;
      sha256: string;
      rows?: number;
      sheetWidth?: number;
      sheetHeight?: number;
      specialRows?: Partial<Record<SpecialAction, number | { upright: number; prone: number }>>;
      death?: SpriteRowReference;
    }
  >;
}

export interface ControlHelpItem {
  command: string;
  description: string;
}
