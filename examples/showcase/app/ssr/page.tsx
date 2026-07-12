import { readFileSync } from "fs";
import path from "path";

export default function SSRPage() {
  // All of this runs on the server — never in the browser
  const serverTime = new Date().toISOString();
  const platform = process.platform;
  const bunVersion = typeof Bun !== "undefined" ? Bun.version : "unknown";
  const nodeVersion = process.version;
  const cwd = process.cwd();
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  // Read a file from disk (impossible in the browser!)
  let packageInfo = { name: "unknown", version: "unknown" };
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf-8");
    packageInfo = JSON.parse(raw);
  } catch {
    /* ignore */
  }

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
          <h1 className="page-title">Server-Side Rendering</h1>
          <span className="badge badge-server">Server Only</span>
        </div>
        <p className="page-description">
          This page has no client script. Everything you see was rendered on the
          server with full access to Node/Bun APIs, file system, and environment
          variables.
        </p>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">🕐 Server Environment</h3>
        <p className="demo-card-description">
          These values are computed at request time on the server.
        </p>
        <div className="result-box">
          <div className="stat-row">
            <span className="stat-label">Rendered At</span>
            <span className="stat-value">{serverTime}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Platform</span>
            <span className="stat-value">{platform}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Bun Version</span>
            <span className="stat-value">{bunVersion}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Node Compat</span>
            <span className="stat-value">{nodeVersion}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Working Dir</span>
            <span className="stat-value" style={{ fontSize: "0.75rem" }}>
              {cwd}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Uptime</span>
            <span className="stat-value">{Math.floor(uptime)}s</span>
          </div>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📦 Package Info (from disk)</h3>
        <p className="demo-card-description">
          Read via <code className="code-inline">readFileSync()</code> — only
          possible on the server.
        </p>
        <div className="result-box">
          <div className="stat-row">
            <span className="stat-label">Name</span>
            <span className="stat-value">{packageInfo.name}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Version</span>
            <span className="stat-value">{packageInfo.version}</span>
          </div>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">💾 Memory Usage</h3>
        <p className="demo-card-description">
          Server process memory at render time.
        </p>
        <div className="result-box">
          <div className="stat-row">
            <span className="stat-label">Heap Used</span>
            <span className="stat-value">
              {(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Heap Total</span>
            <span className="stat-value">
              {(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">RSS</span>
            <span className="stat-value">
              {(memUsage.rss / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📝 How It Works</h3>
        <div className="code-block">{`// app/ssr/page.tsx — runs on the server only
import { readFileSync } from 'fs';

export default function SSRPage() {
    const serverTime = new Date().toISOString();
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

    return <div>Rendered at {serverTime}, pkg: {pkg.name}</div>;
}

// No page.client.tsx = no client JavaScript for this page!`}</div>
      </div>
    </div>
  );
}
