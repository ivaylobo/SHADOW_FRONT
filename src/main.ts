import { Game } from "./game/Game";
import type { LevelDefinition } from "./game/levels/LevelDefinition";
import { dniproCrossingLevel } from "./game/levels/dniproCrossingLevel";
import { testLevel } from "./game/levels/testLevel";
import "./styles.css";

interface CampaignMission {
  id: string;
  title: string;
  region: string;
  longitude: number;
  latitude: number;
  level?: LevelDefinition;
  unlockAfter?: string[];
}

const CAMPAIGN_MAP_BOUNDS = {
  minLongitude: 21,
  maxLongitude: 48,
  minLatitude: 40.5,
  maxLatitude: 56.7
} as const;

const COMPLETED_MISSIONS_KEY = "shadow-front.completedMissions";
const campaignMissions: CampaignMission[] = [
  {
    id: "level-one",
    title: "Tractor Mission",
    region: "Southern Ukraine",
    longitude: 32.6,
    latitude: 46.8,
    level: testLevel
  },
  {
    id: "dnipro-crossing",
    title: "Dnipro Crossing",
    region: "Central Ukraine",
    longitude: 35.05,
    latitude: 48.46,
    level: dniproCrossingLevel,
    unlockAfter: ["level-one"]
  },
  {
    id: "kharkiv-rail",
    title: "Kharkiv Rail",
    region: "Eastern Ukraine",
    longitude: 36.23,
    latitude: 49.99,
    unlockAfter: ["dnipro-crossing"]
  },
  {
    id: "border-convoy",
    title: "Border Convoy",
    region: "Western Russia",
    longitude: 38,
    latitude: 50.6,
    unlockAfter: ["kharkiv-rail"]
  },
  {
    id: "northern-route",
    title: "Northern Route",
    region: "Russia",
    longitude: 37.62,
    latitude: 55.75,
    unlockAfter: ["border-convoy"]
  }
];

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

const app = getRequiredElement<HTMLElement>("#app");
const canvas = getRequiredElement<HTMLCanvasElement>("#game-canvas");
const sidePanel = getRequiredElement<HTMLElement>("#side-panel");
const missionMapScreen = getRequiredElement<HTMLElement>("#mission-map-screen");
const missionMarkerLayer = getRequiredElement<HTMLElement>("#mission-marker-layer");
const missionList = getRequiredElement<HTMLUListElement>("#mission-list");
const missionProgress = getRequiredElement<HTMLElement>("#mission-progress");

let game: Game | null = null;

function readCompletedMissions(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPLETED_MISSIONS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeCompletedMissions(completedMissionIds: Set<string>): void {
  localStorage.setItem(COMPLETED_MISSIONS_KEY, JSON.stringify([...completedMissionIds]));
}

function markMissionComplete(missionId: string): void {
  const completedMissionIds = readCompletedMissions();
  completedMissionIds.add(missionId);
  writeCompletedMissions(completedMissionIds);
}

function isMissionUnlocked(mission: CampaignMission, completedMissionIds: Set<string>): boolean {
  return (mission.unlockAfter ?? []).every((missionId) => completedMissionIds.has(missionId));
}

function projectMissionPosition(mission: CampaignMission): { x: number; y: number } {
  const x =
    ((mission.longitude - CAMPAIGN_MAP_BOUNDS.minLongitude) /
      (CAMPAIGN_MAP_BOUNDS.maxLongitude - CAMPAIGN_MAP_BOUNDS.minLongitude)) *
    100;
  const y =
    ((CAMPAIGN_MAP_BOUNDS.maxLatitude - mission.latitude) /
      (CAMPAIGN_MAP_BOUNDS.maxLatitude - CAMPAIGN_MAP_BOUNDS.minLatitude)) *
    100;

  return { x, y };
}

function startMission(mission: CampaignMission): void {
  const completedMissionIds = readCompletedMissions();

  if (!isMissionUnlocked(mission, completedMissionIds) || !mission.level) {
    window.alert("Mission briefing will be connected later.");
    return;
  }

  if (game) {
    return;
  }

  missionMapScreen.hidden = true;
  app.hidden = false;

  game = new Game(canvas, sidePanel, {
    level: mission.level,
    onLevelComplete: markMissionComplete
  });
  void game.start();
}

function renderMissionMap(): void {
  const completedMissionIds = readCompletedMissions();
  const completedCount = campaignMissions.filter((mission) => completedMissionIds.has(mission.id)).length;
  missionProgress.textContent = `${completedCount} / ${campaignMissions.length} missions completed`;
  missionMarkerLayer.replaceChildren();
  missionList.replaceChildren();

  for (const mission of campaignMissions) {
    const isCompleted = completedMissionIds.has(mission.id);
    const isUnlocked = isMissionUnlocked(mission, completedMissionIds);
    const hasPlayableLevel = Boolean(mission.level);
    const canStartMission = isUnlocked && hasPlayableLevel;
    const isActive = canStartMission && !isCompleted;
    const missionPosition = projectMissionPosition(mission);

    const flagButton = document.createElement("button");
    flagButton.type = "button";
    flagButton.className = "mission-flag";
    flagButton.style.setProperty("--mission-x", `${missionPosition.x}%`);
    flagButton.style.setProperty("--mission-y", `${missionPosition.y}%`);
    flagButton.ariaLabel = `${mission.title}, ${mission.region}`;
    flagButton.disabled = !canStartMission;
    flagButton.classList.toggle("is-active", isActive);
    flagButton.classList.toggle("is-locked", !isActive && !isCompleted);
    flagButton.classList.toggle("is-completed", isCompleted);
    flagButton.classList.toggle("is-playable", canStartMission);
    flagButton.addEventListener("click", () => startMission(mission));

    const pole = document.createElement("span");
    pole.className = "mission-flag__pole";
    const cloth = document.createElement("span");
    cloth.className = "mission-flag__cloth";
    const pin = document.createElement("span");
    pin.className = "mission-flag__pin";
    const label = document.createElement("span");
    label.className = "mission-flag__label";
    label.textContent = mission.title;
    flagButton.append(pole, cloth, pin, label);
    missionMarkerLayer.append(flagButton);

    const listItem = document.createElement("li");
    listItem.className = "mission-list__item";
    listItem.classList.toggle("is-active", isActive);
    listItem.classList.toggle("is-completed", isCompleted);
    const missionTitle = document.createElement("span");
    missionTitle.textContent = mission.title;
    const missionStatus = document.createElement("strong");
    missionStatus.textContent = getMissionStatusLabel(mission, isUnlocked, isCompleted);
    listItem.append(missionTitle, missionStatus);
    missionList.append(listItem);
  }
}

function getMissionStatusLabel(mission: CampaignMission, isUnlocked: boolean, isCompleted: boolean): string {
  if (isCompleted) {
    return "Complete";
  }

  if (!isUnlocked) {
    return "Locked";
  }

  return mission.level ? "Ready" : "Pending";
}

renderMissionMap();
