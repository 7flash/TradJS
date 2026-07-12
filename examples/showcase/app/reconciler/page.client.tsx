import { render, setReconciler, getReconciler } from "tradjs/client";
import type { ReconcilerName } from "tradjs/client";

// ─── Types ──────────────────────────────────────────────────────────────────────

type StrategyResult = { strategy: string; avgMs: number };
type BenchResult = {
  description: string;
  winner: string;
  strategies: StrategyResult[];
};

// ─── Data Helpers ───────────────────────────────────────────────────────────────

let nextId = 0;

// ─── Components ─────────────────────────────────────────────────────────────────

/**
 * Standard list item — used for all benchmarks.
 * Has enough children that prop patching is measurable.
 */
function Item({ id, label }: { key?: any; id: number; label: string }) {
  return (
    <div className="list-item" data-id={id}>
      <span className="list-item-key">#{id}</span>
      <span className="list-item-label">{label}</span>
      <span className="list-item-value">{id * 7}</span>
      <span data-m="a">{id % 2 === 0 ? "●" : "○"}</span>
      <span data-m="b">{id % 5}</span>
    </div>
  );
}

/**
 * Heavy list item — used specifically for the Keyed benchmark.
 * 12 children each with multiple data attributes.
 * When sequential patches these (different content at each index),
 * the DOM write cost is enormous. Keyed matches by key and patches
 * NOTHING (identical props) → huge advantage.
 */
function HeavyItem({ id, label }: { key?: any; id: number; label: string }) {
  const v = id * 7;
  const cat = id % 3 === 0 ? "alpha" : id % 3 === 1 ? "beta" : "gamma";
  return (
    <div
      className="list-item"
      data-id={id}
      data-cat={cat}
      data-priority={id % 10}
      data-active={id % 2 === 0 ? "true" : "false"}
    >
      <span className="list-item-key" data-sort={id} data-group={cat}>
        #{id}
      </span>
      <span
        className="list-item-label"
        data-len={label.length}
        data-hash={id ^ 0xabcd}
      >
        {label}
      </span>
      <span className="list-item-value" data-raw={v} data-fmt={`$${v}`}>
        {v}
      </span>
      <span data-m="a" data-flag={id % 2 === 0 ? "even" : "odd"}>
        {id % 2 === 0 ? "●" : "○"}
      </span>
      <span data-m="b" data-mod5={id % 5} data-mod7={id % 7}>
        {id % 5}
      </span>
      <span data-m="c" data-tier={cat} data-rank={id}>
        {cat.toUpperCase()}
      </span>
      <span data-m="d" data-score={v + id}>{`Score: ${v + id}`}</span>
      <span
        data-m="e"
        data-hex={id.toString(16)}
        data-bin={id.toString(2).slice(-8)}
      >
        {id.toString(16).toUpperCase()}
      </span>
      <span
        data-m="f"
        data-pct={`${(id / 20).toFixed(1)}%`}
      >{`${(id / 20).toFixed(1)}%`}</span>
      <span data-m="g" data-tag={`t-${id}`} data-idx={id}>{`Tag ${id}`}</span>
      <span data-m="h" data-ts={id * 1000} data-epoch={id}>
        {id * 1000}
      </span>
      <span data-m="i" data-badge={id % 4 === 0 ? "gold" : "silver"}>
        {id % 4 === 0 ? "★" : "☆"}
      </span>
    </div>
  );
}

/**
 * View B — completely different element types for the Replace benchmark.
 * div→section, span→code, etc. Type mismatches force remove+create.
 */
function ItemB({ id, label }: { id: number; label: string }) {
  return (
    <section className="list-item" data-id={id}>
      <code className="list-item-key">{id}.</code>
      <em className="list-item-label">{label.toUpperCase()}</em>
      <strong className="list-item-value">v{id}</strong>
      <small data-m="a">{id % 3}</small>
      <b data-m="b">{id % 7}</b>
    </section>
  );
}

