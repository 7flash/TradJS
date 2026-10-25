import { createBoundary, render } from "tradjs/client";

type Item = {
  id: number;
  label: string;
};

export default function initializePage() {
  const root = document.getElementById("rendering-demo");
  if (!root) return;

  const state = { count: 0, items: [] as Item[], nextId: 0 };
  const counter = createBoundary<HTMLElement>();
  const items = createBoundary<HTMLElement>();

  const controller = {
    increment() {
      state.count++;
      counter.render();
    },
    addItem() {
      const id = ++state.nextId;
      state.items.push({ id, label: `Item ${id}` });
      items.render();
    },
    reverseItems() {
      state.items.reverse();
      items.render();
    },
    reset() {
      state.count = 0;
      state.items = [];
      counter.render();
      items.render();
    },
  };

  function Counter() {
    return (
      <section className="demo-card" aria-label="Counter" ref={counter}>
        <h2 className="demo-card-title">Counter</h2>
        <p aria-live="polite">
          {state.count} {state.count === 1 ? "click" : "clicks"}
        </p>
        <button
          className="btn btn-accent"
          type="button"
          onClick={controller.increment}
        >
          Increment
        </button>
      </section>
    );
  }

  function Items() {
    return (
      <section className="demo-card" aria-label="Items" ref={items}>
        <h2 className="demo-card-title">Items</h2>
        <p aria-live="polite">
          {state.items.length} {state.items.length === 1 ? "item" : "items"}
        </p>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button className="btn" type="button" onClick={controller.addItem}>
            Add item
          </button>
          <button
            className="btn"
            type="button"
            disabled={state.items.length < 2}
            onClick={controller.reverseItems}
          >
            Reverse
          </button>
        </div>
        {state.items.length ? (
          <ul>
            {state.items.map((item) => (
              <li key={item.id} data-item-id={item.id}>
                {item.label}
              </li>
            ))}
          </ul>
        ) : (
          <p>No items yet.</p>
        )}
      </section>
    );
  }

  function App() {
    return (
      <div>
        <Counter />
        <Items />
        <button className="btn" type="button" onClick={controller.reset}>
          Reset
        </button>
      </div>
    );
  }

  render(<App />, root);
}
