import type { LevelDefinition } from "./LevelDefinition";

const LEVEL_SCALE = 2;
const s = (value: number): number => value * LEVEL_SCALE;
const p = (x: number, y: number): { x: number; y: number } => ({
  x: s(x),
  y: s(y)
});

export const dniproCrossingLevel: LevelDefinition = {
  id: "dnipro-crossing",
  name: "Dnipro Crossing",
  objective: "photo-document",
  description: {
    title: "Dnipro Crossing",
    paragraphs: [
      "Reveal the bridge approach with Alek's drone. Select Alek with key 3, press X to deploy the drone, and move the drone with the arrow keys.",
      "Heroes cannot cross under cloud cover. Clear the bridge route first, then send Maya across the bridge to search the buildings on the far bank.",
      "Only Maya can identify the building with the enemy plans. When Maya is close enough and hovers over the correct building, a photo prompt appears. Click it to move her into position and photograph the secret document."
    ],
    completion: "The test mission is complete after Maya photographs the secret document inside the correct building."
  },
  worldSize: {
    width: 2508,
    height: 2508
  },
  mapImagePath: "/assets/Maps/map-2.png",
  animatedWater: {
    baseColor: "#063d66",
    highlightColor: "#3f9fbd"
  },
  initialSelectedCharacterId: "alek",
  initialPositions: {
    maya: p(250, 1040),
    alyosha: p(198, 1095),
    alek: p(180, 1010)
  },
  collisionPolygons: [
    {
      id: "river-north",
      label: "Dnipro river north",
      points: [
        p(520, 0),
        p(770, 0),
        p(735, 546),
        p(544, 546)
      ]
    },
    {
      id: "river-south",
      label: "Dnipro river south",
      points: [
        p(542, 736),
        p(735, 736),
        p(790, 1254),
        p(570, 1254)
      ]
    }
  ],
  decorativeObjects: [],
  walkableZones: [],
  coverZones: [],
  interactionZones: [],
  objects: [
    {
      id: "dnipro-bridge",
      label: "Bridge",
      kind: "building",
      imagePath: "/assets/objects/bridge-wide.png",
      position: p(633, 640),
      scale: s(0.47),
      anchor: { x: 0.5, y: 0.5 },
      sortY: s(596),
      collisionShapes: []
    },
    {
      id: "plans-house",
      label: "Rural House",
      kind: "building",
      imagePath: "/assets/objects/building-rural-house.png",
      position: p(965, 430),
      scale: s(0.25),
      collisionShapes: [
        {
          id: "plans-house-body",
          points: [
            p(-92, -94),
            p(32, -126),
            p(96, -72),
            p(90, -14),
            p(-74, -8),
            p(-105, -50)
          ]
        }
      ],
      entryZones: [
        {
          id: "plans-house-door",
          points: [
            p(-22, -28),
            p(28, -31),
            p(34, 8),
            p(-26, 12)
          ]
        }
      ],
      interaction: {
        type: "photo-document",
        point: p(4, -2),
        range: s(92),
        promptOffset: p(22, -145),
        photographerIds: ["maya"]
      }
    },
    {
      id: "decoy-farmhouse-north",
      label: "Rural House",
      kind: "building",
      imagePath: "/assets/objects/building-rural-house.png",
      position: p(1060, 270),
      scale: s(0.22),
      collisionShapes: [
        {
          id: "decoy-farmhouse-north-body",
          points: [
            p(-80, -82),
            p(30, -110),
            p(84, -62),
            p(78, -12),
            p(-68, -8),
            p(-92, -44)
          ]
        }
      ]
    },
    {
      id: "decoy-barracks",
      label: "Barracks",
      kind: "building",
      imagePath: "/assets/objects/building-barracks.png",
      position: p(1050, 760),
      scale: s(0.24),
      collisionShapes: [
        {
          id: "decoy-barracks-body",
          points: [
            p(-112, -96),
            p(92, -96),
            p(116, -26),
            p(94, 2),
            p(-108, 2),
            p(-126, -34)
          ]
        }
      ]
    },
    {
      id: "decoy-warehouse",
      label: "Warehouse",
      kind: "building",
      imagePath: "/assets/objects/building-warehouse.png",
      position: p(930, 1010),
      scale: s(0.2),
      collisionShapes: [
        {
          id: "decoy-warehouse-body",
          points: [
            p(-112, -98),
            p(112, -102),
            p(138, -28),
            p(96, 10),
            p(-116, 4),
            p(-145, -36)
          ]
        }
      ]
    }
  ],
  cloudZones: [
    {
      id: "dnipro-bridge-fog",
      points: [
        p(450, 450),
        p(815, 430),
        p(830, 800),
        p(460, 820)
      ]
    },
    {
      id: "east-bank-building-fog",
      points: [
        p(760, 190),
        p(1210, 150),
        p(1230, 1080),
        p(810, 1140),
        p(740, 790),
        p(815, 520)
      ]
    }
  ],
  captives: [],
  enemySpawnPoints: [],
  enemyPatrols: []
};
