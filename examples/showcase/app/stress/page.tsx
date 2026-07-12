export default function StressTestPage() {
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
          <h1 className="page-title">Server Throughput</h1>
          <span className="badge badge-client">Client Mount</span>
          <span className="badge badge-server">Server Hit</span>
        </div>
        <p className="page-description">
          Fire real HTTP requests at the Melina server from your browser.
          Measures SSR render time, API response latency, and how the server
          handles concurrent load.
        </p>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">🎯 Test Configuration</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <div>
            <label
              className="stat-label"
              style={{ display: "block", marginBottom: "4px" }}
            >
              Target Endpoint
            </label>
            <div
              id="endpoint-selector"
              className="strategy-selector"
              style={{ flexWrap: "wrap" }}
            >
              <button className="strategy-btn active" data-endpoint="/api/data">
                GET /api/data
              </button>
              <button className="strategy-btn" data-endpoint="/ssr">
                SSR Page
              </button>
              <button className="strategy-btn" data-endpoint="/counter">
                Counter Page
              </button>
              <button className="strategy-btn" data-endpoint="/">
                Home Page
              </button>
            </div>
          </div>
          <div>
            <label
              className="stat-label"
              style={{ display: "block", marginBottom: "4px" }}
            >
              Concurrency
            </label>
            <div id="concurrency-selector" className="strategy-selector">
              <button className="strategy-btn" data-concurrency="1">
                1
              </button>
              <button className="strategy-btn" data-concurrency="5">
                5
              </button>
              <button className="strategy-btn active" data-concurrency="10">
                10
              </button>
              <button className="strategy-btn" data-concurrency="25">
                25
              </button>
              <button className="strategy-btn" data-concurrency="50">
                50
              </button>
            </div>
          </div>
        </div>
        <div id="stress-controls" className="btn-group">
          <button className="btn btn-accent" data-action="burst">
            ⚡ Burst (send all at once)
          </button>
          <button className="btn" data-action="sequential">
            📐 Sequential (one at a time)
          </button>
          <button className="btn" data-action="ramp">
            📈 Ramp Up (1→N over 3s)
          </button>
          <button className="btn" data-action="clear">
            🗑️ Clear Results
          </button>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📊 Results</h3>
        <div
          id="stress-summary"
          className="result-box"
          style={{ marginBottom: "16px" }}
        >
          <span style={{ color: "var(--color-muted)" }}>
            Configure and run a test above.
          </span>
        </div>
        <div id="stress-log" style={{ maxHeight: "400px", overflowY: "auto" }}>
          <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
            Request log will appear here.
          </span>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📝 Test Modes</h3>
        <div className="code-block">{`⚡ Burst     — fires all N requests at once (Promise.all)
               tests: concurrency limits, race conditions

📐 Sequential — sends one request at a time, waits for response
               tests: per-request latency, baseline throughput

📈 Ramp Up   — increases concurrency from 1→N over 3 seconds
               tests: degradation curve under increasing load`}</div>
      </div>
    </div>
  );
}
