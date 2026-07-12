export default function XStatePage() {
  return (
    <div className="page">
      <div className="page-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "6px",
          }}
        >
          <h1 className="page-title">XState Integration</h1>
          <span className="badge badge-client">Client Mount</span>
        </div>
        <p className="page-description">
          Use XState finite state machines to drive UI updates. State
          transitions trigger <code className="code-inline">render()</code> —
          predictable behavior with zero framework overhead.
        </p>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">🚦 Traffic Light</h3>
        <p className="demo-card-description">
          A finite state machine with three states: <strong>green</strong> →{" "}
          <strong>yellow</strong> → <strong>red</strong>. Click to advance. The
          machine enforces valid transitions — you can't skip from green to red.
        </p>
        <div
          id="traffic-root"
          className="result-box"
          style={{ textAlign: "center", padding: "24px" }}
        >
          <span style={{ color: "var(--color-muted)" }}>
            Loading client script...
          </span>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">🔢 XState Counter</h3>
        <p className="demo-card-description">
          A counter driven by an XState machine with{" "}
          <code className="code-inline">assign</code> actions. Compare this to
          the vanilla counter — same UI, but state transitions are serializable
          and predictable.
        </p>
        <div
          id="xstate-counter-root"
          className="result-box"
          style={{ textAlign: "center", padding: "24px" }}
        >
          <span style={{ color: "var(--color-muted)" }}>
            Loading client script...
          </span>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📝 XState + Melina Pattern</h3>
        <div className="code-block">{`import { render } from 'tradjs/client';
import { createMachine, createActor, assign } from 'xstate';

const machine = createMachine({
    context: { count: 0 },
    on: {
        INC: { actions: assign({ count: ({ context }) => context.count + 1 }) },
        DEC: { actions: assign({ count: ({ context }) => context.count - 1 }) },
    }
});

export default function mount() {
    const actor = createActor(machine);
    const root = document.getElementById('my-root');

    actor.subscribe(snap => {
        render(<Counter count={snap.context.count} send={actor.send} />, root);
    });

    actor.start();
    return () => actor.stop();  // cleanup on navigate
}`}</div>
      </div>
    </div>
  );
}
