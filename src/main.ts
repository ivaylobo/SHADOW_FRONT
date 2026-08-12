import { Game } from "./game/Game";
import "./styles.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const sidePanel = document.querySelector<HTMLElement>("#side-panel");

if (!canvas || !sidePanel) {
  throw new Error("Missing game canvas or side panel element.");
}

const game = new Game(canvas, sidePanel);
game.start();
