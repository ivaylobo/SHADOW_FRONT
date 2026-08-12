import type { ControlHelpItem, Direction, MovingMotion, SpecialAction } from "./types";

export interface SpriteRowRule {
  rowOffset: number;
  flipX: boolean;
}

export const ASSET_BASE_PATH = "/assets/characters/";
export const SPRITE_MANIFEST_PATH = `${ASSET_BASE_PATH}movement-sprites-manifest-6frames.json`;

export const GAME_CONFIG = {
  uiPanelWidth: 286,
  renderScale: 1.46,
  arrivalThreshold: 5,
  collisionRadius: 14,
  characterBodyCollisionWidthRatio: 0.34,
  characterBodyCollisionTopRatio: 0.76,
  characterBodyCollisionBottomRatio: 0.32,
  characterBodyFootInset: 7,
  enemyCollisionRadius: 15,
  cameraFollowSharpness: 7,
  movementSpeeds: {
    walk: 90,
    run: 155,
    crawl: 45
  } satisfies Record<MovingMotion, number>,
  animationFps: {
    walk: 10,
    run: 14,
    crawl: 8
  } satisfies Record<MovingMotion, number>,
  enemy: {
    renderScale: 1.46,
    walkSpeed: 76,
    runSpeed: 130,
    walkFps: 10,
    runFps: 14,
    shootFps: 12,
    visionRange: 320,
    closeVisionRatio: 0.5,
    baseVisionAngleDegrees: 20,
    sweepAngleDegrees: 60,
    sweepPeriodSeconds: 2.4,
    eyeOffsetY: -78,
    hitPointOffsetY: -46,
    hitRadius: 28,
    alarmDuration: 2.8
  },
  markerDuration: 0.75,
  invalidMarkerDuration: 0.55,
  directions: [
    "left",
    "right",
    "up",
    "down",
    "up-left",
    "up-right",
    "down-left",
    "down-right"
  ] satisfies Direction[],
  spriteRowRules: {
    left: { rowOffset: 0, flipX: true },
    right: { rowOffset: 0, flipX: false },
    up: { rowOffset: 2, flipX: false },
    down: { rowOffset: 3, flipX: false },
    "up-left": { rowOffset: 4, flipX: true },
    "up-right": { rowOffset: 4, flipX: false },
    "down-left": { rowOffset: 6, flipX: true },
    "down-right": { rowOffset: 6, flipX: false }
  } satisfies Record<Direction, SpriteRowRule>,
  spriteMotionRowOverrides: {
    walk: {
      "down-left": { rowOffset: 7, flipX: true },
      "down-right": { rowOffset: 7, flipX: false }
    },
    run: {
      "up-left": { rowOffset: 4, flipX: false },
      "up-right": { rowOffset: 4, flipX: true },
      "down-left": { rowOffset: 6, flipX: false },
      "down-right": { rowOffset: 6, flipX: true }
    },
    crawl: {
      left: { rowOffset: 0, flipX: false },
      right: { rowOffset: 1, flipX: false },
      "up-left": { rowOffset: 4, flipX: false },
      "up-right": { rowOffset: 4, flipX: true }
    }
  } satisfies Record<MovingMotion, Partial<Record<Direction, SpriteRowRule>>>,
  specialActions: {
    shoot: {
      fps: 12,
      duration: 0.55,
      range: 320
    },
    photo: {
      fps: 10,
      duration: 0.7,
      range: 96
    }
  } satisfies Record<
    SpecialAction,
    { fps: number; duration: number; range: number }
  >
} as const;

export const CONTROL_HELP: ControlHelpItem[] = [
  {
    command: "Ляв клик върху герой",
    description: "избира героя"
  },
  {
    command: "Ляв клик върху терена",
    description: "героят ходи до точката"
  },
  {
    command: "X",
    description: "Мая снима artifact отблизо; Альоша стреля към курсора до ограничен range"
  },
  {
    command: "Shift + ляв клик",
    description: "героят тича до точката"
  },
  {
    command: "Двоен ляв клик",
    description: "героят тича до точката"
  },
  {
    command: "C",
    description: "лягане или изправяне"
  },
  {
    command: "1",
    description: "избор на Мая"
  },
  {
    command: "2",
    description: "избор на Альоша"
  },
  {
    command: "Escape",
    description: "прекратяване на текущото движение"
  },
  {
    command: "D",
    description: "показване или скриване на debug информация"
  }
];
