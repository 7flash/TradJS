import { render } from "tradjs/client";

let mode: "close" | "tab" = "close";
let claimed = false;
let rootEl: HTMLElement | null = null;

function App() {
  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <strong>Global state:</strong> mode={mode}, claimed={String(claimed)}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          className="btn"
          onclick={() => {
            mode = mode === "close" ? "tab" : "close";
            paint();
          }}
        >
          Toggle mode
        </button>

        <button
          className="btn btn-accent"
          onclick={() => {
            claimed = !claimed;
            paint();
          }}
        >
          Toggle claimed
        </button>

        <button
          className="btn"
          onclick={() => {
            mode = "close";
            claimed = false;
            paint();
          }}
        >
          Reset
        </button>
      </div>

      <div className="result-box" style={{ marginBottom: "16px" }}>
        <h3>Function component output</h3>

        {mode === "close" ? (
          <button data-click="panel-close">Close panel</button>
        ) : (
          <button data-tab="buildings">Buildings tab</button>
        )}

        <div style={{ marginTop: "12px" }}>
          {claimed ? (
            <em data-claimed="yes">✓ reward claimed</em>
          ) : (
            <button data-guide-claim="build-house">Claim build-house</button>
          )}
        </div>
      </div>

      <pre id="nomemo-result" className="code-block" />
    </div>
  );
}

function inspect(root: HTMLElement) {
  const firstButton = root.querySelector(
    ".result-box button",
  ) as HTMLButtonElement | null;
  const claimButton = root.querySelector(
    "[data-guide-claim]",
  ) as HTMLElement | null;
  const claimedEl = root.querySelector("[data-claimed]") as HTMLElement | null;
  const result = root.querySelector("#nomemo-result") as HTMLElement | null;

  const snapshot = {
    mode,
    claimed,
    firstButtonText: firstButton?.textContent ?? null,
    dataClick: firstButton?.getAttribute("data-click") ?? null,
    dataTab: firstButton?.getAttribute("data-tab") ?? null,
    claimButton: claimButton?.getAttribute("data-guide-claim") ?? null,
    claimedText: claimedEl?.textContent ?? null,
    verdict:
      mode === "tab" && firstButton?.getAttribute("data-tab") !== "buildings"
        ? "FAIL: component did not re-run after global mode changed"
        : claimed && claimButton
          ? "FAIL: conditional claim UI did not re-render"
          : "PASS: visible DOM matches global state",
  };

  if (result) {
    result.textContent = JSON.stringify(snapshot, null, 2);
  }
}

function paint() {
  if (!rootEl) return;

  // This intentionally uses <App />, not App(), so it exercises component reconciliation.
  render(<App />, rootEl);
  inspect(rootEl);
}

export default function mount() {
  rootEl = document.getElementById("nomemo-root");
  if (!rootEl) return;

  paint();

  return () => {
    if (rootEl) render(null, rootEl);
    rootEl = null;
    mode = "close";
    claimed = false;
  };
}
