import { render } from "tradjs/client";
import { ComponentsController, type DemoTab } from "./controller";

const controller = new ComponentsController();
const networks = ["Solana", "Ethereum", "Base"];
const tabs: { id: DemoTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

function DropdownExample() {
  return (
    <div ref={controller.network} style={{ position: "relative" }}>
      <button
        className="btn"
        type="button"
        aria-expanded={controller.model.networkOpen}
        onClick={() => controller.toggleNetwork()}
      >
        {controller.model.network} ▾
      </button>
      {controller.model.networkOpen ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "42px",
            left: 0,
            minWidth: "180px",
            padding: "8px",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            background: "var(--color-surface-2)",
            zIndex: 10,
          }}
        >
          {networks.map((network) => (
            <button
              key={network}
              className="btn"
              type="button"
              style={{ width: "100%", marginBottom: "6px" }}
              onClick={() => controller.selectNetwork(network)}
            >
              {network === controller.model.network ? "✓ " : ""}
              {network}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TabsExample() {
  const copy = {
    overview: "The overview panel is the currently selected boundary child.",
    activity: "Activity can change without reconciling the other demos.",
    settings: "Settings is rendered from the same explicit controller state.",
  }[controller.model.tab];
  return (
    <div ref={controller.tabs}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={
              controller.model.tab === tab.id ? "btn btn-accent" : "btn"
            }
            type="button"
            onClick={() => controller.selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="result-box">{copy}</div>
    </div>
  );
}

function DisclosureExample() {
  return (
    <div ref={controller.disclosure}>
      <button
        className="btn"
        type="button"
        aria-expanded={controller.model.disclosureOpen}
        onClick={() => controller.toggleDisclosure()}
      >
        {controller.model.disclosureOpen ? "Hide details" : "Show details"}
      </button>
      {controller.model.disclosureOpen ? (
        <div className="result-box" style={{ marginTop: "12px" }}>
          This content exists only while the disclosure model is open.
        </div>
      ) : null}
    </div>
  );
}

function SwitchExample() {
  return (
    <div ref={controller.automation}>
      <button
        className={
          controller.model.automationEnabled ? "btn btn-accent" : "btn"
        }
        type="button"
        role="switch"
        aria-checked={controller.model.automationEnabled}
        onClick={() => controller.toggleAutomation()}
      >
        Automation: {controller.model.automationEnabled ? "On" : "Off"}
      </button>
    </div>
  );
}

function ActionMenuExample() {
  return (
    <div ref={controller.actions} style={{ position: "relative" }}>
      <button
        className="btn"
        type="button"
        aria-expanded={controller.model.actionsOpen}
        onClick={() => controller.toggleActions()}
      >
        Actions ⋯
      </button>
      {controller.model.actionsOpen ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "42px",
            left: 0,
            width: "190px",
            padding: "8px",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            background: "var(--color-surface-2)",
            zIndex: 10,
          }}
        >
          {["Refresh", "Duplicate", "Archive"].map((action) => (
            <button
              key={action}
              className="btn"
              type="button"
              style={{ width: "100%", marginBottom: "6px" }}
              onClick={() => controller.runAction(action)}
            >
              {action}
            </button>
          ))}
        </div>
      ) : null}
      <span style={{ marginLeft: "12px", color: "var(--color-muted)" }}>
        Last action: {controller.model.lastAction}
      </span>
    </div>
  );
}

function ComponentsApp() {
  return (
    <>
      <div className="demo-card">
        <h2 className="demo-card-title">Dropdown</h2>
        <p className="demo-card-description">
          The controller changes ordinary state and renders only this dropdown
          boundary.
        </p>
        <DropdownExample />
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">Tabs</h2>
        <p className="demo-card-description">
          Selecting a tab reruns only the tabs component and reconciles only its
          boundary children.
        </p>
        <TabsExample />
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">Disclosure</h2>
        <p className="demo-card-description">
          Conditional children are inserted and removed inside one explicit
          boundary.
        </p>
        <DisclosureExample />
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">Switch</h2>
        <p className="demo-card-description">
          The controller mutates a boolean and explicitly renders the switch
          region.
        </p>
        <SwitchExample />
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">Action menu</h2>
        <p className="demo-card-description">
          Opening the menu and choosing an action stays scoped to this component
          boundary.
        </p>
        <ActionMenuExample />
      </div>
    </>
  );
}

export default function initializePage() {
  const root = document.getElementById("components-demo");
  if (!root) return;
  render(<ComponentsApp />, root);
}
