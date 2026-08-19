import type { LevelDefinition } from "./LevelDefinition";

export const testLevel: LevelDefinition = {
  id: "level-one",
  name: "Level One",
  description: {
    title: "Освобождаване на Мая",
    paragraphs: [
      "Разкрийте картата с Алек. Изберете Алек с клавиш 3, натиснете X, за да пуснете дрона, и движете дрона със стрелките. Докато Алек е избран и дронът е активен, камерата следва дрона и всяка обходена скрита зона се разкрива. Ако дронът не е активен или Алек не е избран, стрелките само местят камерата.",
      "След като скритите зони са разкрити, изпратете Альоша или Алек до вратата на затвора. Отворете я с E, когато героят е достатъчно близо, или с ляв клик върху самата врата."
    ],
    completion: "Нивото се счита за изпълнено, когато всички зони за разкриване с дрона са изчистени и Мая е освободена чрез отваряне на вратата."
  },
  worldSize: {
    width: 2508,
    height: 2508
  },
  mapImagePath: "/assets/Maps/map-1.png",
  initialPositions: {
    maya: { x: 2165, y: 360 },
    alyosha: { x: 155, y: 2355 },
    alek: { x: 220, y: 2405 }
  },
  collisionPolygons: [],
  decorativeObjects: [],
  walkableZones: [],
  coverZones: [],
  interactionZones: [],
  objects: [
    {
      id: "warehouse-north-yard",
      label: "Warehouse",
      kind: "building",
      imagePath: "/assets/objects/warehouse.png",
      position: { x: 1350, y: 1125 },
      scale: 0.76,
      collisionShapes: [
        {
          id: "warehouse-footprint",
          points: [
            { x: -225, y: -105 },
            { x: -25, y: -220 },
            { x: 225, y: -95 },
            { x: 35, y: 45 },
            { x: -190, y: -35 }
          ]
        }
      ]
    },
    {
      id: "watchtower-prison-road",
      label: "Watchtower",
      kind: "building",
      imagePath: "/assets/objects/watchtower.png",
      position: { x: 2290, y: 835 },
      scale: 0.55,
      collisionShapes: [
        {
          id: "watchtower-posts",
          points: [
            { x: -55, y: -88 },
            { x: 48, y: -88 },
            { x: 64, y: -18 },
            { x: 38, y: 24 },
            { x: -42, y: 24 },
            { x: -64, y: -18 }
          ]
        }
      ]
    },
    {
      id: "prison-compound",
      label: "Prison Compound",
      kind: "gate",
      imagePath: "/assets/objects/prison_gate_opening_6frames.png",
      position: { x: 2160, y: 590 },
      scale: 0.82,
      sortY: 315,
      frame: {
        columns: 6,
        rows: 1,
        column: 0,
        row: 0
      },
      collisionShapes: [
        {
          id: "prison-back-wall",
          points: [
            { x: -220, y: -280 },
            { x: 35, y: -420 },
            { x: 260, y: -295 },
            { x: 238, y: -258 },
            { x: 35, y: -378 },
            { x: -195, y: -248 }
          ]
        },
        {
          id: "prison-left-wall",
          points: [
            { x: -260, y: -245 },
            { x: -220, y: -280 },
            { x: -198, y: -142 },
            { x: -240, y: -112 }
          ]
        },
        {
          id: "prison-right-wall",
          points: [
            { x: 238, y: -258 },
            { x: 262, y: -290 },
            { x: 126, y: -30 },
            { x: 92, y: -50 }
          ]
        },
        {
          id: "prison-front-left-wall",
          points: [
            { x: -240, y: -112 },
            { x: -198, y: -142 },
            { x: -122, y: -102 },
            { x: -152, y: -70 }
          ]
        },
        {
          id: "prison-front-right-wall",
          points: [
            { x: -34, y: -72 },
            { x: 92, y: -50 },
            { x: 126, y: -30 },
            { x: -18, y: -40 }
          ]
        },
        {
          id: "prison-gate-closed",
          disabledWhenOpen: true,
          points: [
            { x: -152, y: -70 },
            { x: -122, y: -102 },
            { x: -34, y: -72 },
            { x: -18, y: -40 },
            { x: -76, y: -27 }
          ]
        }
      ],
      entryZones: [
        {
          id: "front-gate-entry",
          points: [
            { x: -150, y: -72 },
            { x: -118, y: -106 },
            { x: -30, y: -74 },
            { x: -18, y: -36 },
            { x: -84, y: -16 }
          ]
        }
      ],
      interaction: {
        type: "open-door",
        point: { x: -95, y: 75 },
        range: 125,
        promptOffset: { x: 13, y: -205 },
        releaseCaptiveIds: ["maya"],
        fps: 8,
        oneShot: true
      }
    },
    {
      id: "military-truck-north",
      label: "Military Truck",
      kind: "vehicle",
      imagePath: "/assets/objects/military_truck_8dir_6frames.png",
      randomPositions: [
        { x: 720, y: 570 },
        { x: 1020, y: 1520 },
        { x: 575, y: 1765 }
      ],
      scale: 0.58,
      frame: {
        columns: 6,
        rows: 8,
        column: 0,
        row: 5
      },
      collisionShapes: [
        {
          id: "truck-body",
          points: [
            { x: -105, y: -68 },
            { x: 84, y: -68 },
            { x: 118, y: -30 },
            { x: 104, y: 12 },
            { x: -82, y: 22 },
            { x: -122, y: -20 }
          ]
        }
      ]
    },
    {
      id: "military-truck-supply",
      label: "Military Truck",
      kind: "vehicle",
      imagePath: "/assets/objects/military_truck_8dir_6frames.png",
      randomPositions: [
        { x: 1685, y: 640 },
        { x: 1880, y: 1535 },
        { x: 1160, y: 2030 }
      ],
      scale: 0.58,
      frame: {
        columns: 6,
        rows: 8,
        column: 0,
        row: 6
      },
      collisionShapes: [
        {
          id: "truck-body",
          points: [
            { x: -110, y: -74 },
            { x: 88, y: -70 },
            { x: 120, y: -28 },
            { x: 98, y: 18 },
            { x: -88, y: 22 },
            { x: -124, y: -26 }
          ]
        }
      ]
    },
    {
      id: "tractor-field",
      label: "Tractor",
      kind: "vehicle",
      imagePath: "/assets/objects/tractor_8dir_6frames.png",
      randomPositions: [
        { x: 1585, y: 1840 },
        { x: 1960, y: 2075 },
        { x: 1080, y: 760 }
      ],
      scale: 0.56,
      frame: {
        columns: 6,
        rows: 8,
        column: 0,
        row: 5
      },
      collisionShapes: [
        {
          id: "tractor-body",
          points: [
            { x: -72, y: -60 },
            { x: 62, y: -62 },
            { x: 92, y: -24 },
            { x: 72, y: 18 },
            { x: -72, y: 20 },
            { x: -94, y: -22 }
          ]
        }
      ]
    }
  ],
  cloudZones: [
    {
      id: "central-road-fog",
      points: [
        { x: 470, y: 760 },
        { x: 1355, y: 700 },
        { x: 1510, y: 1325 },
        { x: 870, y: 1585 },
        { x: 420, y: 1320 }
      ]
    },
    {
      id: "prison-approach-fog",
      points: [
        { x: 1560, y: 705 },
        { x: 2075, y: 670 },
        { x: 2390, y: 930 },
        { x: 2205, y: 1265 },
        { x: 1640, y: 1135 }
      ]
    },
    {
      id: "south-east-field-fog",
      points: [
        { x: 1320, y: 1480 },
        { x: 2460, y: 1435 },
        { x: 2490, y: 2360 },
        { x: 1590, y: 2450 },
        { x: 1215, y: 2015 }
      ]
    }
  ],
  captives: [
    {
      characterId: "maya",
      rescuerIds: ["alyosha", "alek"],
      position: { x: 2165, y: 360 },
      rescueRange: 42
    }
  ],
  enemySpawnPoints: [
    { x: 880, y: 875 },
    { x: 1900, y: 735 },
    { x: 1600, y: 500 },
    { x: 1660, y: 1660 },
    { x: 520, y: 1220 }
  ],
  enemyPatrols: [
    {
      id: "enemy-1",
      name: "Central Patrol",
      route: [
        { x: 880, y: 875 },
        { x: 1155, y: 715 },
        { x: 1410, y: 860 },
        { x: 1240, y: 1210 },
        { x: 920, y: 1325 }
      ],
      alarmRoute: [
        { x: 760, y: 720 },
        { x: 1260, y: 625 },
        { x: 1550, y: 1040 },
        { x: 1135, y: 1485 },
        { x: 705, y: 1240 }
      ]
    },
    {
      id: "enemy-3",
      name: "Prison Road Patrol",
      route: [
        { x: 1900, y: 735 },
        { x: 2145, y: 780 },
        { x: 2375, y: 670 },
        { x: 2325, y: 935 },
        { x: 2030, y: 930 }
      ],
      alarmRoute: [
        { x: 1810, y: 610 },
        { x: 2170, y: 650 },
        { x: 2430, y: 835 },
        { x: 2160, y: 1130 },
        { x: 1765, y: 930 }
      ]
    },
    {
      id: "enemy-4",
      name: "North Approach Patrol",
      route: [
        { x: 1600, y: 500 },
        { x: 1770, y: 360 },
        { x: 1890, y: 620 },
        { x: 1675, y: 720 }
      ],
      alarmRoute: [
        { x: 1470, y: 435 },
        { x: 1760, y: 260 },
        { x: 1975, y: 650 },
        { x: 1570, y: 805 }
      ]
    },
    {
      id: "enemy-5",
      name: "South East Patrol",
      route: [
        { x: 1660, y: 1660 },
        { x: 2050, y: 1595 },
        { x: 2260, y: 1900 },
        { x: 1940, y: 2200 },
        { x: 1560, y: 2030 }
      ],
      alarmRoute: [
        { x: 1500, y: 1535 },
        { x: 2180, y: 1480 },
        { x: 2390, y: 1970 },
        { x: 1840, y: 2360 },
        { x: 1395, y: 1970 }
      ]
    },
    {
      id: "enemy-6",
      name: "West Road Patrol",
      route: [
        { x: 520, y: 1220 },
        { x: 780, y: 1010 },
        { x: 1030, y: 1225 },
        { x: 830, y: 1540 },
        { x: 500, y: 1480 }
      ],
      alarmRoute: [
        { x: 425, y: 1030 },
        { x: 830, y: 885 },
        { x: 1160, y: 1260 },
        { x: 760, y: 1690 },
        { x: 360, y: 1450 }
      ]
    }
  ]
};
