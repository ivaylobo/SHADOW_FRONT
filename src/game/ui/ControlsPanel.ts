import { CONTROL_HELP } from "../config";
import type { CharacterState } from "../types";

export interface PanelStatus {
  name: string;
  state: CharacterState;
}

export class ControlsPanel {
  private selectedName: HTMLElement;
  private selectedStance: HTMLElement;
  private selectedMotion: HTMLElement;
  private selectedHealth: HTMLElement;
  private selectedTarget: HTMLElement;
  private controlsList: HTMLElement;
  private debugPanel: HTMLElement;
  private debugReadout: HTMLElement;

  constructor(private root: HTMLElement) {
    this.selectedName = this.requireElement("#selected-name");
    this.selectedStance = this.requireElement("#selected-stance");
    this.selectedMotion = this.requireElement("#selected-motion");
    this.selectedHealth = this.requireElement("#selected-health");
    this.selectedTarget = this.requireElement("#selected-target");
    this.controlsList = this.requireElement("#controls-list");
    this.debugPanel = this.requireElement("#debug-panel");
    this.debugReadout = this.requireElement("#debug-readout");

    this.root.addEventListener("click", (event) => event.stopPropagation());
    this.root.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.renderControls();
  }

  updateStatus(status: PanelStatus): void {
    this.selectedName.textContent = status.name;
    this.selectedStance.textContent = status.state.stance;
    this.selectedMotion.textContent = status.state.bound
      ? "bound"
      : status.state.action ?? status.state.motion;
    this.selectedHealth.textContent = `${status.state.health}`;
    this.selectedTarget.textContent = status.state.targetPosition ? "active" : "none";
  }

  setDebug(enabled: boolean, readout: string): void {
    this.debugPanel.hidden = !enabled;
    this.debugReadout.textContent = enabled ? readout : "";
  }

  private renderControls(): void {
    this.controlsList.replaceChildren(
      ...CONTROL_HELP.map((item) => {
        const listItem = document.createElement("li");
        const command = document.createElement("span");
        const description = document.createElement("span");

        command.className = "control-key";
        command.textContent = item.command;
        description.className = "control-description";
        description.textContent = item.description;
        listItem.append(command, description);

        return listItem;
      })
    );
  }

  private requireElement(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector);

    if (!element) {
      throw new Error(`Missing panel element: ${selector}`);
    }

    return element;
  }
}
