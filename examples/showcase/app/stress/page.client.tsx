import { render } from "tradjs/client";
import {
  normalizeTarget,
  runBenchmark,
  validateOptions,
  type BenchmarkSnapshot,
} from "./benchmark";
function Results({ result }: { result: BenchmarkSnapshot | null }) {
  if (!result) return <p>Choose a target, then start a test.</p>;
  const metrics = [
    ["Successful requests/s", result.successfulPerSecond.toFixed(1)],
    ["Completed responses", String(result.succeeded + result.httpErrors)],
    ["Average latency", `${result.averageMs.toFixed(1)} ms`],
    ["Median latency", `${result.p50Ms.toFixed(1)} ms`],
    ["95th percentile", `${result.p95Ms.toFixed(1)} ms`],
    ["Elapsed", `${(result.elapsedMs / 1000).toFixed(1)} s`],
  ];
  return (
    <>
      <div className="benchmark-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      <p className="benchmark-status">
        {result.sent} sent · {result.active} active · {result.succeeded}{" "}
        successful · {result.httpErrors} HTTP errors · {result.networkErrors}{" "}
        network errors · {result.timeouts} timed out · {result.cancelled}{" "}
        cancelled
      </p>
      {result.networkErrors > 0 && (
        <p className="benchmark-error">
          The browser could not read some responses. Check the URL, network
          connection, CORS, and the browser console.
        </p>
      )}
      <div className="benchmark-log">
        <table>
          <caption>Last 50 completed attempts, in completion order</caption>
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th>Time</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {result.recent.map((item) => (
              <tr key={item.index}>
                <td>{item.index}</td>
                <td>{item.status || "—"}</td>
                <td>{item.durationMs.toFixed(1)} ms</td>
                <td>{item.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export default function initializePage() {
  const root = document.getElementById("throughput-root");
  if (!root) return;
  const state = {
    url: "/api/data",
    concurrency: "4",
    duration: "5",
    timeout: "5",
    maxRequests: "1000",
    running: false,
    error: "",
    result: null as BenchmarkSnapshot | null,
  };
  let activeRun: AbortController | null = null;
  function update() {
    render(<App />, root!);
  }
  function updateResults() {
    const target = root!.querySelector("[data-results]");
    if (target) render(<Results result={state.result} />, target);
  }
  function setField(
    key: "url" | "concurrency" | "duration" | "timeout" | "maxRequests",
    event: Event,
  ) {
    if (state.running) return;
    state[key] = (event.target as HTMLInputElement).value;
    state.error = "";
    update();
  }
  const controller = {
    url(event: Event) {
      setField("url", event);
    },
    concurrency(event: Event) {
      setField("concurrency", event);
    },
    duration(event: Event) {
      setField("duration", event);
    },
    timeout(event: Event) {
      setField("timeout", event);
    },
    maxRequests(event: Event) {
      setField("maxRequests", event);
    },
    preset(event: MouseEvent) {
      if (state.running) return;
      state.url = (event.currentTarget as HTMLButtonElement).value;
      state.error = "";
      update();
    },
    stop() {
      activeRun?.abort();
    },
    clear() {
      if (state.running) return;
      state.result = null;
      state.error = "";
      update();
    },
    async start(event: Event) {
      event.preventDefault();
      if (state.running) return;
      try {
        const options = {
          url: normalizeTarget(state.url, location.href),
          concurrency: Number(state.concurrency),
          durationMs: Number(state.duration) * 1000,
          timeoutMs: Number(state.timeout) * 1000,
          maxRequests: Number(state.maxRequests),
        };
        validateOptions(options);
        state.error = "";
        state.result = null;
        state.running = true;
        activeRun = new AbortController();
        update();
        state.result = await runBenchmark(
          options,
          activeRun.signal,
          (result) => {
            state.result = result;
            updateResults();
          },
        );
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
      } finally {
        activeRun = null;
        state.running = false;
        update();
      }
    },
  };
  function App() {
    return (
      <>
        <form className="demo-card" onSubmit={controller.start}>
          <h2 className="demo-card-title">Test configuration</h2>
          <label className="benchmark-field">
            Target URL
            <input
              name="url"
              type="text"
              required
              value={state.url}
              onInput={controller.url}
              disabled={state.running}
              placeholder="/api/data or https://example.com/api"
              autoComplete="url"
              spellCheck={false}
            />
          </label>
          <div className="btn-group" style={{ marginTop: "12px" }}>
            <button
              className="btn"
              type="button"
              value="/api/data"
              onClick={controller.preset}
              disabled={state.running}
            >
              Local API
            </button>
            <button
              className="btn"
              type="button"
              value="/ssr"
              onClick={controller.preset}
              disabled={state.running}
            >
              SSR page
            </button>
            <button
              className="btn"
              type="button"
              value="/"
              onClick={controller.preset}
              disabled={state.running}
            >
              Overview page
            </button>
          </div>
          <div className="benchmark-fields">
            <label className="benchmark-field">
              Concurrency
              <input
                name="concurrency"
                type="number"
                min="1"
                max="32"
                step="1"
                required
                value={state.concurrency}
                onInput={controller.concurrency}
                disabled={state.running}
              />
            </label>
            <label className="benchmark-field">
              Duration (seconds)
              <input
                name="duration"
                type="number"
                min="0.1"
                max="60"
                step="0.1"
                required
                value={state.duration}
                onInput={controller.duration}
                disabled={state.running}
              />
            </label>
            <label className="benchmark-field">
              Request timeout (seconds)
              <input
                name="timeout"
                type="number"
                min="0.1"
                max="30"
                step="0.1"
                required
                value={state.timeout}
                onInput={controller.timeout}
                disabled={state.running}
              />
            </label>
            <label className="benchmark-field">
              Maximum requests
              <input
                name="maxRequests"
                type="number"
                min="1"
                max="10000"
                step="1"
                required
                value={state.maxRequests}
                onInput={controller.maxRequests}
                disabled={state.running}
              />
            </label>
          </div>
          <div className="btn-group">
            <button
              className="btn btn-accent"
              type="submit"
              disabled={state.running}
            >
              Start test
            </button>
            <button
              className="btn"
              type="button"
              onClick={controller.stop}
              disabled={!state.running}
            >
              Stop
            </button>
            <button
              className="btn"
              type="button"
              onClick={controller.clear}
              disabled={state.running || !state.result}
            >
              Clear results
            </button>
          </div>
          {state.error && (
            <p className="benchmark-error" role="alert">
              {state.error}
            </p>
          )}
        </form>
        <section className="demo-card" aria-label="Test results">
          <h2 className="demo-card-title">Results</h2>
          <p role="status" className="benchmark-status">
            {state.running
              ? "Test running…"
              : state.result
                ? `Finished: ${state.result.reason}. ${state.result.url}`
                : "Ready."}
          </p>
          <div data-results="">
            <Results result={state.result} />
          </div>
        </section>
      </>
    );
  }
  window.addEventListener("pagehide", controller.stop);
  update();
}
