export default function HomePage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Welcome to Melina.js</h1>
        <p className="page-description">
          A Bun-native web framework with file-based routing, server-side
          rendering, and a lightweight client VDOM runtime. Each page below
          demonstrates a specific feature.
        </p>
      </div>

      <div className="feature-grid">
        <a href="/ssr" className="feature-card">
          <div className="feature-card-icon">🖥️</div>
          <h3 className="feature-card-title">Server-Side Rendering</h3>
          <p className="feature-card-desc">
            Pages render on the server with full access to the runtime, file
            system, and environment.
          </p>
        </a>

        <a href="/counter" className="feature-card">
          <div className="feature-card-icon">🔢</div>
          <h3 className="feature-card-title">Client Interactivity</h3>
          <p className="feature-card-desc">
            Vanilla counter using render() — no framework, just VDOM diffing and
            DOM patches.
          </p>
        </a>

        <a href="/xstate" className="feature-card">
          <div className="feature-card-icon">🚦</div>
          <h3 className="feature-card-title">XState Integration</h3>
          <p className="feature-card-desc">
            Finite state machines driving UI updates — traffic light FSM and
            actor-based counter.
          </p>
        </a>

        <a href="/reconciler" className="feature-card">
          <div className="feature-card-icon">⚙️</div>
          <h3 className="feature-card-title">Reconciler Strategies</h3>
          <p className="feature-card-desc">
            Benchmark keyed vs sequential vs auto diffing — see where each
            strategy wins.
          </p>
        </a>

        <a href="/items/alpha" className="feature-card">
          <div className="feature-card-icon">🔗</div>
          <h3 className="feature-card-title">Dynamic Routes</h3>
          <p className="feature-card-desc">
            File-based [id] parameter routing with server-side data access.
          </p>
        </a>

        <a href="/streaming" className="feature-card">
          <div className="feature-card-icon">📡</div>
          <h3 className="feature-card-title">SSE Streaming</h3>
          <p className="feature-card-desc">
            Server-Sent Events with live DOM updates via EventSource.
          </p>
        </a>

        <a href="/stress" className="feature-card">
          <div className="feature-card-icon">🔥</div>
          <h3 className="feature-card-title">Backend Stress Test</h3>
          <p className="feature-card-desc">
            Hammer the server with burst, sequential, and ramp-up requests to
            test throughput.
          </p>
        </a>
      </div>

      <div className="demo-card" style={{ marginTop: "32px" }}>
        <h3 className="demo-card-title">Architecture</h3>
        <p className="demo-card-description">
          Melina uses a <strong>Single Root SSR + Vanilla Lifecycle</strong>{" "}
          model. Pages render on the server as JSX → HTML. Client interactivity
          is added via mount scripts (<code>page.client.tsx</code>) that use a
          ~2KB VDOM runtime with pluggable reconcilers.
        </p>
        <div className="code-block">{`Server:  page.tsx      → renderToString() → HTML response
Client:  page.client.tsx → mount()         → render(vnode, el)
Layout:  layout.client.tsx                 → persistent across navigations`}</div>
      </div>
    </div>
  );
}