// ── Result display ──────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: BenchResult }) {
  const sorted = [...result.strategies].sort((a, b) => a.avgMs - b.avgMs);
  const fastest = sorted[0].avgMs;
  const slowest = sorted[sorted.length - 1].avgMs;
  const speedup =
    slowest > 0 && fastest > 0 ? (slowest / fastest).toFixed(1) : "?";

  return (
    <div>
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--color-muted)",
          marginBottom: "10px",
        }}
      >
        {result.description}
      </div>
      <div
        style={{ fontSize: "0.8rem", marginBottom: "10px", fontWeight: 600 }}
      >
        <span style={{ color: "var(--color-success)" }}>
          🏆 {result.winner}
        </span>{" "}
        wins by{" "}
        <span style={{ color: "var(--color-success)" }}>{speedup}×</span>
      </div>
      {sorted.map((s, i) => {
        const isWinner = i === 0;
        const isWorst = i === sorted.length - 1;
        const barWidth = Math.max(4, (s.avgMs / slowest) * 100);
        const barColor = isWinner
          ? "var(--color-success)"
          : isWorst
            ? "var(--color-danger)"
            : "var(--color-accent)";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "6px",
              fontSize: "0.78rem",
            }}
          >
            <span
              style={{
                minWidth: "100px",
                fontFamily: "var(--font-mono)",
                color: isWinner
                  ? "var(--color-success)"
                  : isWorst
                    ? "var(--color-danger)"
                    : "inherit",
                fontWeight: isWinner ? 700 : 400,
              }}
            >
              {isWinner ? "🏆 " : "   "}
              {s.strategy}
            </span>
            <div className="perf-bar" style={{ flex: 1 }}>
              <div
                className="perf-bar-fill"
                style={{ width: `${barWidth}%`, background: barColor }}
              ></div>
            </div>
            <span
              style={{
                minWidth: "75px",
                textAlign: "right",
                fontFamily: "var(--font-mono)",
                color: isWinner
                  ? "var(--color-success)"
                  : isWorst
                    ? "var(--color-danger)"
                    : "inherit",
                fontWeight: isWinner ? 700 : 400,
              }}
            >
              {s.avgMs.toFixed(2)}ms
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PlaygroundStats({
  strategy,
  itemCount,
  lastOp,
  renderTime,
}: {
  strategy: string;
  itemCount: number;
  lastOp: string;
  renderTime: number;
}) {
  const c =
    renderTime < 2
      ? "var(--color-success)"
      : renderTime < 10
        ? "var(--color-warning)"
        : "var(--color-danger)";
  return (
    <div
      style={{
        display: "flex",
        gap: "16px",
        fontSize: "0.8rem",
        flexWrap: "wrap",
      }}
    >
      <div>
        <span style={{ color: "var(--color-muted)" }}>Strategy:</span>{" "}
        <strong>{strategy}</strong>
      </div>
      <div>
        <span style={{ color: "var(--color-muted)" }}>Items:</span>{" "}
        <strong>{itemCount}</strong>
      </div>
      <div>
        <span style={{ color: "var(--color-muted)" }}>Last op:</span>{" "}
        <strong>{lastOp}</strong>
      </div>
      <div>
        <span style={{ color: "var(--color-muted)" }}>Render:</span>{" "}
        <strong style={{ color: c }}>{renderTime.toFixed(2)}ms</strong>
      </div>
    </div>
  );
}

// ─── Benchmark Engine ───────────────────────────────────────────────────────────

// Auto is included — it should always be close to the winner (it picks keyed or
// sequential based on whether keys are present in the children).
const STRATEGIES: ReconcilerName[] = ["replace", "sequential", "keyed", "auto"];
const N = 2000; // list size
const RUNS = 12; // runs per strategy

function trimmedMean(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.2);
  const trimmed = sorted.slice(trim, sorted.length - trim);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

/**
 * ════════════════════════════════════════════════════════════════
 * REPLACE BENCHMARK — Full Content Swap (Different Element Types)
 * ════════════════════════════════════════════════════════════════
 *
 * Old: 2000 × Item (div>span/span/span...)
 * New: 2000 × ItemB (section>code/em/strong...)
 *
 * NO KEYS — so keyed/auto fall through to sequential.
 * Every position: same type (Item vs ItemB are both components), but
 * their OUTPUT elements differ (div→section) → patchFiber detects
 * element type mismatch → removes old + mounts new.
 *
 * Replace wins because it does 2 bulk loops (remove all, mount all)
 * without per-element type checking or Map overhead.
 */
function benchReplace(workspace: HTMLElement): BenchResult {
  const results: StrategyResult[] = [];
  const itemsA = Array.from({ length: N }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
  }));
  const itemsB = Array.from({ length: N }, (_, i) => ({
    id: N + i,
    label: `Alt ${i}`,
  }));

  for (const strategy of STRATEGIES) {
    const times: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      render(
        <div>
          {itemsA.map((it) => (
            <Item id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );
      const start = performance.now();
      render(
        <div>
          {itemsB.map((it) => (
            <ItemB id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );
      times.push(performance.now() - start);
    }
    workspace.innerHTML = "";
    results.push({ strategy, avgMs: trimmedMean(times) });
  }

  const winner = results.reduce((a, b) => (a.avgMs < b.avgMs ? a : b)).strategy;
  return {
    description: `${N} items, full type swap (div→section, no keys), ${RUNS} runs`,
    winner,
    strategies: results,
  };
}

/**
 * ════════════════════════════════════════════════════════════════
 * SEQUENTIAL BENCHMARK — Pure Append (no keys)
 * ════════════════════════════════════════════════════════════════
 *
 * Old: 2000 items (NO keys — so auto picks sequential too)
 * New: 2000 items (unchanged) + 400 new items
 *
 * Sequential wins because:
 *   - Walks index 0..1999: identical VNodes → patchFiber does NOTHING
 *   - Walks index 2000..2399: no old → mount (400 creates)
 *   - Total: ~0 DOM writes + 400 creates
 *
 * Without keys, keyed can't match anything → falls back to index-based
 * but still pays Map overhead. Replace destroys all + recreates all.
 *
 * NO KEYS on items — this is the specific scenario where sequential shines
 * and auto should pick sequential automatically.
 */
function benchSequential(workspace: HTMLElement): BenchResult {
  const results: StrategyResult[] = [];
  const base = Array.from({ length: N }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
  }));
  const appended = [
    ...base,
    ...Array.from({ length: 400 }, (_, i) => ({
      id: N + i,
      label: `New ${i}`,
    })),
  ];

  for (const strategy of STRATEGIES) {
    const times: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      // NO keys — auto will pick sequential
      render(
        <div>
          {base.map((it) => (
            <Item id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );
      const start = performance.now();
      render(
        <div>
          {appended.map((it) => (
            <Item id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );
      times.push(performance.now() - start);
    }
    workspace.innerHTML = "";
    results.push({ strategy, avgMs: trimmedMean(times) });
  }

  const winner = results.reduce((a, b) => (a.avgMs < b.avgMs ? a : b)).strategy;
  return {
    description: `${N}→${N + 400} items appended (no keys), ${RUNS} runs`,
    winner,
    strategies: results,
  };
}

/**
 * ════════════════════════════════════════════════════════════════
 * KEYED BENCHMARK — Remove From Front
 * ════════════════════════════════════════════════════════════════
 *
 * Old: 2000 keyed items [A1..A2000]
 * New: 1500 items     [A501..A2000]  (remove first 500)
 *
 * Keyed wins because:
 *   - Matches ALL 1500 remaining items by key → IDENTICAL props
 *     → ZERO DOM writes per matched item
 *   - Removes 500 items from the front → 500 DOM removes
 *   - No items need to move (remaining are already in order)
 *   - Total: ~0 patches + 500 removes
 *
 * Sequential is TERRIBLE here because:
 *   - Position 0: old=A1, new=A501 → same type → patches ALL props
 *   - Position 1: old=A2, new=A502 → patches ALL props
 *   - ...positions 0..1499 ALL have different content → patches all
 *   - Then removes 500 items from the end
 *   - Total: 1500 × full prop patches + 500 removes
 *
 * Replace: destroys all 2000 + creates 1500 = catastrophic
 */
function benchKeyed(workspace: HTMLElement): BenchResult {
  const results: StrategyResult[] = [];

  const KEYED_N = 2000;
  const REMOVE_N = 500;
  // Original items with keys
  const origItems = Array.from({ length: KEYED_N }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
  }));
  // After removing first REMOVE_N items
  const afterRemove = origItems.slice(REMOVE_N);

  for (const strategy of STRATEGIES) {
    const times: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      // Mount original list WITH keys — using HeavyItem for expensive DOM
      render(
        <div>
          {origItems.map((it) => (
            <HeavyItem key={it.id} id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );

      // Measure: remove first 500 items
      const start = performance.now();
      render(
        <div>
          {afterRemove.map((it) => (
            <HeavyItem key={it.id} id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );
      times.push(performance.now() - start);
    }
    workspace.innerHTML = "";
    results.push({ strategy, avgMs: trimmedMean(times) });
  }

  const winner = results.reduce((a, b) => (a.avgMs < b.avgMs ? a : b)).strategy;
  return {
    description: `Remove ${REMOVE_N} from front of ${KEYED_N} keyed heavy items, ${RUNS} runs`,
    winner,
    strategies: results,
  };
}

/**
 * ════════════════════════════════════════════════════════════════
 * AUTO BENCHMARK — Mixed Operations (keys + mutations)
 * ════════════════════════════════════════════════════════════════
 *
 * Runs a mixed workload: prepend 200 + update all + append 200.
 * WITH keys — so keyed/auto detect them and use keyed reconciler.
 *
 * Auto should always be close to the winner — it inspects keys
 * and picks the optimal reconciler automatically. This benchmark
 * validates that auto never falls far behind the best strategy.
 */
function benchAuto(workspace: HTMLElement): BenchResult {
  const results: StrategyResult[] = [];

  const base = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
  }));
  // Mixed: prepend 200, keep middle, append 200, update labels
  const prependNew = Array.from({ length: 200 }, (_, i) => ({
    id: 2000 + i,
    label: `Pre ${i}`,
  }));
  const appendNew = Array.from({ length: 200 }, (_, i) => ({
    id: 3000 + i,
    label: `App ${i}`,
  }));
  const mutated = [
    ...prependNew,
    ...base.map((it) => ({ ...it, label: `Updated ${it.id}` })),
    ...appendNew,
  ];

  for (const strategy of STRATEGIES) {
    const times: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      render(
        <div>
          {base.map((it) => (
            <Item key={it.id} id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );
      const start = performance.now();
      render(
        <div>
          {mutated.map((it) => (
            <Item key={it.id} id={it.id} label={it.label} />
          ))}
        </div>,
        workspace,
        { reconciler: strategy },
      );
      times.push(performance.now() - start);
    }
    workspace.innerHTML = "";
    results.push({ strategy, avgMs: trimmedMean(times) });
  }

  const winner = results.reduce((a, b) => (a.avgMs < b.avgMs ? a : b)).strategy;
  return {
    description: `1000 items: prepend 200 + update all + append 200, ${RUNS} runs`,
    winner,
    strategies: results,
  };
}

const BENCHMARKS: Record<string, (ws: HTMLElement) => BenchResult> = {
  replace: benchReplace,
  sequential: benchSequential,
  keyed: benchKeyed,
  auto: benchAuto,
};

// ─── Mount ──────────────────────────────────────────────────────────────────────

export default function mount() {
  const workspace = document.getElementById("bench-workspace");
  const playgroundList = document.getElementById("playground-list");
  const playgroundStats = document.getElementById("playground-stats");

  if (!workspace || !playgroundList || !playgroundStats) {
    console.error("[Reconciler] Missing DOM containers");
    return;
  }

  // ── Per-Card Benchmark Buttons ──────────────────────────────────────────

  document.querySelectorAll("[data-bench]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = (btn as HTMLElement).dataset.bench!;
      const fn = BENCHMARKS[name];
      const el = document.getElementById(`result-${name}`);
      if (!fn || !el) return;

      btn.classList.add("disabled");
      render(
        <span style={{ color: "var(--color-accent)" }}>⏳ Running...</span>,
        el,
      );

      setTimeout(() => {
        const result = fn(workspace!);
        render(<ResultCard result={result} />, el);
        btn.classList.remove("disabled");
      }, 32);
    });
  });

  // ── Live Playground ─────────────────────────────────────────────────────

  type PlayItem = { id: number; label: string };
  nextId = 0;
  let items: PlayItem[] = Array.from({ length: 12 }, () => {
    const id = ++nextId;
    return { id, label: `Item ${id}` };
  });
  let currentStrategy: ReconcilerName = "auto";
  let lastOp = "init";
  let lastTime = 0;

  function renderPlayground() {
    const t0 = performance.now();
    render(
      <div className="item-list">
        {items.map((it) => (
          <div className="list-item" key={it.id}>
            <span className="list-item-key">#{it.id}</span>
            <span className="list-item-label">{it.label}</span>
          </div>
        ))}
      </div>,
      playgroundList!,
      { reconciler: currentStrategy },
    );
    lastTime = performance.now() - t0;
    render(
      <PlaygroundStats
        strategy={currentStrategy}
        itemCount={items.length}
        lastOp={lastOp}
        renderTime={lastTime}
      />,
      playgroundStats!,
    );
  }
  renderPlayground();

  document
    .getElementById("strategy-selector")
    ?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-strategy]");
      if (!btn) return;
      currentStrategy = (btn as HTMLElement).dataset
        .strategy! as ReconcilerName;
      document
        .querySelectorAll("#strategy-selector .strategy-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      lastOp = `switch → ${currentStrategy}`;
      renderPlayground();
    });

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const ACTIONS: Record<string, () => void> = {
    add: () => {
      const id = ++nextId;
      items = [...items, { id, label: `Item ${id}` }];
      lastOp = "add";
    },
    "remove-last": () => {
      items = items.slice(0, -1);
      lastOp = "remove last";
    },
    shuffle: () => {
      items = shuffle(items);
      lastOp = "shuffle";
    },
    reverse: () => {
      items = [...items].reverse();
      lastOp = "reverse";
    },
    prepend: () => {
      const id = ++nextId;
      items = [{ id, label: `Item ${id}` }, ...items];
      lastOp = "prepend";
    },
    clear: () => {
      items = [];
      lastOp = "clear";
    },
    reset: () => {
      nextId = 0;
      items = Array.from({ length: 12 }, () => {
        const id = ++nextId;
        return { id, label: `Item ${id}` };
      });
      lastOp = "reset";
    },
  };

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = (btn as HTMLElement).dataset.action!;
      ACTIONS[a]?.();
      renderPlayground();
    });
  });

  return () => {
    playgroundList!.innerHTML = "";
    playgroundStats!.innerHTML = "";
  };
}
