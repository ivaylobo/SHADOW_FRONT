import type { ControlHelpItem, Direction, MovingMotion, SpecialAction } from "./types";

export interface SpriteRowRule {
  rowOffset: number;
  flipX: boolean;
}

const ENEMY_VISION_RANGE = 320;
const KALASHNIKOV_RANGE_ADVANTAGE = 100;

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
  characterFootCollisionRadius: 8,
  enemyCollisionRadius: 15,
  cameraFollowSharpness: 7,
  cameraPanSpeed: 520,
  pathfinding: {
    cellSize: 72,
    sampleSpacing: 18,
    maxNodes: 1800
  },
  movementSpeeds: {
    walk: 90,
    run: 155,
    crawl: 45
  } satisfies Record<MovingMotion, number>,
  combat: {
    maxHealth: 100,
    kalashnikovDamage: 50,
    enemyShotInterval: 0.85,
    deathFps: 8
  },
  animationFps: {
    walk: 10,
    run: 14,
    crawl: 8
  } satisfies Record<MovingMotion, number>,
  enemy: {
    sprite: {
      file: "enemy_movement_8dir_6frames_v6_bound.png",
      columns: 6,
      rows: 27,
      sheetWidth: 368,
      sheetHeight: 2212,
      shootRow: 24,
      boundRow: 25,
      deadRow: 26,
      deadFrame: null as number | null
    },
    renderScale: 1.46,
    walkSpeed: 76,
    runSpeed: 130,
    walkFps: 10,
    runFps: 14,
    shootFps: 12,
    visionRange: ENEMY_VISION_RANGE,
    closeVisionRatio: 0.5,
    baseVisionAngleDegrees: 20,
    sweepAngleDegrees: 60,
    sweepPeriodSeconds: 2.4,
    eyeOffsetY: -78,
    hitPointOffsetY: -46,
    hitRadius: 42,
    rescueRange: 34,
    alarmDuration: 2.8
  },
  drone: {
    sprite: {
      file: "fpv_drone_6frames.png",
      columns: 6,
      rows: 2,
      sheetWidth: 768,
      sheetHeight: 256,
      flightRow: 0,
      explosionRow: 1
    },
    renderScale: 0.58,
    speed: 245,
    fps: 12,
    explosionFps: 14,
    enemyShotDelay: 0.5,
    recallRange: 140,
    edgePadding: 34,
    spawnOffset: {
      x: 46,
      y: -62
    }
  },
  cloud: {
    sprite: {
      file: "/assets/cloud.png"
    },
    alpha: 0.7,
    tileWidth: 420,
    tileSpacingX: 330,
    tileSpacingY: 190,
    jitterX: 72,
    jitterY: 38,
    scaleJitter: 0.16,
    collisionWidthRatio: 0.78,
    collisionHeightRatio: 0.58,
    backgroundCutoff: 10,
    revealSampleSpacing: 120
  },
  tie: {
    walkSpeed: 86,
    catchRange: 30
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
      range: ENEMY_VISION_RANGE + KALASHNIKOV_RANGE_ADVANTAGE
    },
    photo: {
      fps: 10,
      duration: 0.7,
      range: 96
    },
    tie: {
      fps: 10,
      duration: 0.8,
      range: 30
    }
  } satisfies Record<
    SpecialAction,
    { fps: number; duration: number; range: number }
  >
} as const;

export const CONTROL_HELP: ControlHelpItem[] = [
  {
    command: "Hover + click enemy",
    description: "Follow the enemy and tie them if close enough"
  },
  {
    command: "Left-click hero",
    description: "Select the hero"
  },
  {
    command: "Left-click prison gate",
    description: "Send the selected hero to open it"
  },
  {
    command: "Left-click terrain",
    description: "Move the selected hero to that point"
  },
  {
    command: "X",
    description: "Maya photographs the artifact, Alyosha fires, Alek deploys or recalls his drone"
  },
  {
    command: "Arrow keys",
    description: "Pan the camera, or move Alek's deployed drone"
  },
  {
    command: "Shift + left-click",
    description: "Run to the point"
  },
  {
    command: "Double left-click",
    description: "Run to the point"
  },
  {
    command: "C",
    description: "Toggle prone/upright stance"
  },
  {
    command: "E",
    description: "Open a nearby gate"
  },
  {
    command: "1",
    description: "Select Maya after she is freed"
  },
  {
    command: "2",
    description: "Select Alyosha"
  },
  {
    command: "3",
    description: "Select Alek"
  },
  {
    command: "Escape",
    description: "Stop the current movement"
  },
  {
    command: "D",
    description: "Toggle debug information"
  }
];
