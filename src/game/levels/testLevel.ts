import type { LevelDefinition, ObliquePrism } from "./LevelDefinition";

const wallColors = {
  topColor: "#6f7565",
  sideColor: "#4f5749",
  frontColor: "#3d4538",
  strokeColor: "#242a21"
};

function prism(id: string, footprint: ObliquePrism["footprint"], height: number): ObliquePrism {
  return {
    id,
    kind: "oblique-prism",
    footprint,
    height,
    ...wallColors
  };
}

export const testLevel: LevelDefinition = {
  id: "test-yard",
  name: "Тестов двор",
  worldSize: {
    width: 1800,
    height: 1000
  },
  initialPositions: {
    maya: { x: 260, y: 410 },
    alyosha: { x: 360, y: 520 }
  },
  collisionPolygons: [
    {
      id: "north-wall",
      label: "Северна стена",
      points: [
        { x: 510, y: 230 },
        { x: 1070, y: 230 },
        { x: 1070, y: 295 },
        { x: 510, y: 295 }
      ]
    },
    {
      id: "east-block",
      label: "Източен блок",
      points: [
        { x: 1260, y: 380 },
        { x: 1460, y: 405 },
        { x: 1435, y: 555 },
        { x: 1225, y: 530 }
      ]
    },
    {
      id: "central-barricade",
      label: "Централна барикада",
      points: [
        { x: 675, y: 540 },
        { x: 1010, y: 500 },
        { x: 1045, y: 585 },
        { x: 710, y: 625 }
      ]
    },
    {
      id: "south-crates",
      label: "Южни сандъци",
      points: [
        { x: 420, y: 760 },
        { x: 660, y: 760 },
        { x: 660, y: 865 },
        { x: 420, y: 865 }
      ]
    },
    {
      id: "small-pillar",
      label: "Малка колона",
      points: [
        { x: 1115, y: 755 },
        { x: 1205, y: 730 },
        { x: 1265, y: 800 },
        { x: 1175, y: 850 }
      ]
    }
  ],
  decorativeObjects: [
    prism(
      "north-wall",
      [
        { x: 510, y: 230 },
        { x: 1070, y: 230 },
        { x: 1070, y: 295 },
        { x: 510, y: 295 }
      ],
      82
    ),
    prism(
      "east-block",
      [
        { x: 1260, y: 380 },
        { x: 1460, y: 405 },
        { x: 1435, y: 555 },
        { x: 1225, y: 530 }
      ],
      96
    ),
    prism(
      "central-barricade",
      [
        { x: 675, y: 540 },
        { x: 1010, y: 500 },
        { x: 1045, y: 585 },
        { x: 710, y: 625 }
      ],
      68
    ),
    prism(
      "south-crates",
      [
        { x: 420, y: 760 },
        { x: 660, y: 760 },
        { x: 660, y: 865 },
        { x: 420, y: 865 }
      ],
      58
    ),
    prism(
      "small-pillar",
      [
        { x: 1115, y: 755 },
        { x: 1205, y: 730 },
        { x: 1265, y: 800 },
        { x: 1175, y: 850 }
      ],
      72
    )
  ],
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
      ]
    },
    {
      id: "enemy-2",
      name: "Patrol 2",
      route: [
        { x: 1180, y: 450 },
        { x: 540, y: 450 }
      ]
    }
  ]
};
