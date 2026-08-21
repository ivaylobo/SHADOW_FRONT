import type { LevelDefinition } from "./LevelDefinition";

export const testLevel: LevelDefinition = {
  id: "level-one",
  name: "Level One",
  objective: "tractor-escape",
  description: {
    title: "Free Maya",
    paragraphs: [
      "Reveal the map with Alek. Select Alek with key 3, press X to deploy the drone, and move the drone with the arrow keys. While Alek is selected and the drone is active, the camera follows the drone and hidden zones are revealed as the drone passes over them. If the drone is not active or Alek is not selected, the arrow keys only move the camera.",
      "Clear the needed hidden zones to create a route the heroes can actually walk through. Heroes cannot pass under cloud cover; any cloud blocking the route must be revealed before they can move through it.",
      "To capture an enemy, hover over them and click while Alyosha or Alek is selected. The hero will walk to the enemy and tie them if close enough. A tied enemy becomes arrested; hover and click the arrested enemy to have the selected hero lead them somewhere. While leading an enemy, the hero can only walk. Hover and click the escorted enemy again to leave them arrested in place.",
      "After the needed route is revealed, send Alyosha or Alek to the prison gate. Open it with E when the hero is close enough, or left-click the gate itself.",
      "Once Maya is free, bring Maya, Alyosha, and Alek back to the starting tractor. Board all three heroes into the tractor to begin the escape."
    ],
    completion: "The level is complete after Maya is freed, all three heroes return to the starting tractor, and the tractor tows the MT-LB out of view."
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
        point: { x: -78, y: 22 },
        range: 140,
        promptOffset: { x: -4, y: -170 },
        releaseCaptiveIds: ["maya"],
        fps: 8,
        oneShot: true
      }
    },
    {
      id: "tractor-start",
      label: "Tractor",
      kind: "vehicle",
      imagePath: "/assets/objects/tractor_8dir_6frames.png",
      position: { x: 375, y: 2400 },
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
      ],
      interaction: {
        type: "enter-vehicle",
        point: { x: -118, y: -12 },
        range: 58,
        promptOffset: { x: 118, y: -128 },
        exitOffset: { x: -150, y: 10 },
        hiddenFromEnemies: true
      }
    },
    {
      id: "mt-lb-start",
      label: "MT-LB",
      kind: "vehicle",
      imagePath: "/assets/objects/MT-LB.png",
      position: { x: 590, y: 2315 },
      scale: 0.94,
      frame: {
        columns: 6,
        rows: 8,
        column: 0,
        row: 7
      },
      collisionShapes: [
        {
          id: "mt-lb-body",
          points: [
            { x: -98, y: -52 },
            { x: 82, y: -52 },
            { x: 112, y: -18 },
            { x: 92, y: 24 },
            { x: -92, y: 24 },
            { x: -116, y: -16 }
          ]
        }
      ]
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
        { x: 1640, y: 880 },
        { x: 2060, y: 875 },
        { x: 2290, y: 1075 },
        { x: 2075, y: 1280 },
        { x: 1620, y: 1120 }
      ],
      alarmRoute: [
        { x: 1510, y: 790 },
        { x: 2115, y: 775 },
        { x: 2385, y: 1065 },
        { x: 2050, y: 1360 },
        { x: 1485, y: 1125 }
      ]
    },
    {
      id: "enemy-5",
      name: "South East Patrol",
      route: [
        { x: 1620, y: 1505 },
        { x: 2020, y: 1485 },
        { x: 2260, y: 1845 },
        { x: 1940, y: 2200 },
        { x: 1540, y: 2020 }
      ],
      alarmRoute: [
        { x: 1450, y: 1455 },
        { x: 2170, y: 1405 },
        { x: 2390, y: 1935 },
        { x: 1845, y: 2350 },
        { x: 1365, y: 1980 }
      ]
    },
    {
      id: "enemy-6",
      name: "West Road Patrol",
      route: [
        { x: 335, y: 1305 },
        { x: 515, y: 1130 },
        { x: 705, y: 1325 },
        { x: 585, y: 1580 },
        { x: 335, y: 1490 }
      ],
      alarmRoute: [
        { x: 285, y: 1110 },
        { x: 580, y: 980 },
        { x: 875, y: 1330 },
        { x: 550, y: 1710 },
        { x: 250, y: 1490 }
      ]
    }
  ]
};
