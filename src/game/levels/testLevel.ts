import type { LevelDefinition } from "./LevelDefinition";

export const testLevel: LevelDefinition = {
  id: "test-yard",
  name: "Test Yard",
  worldSize: {
    width: 1800,
    height: 1000
  },
  initialPositions: {
    maya: { x: 260, y: 410 },
    alyosha: { x: 360, y: 520 }
  },
  collisionPolygons: [],
  decorativeObjects: [],
  walkableZones: [],
  coverZones: [],
  interactionZones: [],
  enemySpawnPoints: [],
  enemyPatrols: [
    {
      id: "enemy-1",
      name: "Patrol 1",
      route: [
        { x: 540, y: 360 },
        { x: 1180, y: 360 }
      ],
      alarmRoute: [
        { x: 430, y: 270 },
        { x: 1410, y: 285 },
        { x: 1520, y: 640 },
        { x: 940, y: 835 },
        { x: 350, y: 670 }
      ]
    },
    {
      id: "enemy-2",
      name: "Patrol 2",
      route: [
        { x: 1180, y: 450 },
        { x: 540, y: 450 }
      ],
      alarmRoute: [
        { x: 1380, y: 570 },
        { x: 860, y: 820 },
        { x: 320, y: 620 },
        { x: 460, y: 260 },
        { x: 1360, y: 305 }
      ]
    }
  ]
};
