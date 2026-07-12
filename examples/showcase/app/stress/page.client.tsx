import { render } from "tradjs/client";

// ─── Types ──────────────────────────────────────────────────────────────────────

type RequestResult = {
  index: number;
  endpoint: string;
  status: number;
  time: number;
  ok: boolean;
  error?: string;
};

type TestSummary = {
  total: number;
  succeeded: number;
  failed: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
  mode: string;
  endpoint: string;
  concurrency: number;
};

// ─── Components ─────────────────────────────────────────────────────────────────

function Summary({ summary }: { summary: TestSummary | null }) {
  if (!summary) {
    return (
      <span style={{ color: "var(--color-muted)" }}>
        Configure and run a test above.
      </span>
    );
  }

  const successRate =
    summary.total > 0 ? (summary.succeeded / summary.total) * 100 : 0;
  const rateColor =
    successRate === 100
      ? "var(--color-success)"
      : successRate > 80
        ? "var(--color-warning)"
        : "var(--color-danger)";

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <span className="badge badge-server">{summary.mode}</span>
        <span className="badge badge-client">{summary.endpoint}</span>
        <span
          className="badge"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          ×{summary.concurrency}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "12px",
        }}
      >
        <div>
          <div className="stat-label">Success Rate</div>
          <div
            className="stat-value"
            style={{ color: rateColor, fontSize: "1.1rem" }}
          >
            {successRate.toFixed(0)}%
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>
            {summary.succeeded}/{summary.total}
          </div>
        </div>
        <div>
          <div className="stat-label">Avg Response</div>
          <div
            className="stat-value"
            style={{
              color:
                summary.avgTime < 50
                  ? "var(--color-success)"
                  : summary.avgTime < 200
                    ? "var(--color-warning)"
                    : "var(--color-danger)",
              fontSize: "1.1rem",
            }}
          >
            {summary.avgTime.toFixed(0)}ms
          </div>
        </div>
        <div>
          <div className="stat-label">Min / Max</div>
          <div className="stat-value" style={{ fontSize: "1.1rem" }}>
            {summary.minTime.toFixed(0)} / {summary.maxTime.toFixed(0)}ms
          </div>
        </div>
        <div>
          <div className="stat-label">Total Wall Time</div>
          <div className="stat-value" style={{ fontSize: "1.1rem" }}>
            {(summary.totalTime / 1000).toFixed(2)}s
          </div>
        </div>
        {summary.total > 1 && (
          <div>
            <div className="stat-label">Throughput</div>
            <div className="stat-value" style={{ fontSize: "1.1rem" }}>
              {(summary.total / (summary.totalTime / 1000)).toFixed(1)} req/s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RequestLog({ results }: { results: RequestResult[] }) {
  if (results.length === 0) {
    return (
      <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
        Request log will appear here.
      </span>
    );
  }

  return (
    <div style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
      {results.map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "8px",
            padding: "4px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.03)",
            color: r.ok ? "var(--color-text)" : "var(--color-danger)",
          }}
        >
          <span style={{ color: "var(--color-muted)", minWidth: "28px" }}>
            #{r.index}
          </span>
          <span
            style={{
              color: r.ok ? "var(--color-success)" : "var(--color-danger)",
              minWidth: "32px",
            }}
          >
            {r.status}
          </span>
          <span style={{ color: "var(--color-muted)", minWidth: "60px" }}>
            {r.time.toFixed(1)}ms
          </span>
          <span style={{ flex: 1 }}>{r.endpoint}</span>
          {r.error && (
            <span style={{ color: "var(--color-danger)" }}>{r.error}</span>
          )}
          <div className="perf-bar" style={{ width: "80px", flexShrink: 0 }}>
            <div
              className="perf-bar-fill"
              style={{
                width: `${Math.min(100, (r.time / 500) * 100)}%`,
                background:
                  r.time < 50
                    ? "var(--color-success)"
                    : r.time < 200
                      ? "var(--color-warning)"
                      : "var(--color-danger)",
              }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Test Runners ───────────────────────────────────────────────────────────────

async function sendRequest(
  endpoint: string,
  index: number,
): Promise<RequestResult> {
  const start = performance.now();
  try {
    const res = await fetch(endpoint);
    const time = performance.now() - start;
    // Consume body to properly finish the request
    await res.text();
    return { index, endpoint, status: res.status, time, ok: res.ok };
  } catch (e: any) {
    return {
      index,
      endpoint,
      status: 0,
      time: performance.now() - start,
      ok: false,
      error: e.message,
    };
  }
}

async function runBurst(
  endpoint: string,
  count: number,
  onProgress: (results: RequestResult[]) => void,
): Promise<RequestResult[]> {
  const promises = Array.from({ length: count }, (_, i) =>
    sendRequest(endpoint, i + 1),
  );
  const results: RequestResult[] = [];

  for (const p of promises) {
    const r = await p;
    results.push(r);
    onProgress([...results]);
  }
  return results;
}

async function runSequential(
  endpoint: string,
  count: number,
  onProgress: (results: RequestResult[]) => void,
): Promise<RequestResult[]> {
  const results: RequestResult[] = [];
  for (let i = 0; i < count; i++) {
    const r = await sendRequest(endpoint, i + 1);
    results.push(r);
    onProgress([...results]);
  }
  return results;
}

async function runRamp(
  endpoint: string,
  maxConcurrency: number,
  onProgress: (results: RequestResult[]) => void,
): Promise<RequestResult[]> {
  const results: RequestResult[] = [];
  let idx = 0;
  const steps = 6;
  const delayPerStep = 500; // 3s total

  for (let step = 1; step <= steps; step++) {
    const concurrent = Math.ceil((step / steps) * maxConcurrency);
    const promises = Array.from({ length: concurrent }, () =>
      sendRequest(endpoint, ++idx),
    );
    const stepResults = await Promise.all(promises);
    results.push(...stepResults);
    onProgress([...results]);
    if (step < steps) await new Promise((r) => setTimeout(r, delayPerStep));
  }
  return results;
}

function computeSummary(
  results: RequestResult[],
  mode: string,
  endpoint: string,
  concurrency: number,
  totalTime: number,
): TestSummary {
  const times = results.map((r) => r.time);
  return {
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    avgTime:
      times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    minTime: times.length > 0 ? Math.min(...times) : 0,
    maxTime: times.length > 0 ? Math.max(...times) : 0,
    totalTime,
    mode,
    endpoint,
    concurrency,
  };
}

// ─── Mount ──────────────────────────────────────────────────────────────────────

export default function mount() {
  const summaryRoot = document.getElementById("stress-summary");
  const logRoot = document.getElementById("stress-log");
  if (!summaryRoot || !logRoot) return;

  let currentEndpoint = "/api/data";
  let currentConcurrency = 10;
  let running = false;

  // Endpoint selection
  document
    .getElementById("endpoint-selector")
    ?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-endpoint]");
      if (!btn || running) return;
      currentEndpoint = (btn as HTMLElement).dataset.endpoint!;
      document
        .querySelectorAll("#endpoint-selector .strategy-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });

  // Concurrency selection
  document
    .getElementById("concurrency-selector")
    ?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-concurrency]");
      if (!btn || running) return;
      currentConcurrency = parseInt((btn as HTMLElement).dataset.concurrency!);
      document
        .querySelectorAll("#concurrency-selector .strategy-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });

  // Controls
  document
    .getElementById("stress-controls")
    ?.addEventListener("click", async (e) => {
      const btn = (e.target as HTMLElement).closest("[data-action]");
      if (!btn) return;
      const action = (btn as HTMLElement).dataset.action!;

      if (action === "clear") {
        render(<Summary summary={null} />, summaryRoot);
        render(<RequestLog results={[]} />, logRoot);
        return;
      }

      if (running) return;
      running = true;

      // Disable buttons during test
      document
        .querySelectorAll("#stress-controls .btn")
        .forEach((b) => b.classList.add("disabled"));

      render(
        <span style={{ color: "var(--color-accent)" }}>
          ⏳ Running {action}...
        </span>,
        summaryRoot,
      );

      const onProgress = (results: RequestResult[]) => {
        render(<RequestLog results={results} />, logRoot);
      };

      const startTime = performance.now();
      let results: RequestResult[];

      switch (action) {
        case "burst":
          results = await runBurst(
            currentEndpoint,
            currentConcurrency,
            onProgress,
          );
          break;
        case "sequential":
          results = await runSequential(
            currentEndpoint,
            currentConcurrency,
            onProgress,
          );
          break;
        case "ramp":
          results = await runRamp(
            currentEndpoint,
            currentConcurrency,
            onProgress,
          );
          break;
        default:
          results = [];
      }

      const totalTime = performance.now() - startTime;
      const modeLabel =
        action === "burst"
          ? "Burst"
          : action === "sequential"
            ? "Sequential"
            : "Ramp Up";
      const summary = computeSummary(
        results,
        modeLabel,
        currentEndpoint,
        currentConcurrency,
        totalTime,
      );

      render(<Summary summary={summary} />, summaryRoot);
      render(<RequestLog results={results} />, logRoot);

      running = false;
      document
        .querySelectorAll("#stress-controls .btn")
        .forEach((b) => b.classList.remove("disabled"));
    });

  return () => {
    render(null, summaryRoot);
    render(null, logRoot);
  };
}
