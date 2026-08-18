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
  enemySpawnPoints: WorldPoint[];
  enemyPatrols: Array<{
    id: EnemyId;
    name: string;
    route: WorldPoint[];
    alarmRoute?: WorldPoint[];
  }>;
}
