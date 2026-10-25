import { createBoundary } from "tradjs/client";

export type DemoTab = "overview" | "activity" | "settings";

export class ComponentsController {
  network = createBoundary<HTMLDivElement>();
  tabs = createBoundary<HTMLDivElement>();
  disclosure = createBoundary<HTMLDivElement>();
  automation = createBoundary<HTMLDivElement>();
  actions = createBoundary<HTMLDivElement>();

  model = {
    network: "Solana",
    networkOpen: false,
    tab: "overview" as DemoTab,
    disclosureOpen: false,
    automationEnabled: true,
    actionsOpen: false,
    lastAction: "None",
  };

  toggleNetwork() {
    this.model.networkOpen = !this.model.networkOpen;
    this.network.render();
  }

  selectNetwork(network: string) {
    this.model.network = network;
    this.model.networkOpen = false;
    this.network.render();
  }

  selectTab(tab: DemoTab) {
    this.model.tab = tab;
    this.tabs.render();
  }

  toggleDisclosure() {
    this.model.disclosureOpen = !this.model.disclosureOpen;
    this.disclosure.render();
  }

  toggleAutomation() {
    this.model.automationEnabled = !this.model.automationEnabled;
    this.automation.render();
  }

  toggleActions() {
    this.model.actionsOpen = !this.model.actionsOpen;
    this.actions.render();
  }

  runAction(action: string) {
    this.model.lastAction = action;
    this.model.actionsOpen = false;
    this.actions.render();
  }
}
