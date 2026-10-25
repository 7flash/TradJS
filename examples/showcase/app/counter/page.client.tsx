import { render } from "tradjs/client";
export default function initializePage() {
  const root = document.getElementById("counter-root");
  const lifecycleRoot = document.getElementById("lifecycle-root");
  if (!root) return;
  const state = { count: 0 };
  const controller = {
    decrement() {
      state.count--;
      update();
    },
    increment() {
      state.count++;
      update();
    },
    reset() {
      state.count = 0;
      update();
    },
  };
  function Counter() {
    return (
      <div>
        <div className="counter-value" aria-live="polite">
          {state.count}
        </div>
        <div className="btn-group" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" onClick={controller.decrement}>
            − 1
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={controller.increment}
          >
            + 1
          </button>
          <button type="button" className="btn" onClick={controller.reset}>
            Reset
          </button>
        </div>
      </div>
    );
  }
  function update() {
    render(<Counter />, root!);
  }
  update();
  if (lifecycleRoot)
    render(
      <p>
        Initialized at {new Date().toLocaleTimeString()}. This state belongs to
        the current document; Back may restore it from the browser’s cache.
      </p>,
      lifecycleRoot,
    );
}
