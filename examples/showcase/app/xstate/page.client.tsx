import { render } from "tradjs/client";
import { createMachine, createActor, assign } from "xstate";

// ─── Traffic Light FSM ──────────────────────────────────
const trafficMachine = createMachine({
  id: "traffic",
  initial: "green",
  states: {
    green: { on: { NEXT: "yellow" } },
    yellow: { on: { NEXT: "red" } },
    red: { on: { NEXT: "green" } },
  },
});

const LIGHT_COLORS: Record<string, { color: string; glow: string }> = {
  green: { color: "#34d399", glow: "rgba(52, 211, 153, 0.4)" },
  yellow: { color: "#fbbf24", glow: "rgba(251, 191, 36, 0.4)" },
  red: { color: "#f87171", glow: "rgba(248, 113, 113, 0.4)" },
};

function TrafficLight({
  state,
  onNext,
}: {
  state: string;
  onNext: () => void;
}) {
  const active = LIGHT_COLORS[state];
  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "16px",
          justifyContent: "center",
          marginBottom: "16px",
        }}
      >
        {["red", "yellow", "green"].map((light) => (
          <div
            key={light}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background:
                light === state
                  ? LIGHT_COLORS[light].color
                  : "var(--color-surface-2)",
              border: `2px solid ${light === state ? LIGHT_COLORS[light].color : "var(--color-border)"}`,
              boxShadow:
                light === state
                  ? `0 0 20px ${LIGHT_COLORS[light].glow}`
                  : "none",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
      <div
        style={{
          marginBottom: "12px",
          fontFamily: "var(--font-mono)",
          fontSize: "0.85rem",
        }}
      >
        Current state:{" "}
        <span style={{ color: active.color, fontWeight: "600" }}>{state}</span>
      </div>
      <button className="btn btn-accent" onclick={onNext}>
        Next →
      </button>
    </div>
  );
}

// ─── XState Counter ─────────────────────────────────────
const counterMachine = createMachine({
  id: "counter",
  context: { count: 0 },
  on: {
    INC: {
      actions: assign({ count: ({ context }: any) => context.count + 1 }),
    },
    DEC: {
      actions: assign({ count: ({ context }: any) => context.count - 1 }),
    },
    RESET: { actions: assign({ count: 0 }) },
  },
});

function XStateCounter({
  count,
  send,
}: {
  count: number;
  send: (ev: { type: string }) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "3rem",
          fontWeight: "700",
          fontFamily: "var(--font-mono)",
          color:
            count > 0
              ? "var(--color-success)"
              : count < 0
                ? "var(--color-danger)"
                : "white",
          marginBottom: "16px",
          transition: "color 0.15s ease",
        }}
      >
        {count}
      </div>
      <div className="btn-group" style={{ justifyContent: "center" }}>
        <button className="btn" onclick={() => send({ type: "DEC" })}>
          - 1
        </button>
        <button
          className="btn btn-accent"
          onclick={() => send({ type: "INC" })}
        >
          + 1
        </button>
        <button className="btn" onclick={() => send({ type: "RESET" })}>
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Mount ──────────────────────────────────────────────
export default function mount() {
  const trafficRoot = document.getElementById("traffic-root");
  const counterRoot = document.getElementById("xstate-counter-root");

  // Traffic light
  const trafficActor = createActor(trafficMachine);
  if (trafficRoot) {
    trafficActor.subscribe((snap) => {
      render(
        <TrafficLight
          state={snap.value as string}
          onNext={() => trafficActor.send({ type: "NEXT" })}
        />,
        trafficRoot,
      );
    });
    trafficActor.start();
  }

  // Counter
  const counterActor = createActor(counterMachine);
  if (counterRoot) {
    counterActor.subscribe((snap) => {
      render(
        <XStateCounter count={snap.context.count} send={counterActor.send} />,
        counterRoot,
      );
    });
    counterActor.start();
  }

  return () => {
    trafficActor.stop();
    counterActor.stop();
    if (trafficRoot) render(null, trafficRoot);
    if (counterRoot) render(null, counterRoot);
  };
}
