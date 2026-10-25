import { createBoundary } from "./boundary";

export type DemoTab = "Overview" | "Activity" | "Security";
export type DemoDisclosure = "custody" | "limits" | "automation";

export class ComponentShowcaseController {
  network = createBoundary<HTMLDivElement>();
  tabs = createBoundary<HTMLDivElement>();
  disclosure = createBoundary<HTMLDivElement>();
  switch = createBoundary<HTMLDivElement>();
  actionMenu = createBoundary<HTMLDivElement>();

  model = {
    network: "Mainnet",
    networkOpen: false,
    tab: "Overview" as DemoTab,
    disclosure: "custody" as DemoDisclosure | null,
    automationEnabled: true,
    actionMenuOpen: false,
    lastAction: "No action selected yet",
  };

  networks = ["Mainnet", "Devnet", "Local validator"];
  tabsList: DemoTab[] = ["Overview", "Activity", "Security"];

  toggleNetwork() {
    this.model.networkOpen = !this.model.networkOpen;
    this.network.render();
  }

  closeNetwork() {
    if (!this.model.networkOpen) return;
    this.model.networkOpen = false;
    this.network.render();
  }

  selectNetwork(network: string) {
    if (!this.networks.includes(network)) return;
    this.model.network = network;
    this.model.networkOpen = false;
    this.network.render();
  }

  selectTab(tab: DemoTab) {
    if (this.model.tab === tab) return;
    this.model.tab = tab;
    this.tabs.render();
  }

  toggleDisclosure(section: DemoDisclosure) {
    this.model.disclosure = this.model.disclosure === section ? null : section;
    this.disclosure.render();
  }

  toggleAutomation() {
    this.model.automationEnabled = !this.model.automationEnabled;
    this.switch.render();
  }

  toggleActionMenu() {
    this.model.actionMenuOpen = !this.model.actionMenuOpen;
    this.actionMenu.render();
  }

  closeActionMenu() {
    if (!this.model.actionMenuOpen) return;
    this.model.actionMenuOpen = false;
    this.actionMenu.render();
  }

  runAction(action: string) {
    this.model.lastAction = action;
    this.model.actionMenuOpen = false;
    this.actionMenu.render();
  }

  renderAll() {
    this.network.render();
    this.tabs.render();
    this.disclosure.render();
    this.switch.render();
    this.actionMenu.render();
  }
}
