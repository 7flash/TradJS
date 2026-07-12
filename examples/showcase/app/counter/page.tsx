export default function CounterPage() {
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
          <h1 className="page-title">Client Interactivity</h1>
          <span className="badge badge-client">Client Mount</span>
        </div>
        <p className="page-description">
          The server renders this container with a placeholder. A client mount
          script (<code className="code-inline">page.client.tsx</code>) runs
          after hydration and takes over the{" "}
          <code className="code-inline">#counter-root</code> element using
          Melina's <code className="code-inline">render()</code> API.
        </p>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">🔢 Counter</h3>
        <p className="demo-card-description">
          A vanilla counter using <code className="code-inline">render()</code>{" "}
          — no framework, no state library. Each click calls{" "}
          <code className="code-inline">render(vnode, el)</code> which diffs the
          VDOM and patches only changed nodes.
        </p>
        <div
          id="counter-root"
          className="result-box"
          style={{ textAlign: "center", padding: "32px" }}
        >
          <span style={{ color: "var(--color-muted)" }}>
            Loading client script...
          </span>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">⏱️ Lifecycle</h3>
        <p className="demo-card-description">
          Mount scripts export a default function that returns a cleanup
          function. Navigate away and back to observe the mount/cleanup cycle.
        </p>
        <div id="lifecycle-root" className="result-box">
          <span style={{ color: "var(--color-muted)" }}>
            Waiting for mount...
          </span>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📝 How It Works</h3>
        <div className="code-block">{`// app/counter/page.client.tsx
import { render } from 'tradjs/client';

let count = 0;

function Counter() {
    return (
        <div>
            <div style={{ fontSize: '3rem' }}>{count}</div>
            <button onclick={() => { count--; update(); }}>- 1</button>
            <button onclick={() => { count++; update(); }}>+ 1</button>
            <button onclick={() => { count = 0; update(); }}>Reset</button>
        </div>
    );
}

function update() { render(<Counter />, root); }

export default function mount() {
    const root = document.getElementById('counter-root');
    update();
    return () => { render(null, root); };  // cleanup
}`}</div>
      </div>
    </div>
  );
}
