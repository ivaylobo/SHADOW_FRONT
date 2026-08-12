import type { ControlHelpItem, Direction, MovingMotion, SpecialAction } from "./types";

export interface SpriteRowRule {
  rowOffset: number;
  flipX: boolean;
}

export const ASSET_BASE_PATH = "/assets/characters/";
export const SPRITE_MANIFEST_PATH = `${ASSET_BASE_PATH}movement-sprites-manifest-6frames.json`;

export const GAME_CONFIG = {
  uiPanelWidth: 286,
  renderScale: 0.46,
  arrivalThreshold: 5,
  collisionRadius: 14,
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
      "up-left": { rowOffset: 4, flipX: false },
      "up-right": { rowOffset: 4, flipX: true }
    }
  } satisfies Record<MovingMotion, Partial<Record<Direction, SpriteRowRule>>>,
  specialActions: {
    shoot: {
      fps: 12,
      duration: 0.55,
      range: 420
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
