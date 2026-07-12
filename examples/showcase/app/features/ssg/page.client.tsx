/**
 * SSG Benchmark Visualization — auto-runs on mount, renders bar chart
 */

interface BenchResult {
  method: string;
  avgMs: number;
  medianMs: number;
  p99Ms: number;
  description: string;
}

async function mount() {
  const container = document.getElementById("benchmark-chart");
  if (!container) return;

  container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--color-muted)">
            <div style="font-size: 1.5rem; margin-bottom: 8px">⏱</div>
            Running benchmark (100 iterations)...
        </div>
    `;

  try {
    const res = await fetch("/api/benchmark-ssg");
    const data = await res.json();
    const results: BenchResult[] = data.results;

    if (!results || results.length === 0) {
      container.innerHTML = `<div style="padding: 20px; color: #ef4444">Benchmark returned no results</div>`;
      return;
    }

    const maxAvg = Math.max(...results.map((r) => r.avgMs));

    const colors: Record<string, string> = {
      "SSG (memory)": "#10b981",
      "SSR (fresh)": "#f59e0b",
      "Cached SSR": "#818cf8",
    };

    const barHtml = results
      .map((r, i) => {
        const pct = maxAvg > 0 ? Math.max((r.avgMs / maxAvg) * 100, 2) : 2;
        const color = colors[r.method] || "#6b7280";
        const isSSG = r.method.includes("SSG");

        return `
                <div style="margin-bottom: 20px">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px">
                        <span style="font-weight: 600; color: ${color}; font-size: 0.95rem">
                            ${r.method} ${isSSG ? "⚡" : ""}
                        </span>
                        <span style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--color-text-secondary)">
                            avg: ${r.avgMs.toFixed(4)}ms · median: ${r.medianMs.toFixed(4)}ms · p99: ${r.p99Ms.toFixed(4)}ms
                        </span>
                    </div>
                    <div style="
                        background: rgba(255,255,255,0.05);
                        border-radius: 6px;
                        height: 32px;
                        overflow: hidden;
                        position: relative;
                    ">
                        <div class="bench-bar" data-index="${i}" style="
                            width: 0%;
                            height: 100%;
                            background: linear-gradient(90deg, ${color}66, ${color});
                            border-radius: 6px;
                            transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
                            display: flex;
                            align-items: center;
                            padding-left: 12px;
                        " data-target="${pct}">
                            <span style="
                                color: white;
                                font-size: 0.8rem;
                                font-weight: 600;
                                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                                white-space: nowrap;
                            ">${r.avgMs < 0.001 ? "<0.001ms" : r.avgMs.toFixed(3) + "ms"}</span>
                        </div>
                    </div>
                    <div style="font-size: 0.78rem; color: var(--color-muted); margin-top: 4px">${r.description}</div>
                </div>
            `;
      })
      .join("");

    const summaryHtml = data.summary
      ? `
            <div style="
                margin-top: 20px;
                padding: 16px;
                background: rgba(16, 185, 129, 0.08);
                border: 1px solid rgba(16, 185, 129, 0.2);
                border-radius: 8px;
                font-size: 0.9rem;
                color: var(--color-text-secondary);
            ">
                <div style="font-weight: 600; color: #10b981; margin-bottom: 8px">Summary</div>
                <div>🚀 ${data.summary.ssgVsSsr}</div>
                <div>⚡ ${data.summary.cachedVsSsr}</div>
                <div>📦 ${data.summary.ssgVsCached}</div>
                <div style="font-size: 0.8rem; color: var(--color-muted); margin-top: 8px">${data.summary.note}</div>
            </div>
        `
      : "";

    container.innerHTML = barHtml + summaryHtml;

    // Animate bars in
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll(".bench-bar").forEach((bar) => {
          const el = bar as HTMLElement;
          const target = el.dataset.target;
          if (target) el.style.width = target + "%";
        });
      }, 50);
    });
  } catch (err: any) {
    container.innerHTML = `
            <div style="padding: 20px; color: #ef4444">
                Benchmark failed: ${err.message}
            </div>
        `;
  }
}

mount();
