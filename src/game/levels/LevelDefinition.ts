import type { CharacterId, EnemyId, WorldPoint } from "../types";

export interface CollisionPolygon {
  id: string;
  label: string;
  points: WorldPoint[];
}

export interface ObliquePrism {
  id: string;
  kind: "oblique-prism";
  footprint: WorldPoint[];
  height: number;
  topColor: string;
  sideColor: string;
  frontColor: string;
  strokeColor: string;
}

export interface CloudZone {
  id: string;
  points: WorldPoint[];
}

export type LevelObjectKind = "building" | "vehicle" | "gate";

export interface LevelObjectSpriteFrame {
  columns: number;
  rows: number;
  column: number;
  row: number;
}

export interface LevelObjectCollisionShape {
  id: string;
  points: WorldPoint[];
  disabledWhenOpen?: boolean;
}

export interface LevelObjectEntryZone {
  id: string;
  points: WorldPoint[];
  requiresKeyId?: string;
}

export interface LevelObjectInteraction {
  type: "open-door";
  point: WorldPoint;
  range: number;
  promptOffset: WorldPoint;
  requiresKeyId?: string;
  releaseCaptiveIds?: CharacterId[];
  fps: number;
  oneShot?: boolean;
}

export interface LevelObjectDefinition {
  id: string;
  label: string;
  kind: LevelObjectKind;
  imagePath: string;
  position?: WorldPoint;
  randomPositions?: WorldPoint[];
  scale: number;
  sortY?: number;
  anchor?: WorldPoint;
  frame?: LevelObjectSpriteFrame;
  collisionShapes: LevelObjectCollisionShape[];
  entryZones?: LevelObjectEntryZone[];
  interaction?: LevelObjectInteraction;
}

export interface CaptiveCharacter {
  characterId: CharacterId;
  rescuerIds?: CharacterId[];
  position: WorldPoint;
  rescueRange: number;
}

export interface LevelDefinition {
  id: string;
  name: string;
  worldSize: {
    width: number;
    height: number;
  };
  mapImagePath?: string;
  initialPositions: Record<CharacterId, WorldPoint>;
  collisionPolygons: CollisionPolygon[];
  decorativeObjects: ObliquePrism[];
  walkableZones: WorldPoint[][];
  coverZones: WorldPoint[][];
  interactionZones: WorldPoint[][];
  objects: LevelObjectDefinition[];
  cloudZones: CloudZone[];
  captives?: CaptiveCharacter[];
  enemySpawnPoints: WorldPoint[];
  enemyPatrols: Array<{
    id: EnemyId;
    name: string;
    route: WorldPoint[];
    alarmRoute?: WorldPoint[];
  }>;
}
