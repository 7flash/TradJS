export default function CounterPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Counter</h1>
        <p className="page-description">
          A controller changes ordinary state and explicitly renders a JSX view.
          The renderer reuses matching DOM nodes and patches the changed text.
        </p>
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">Try it</h2>
        <div
          id="counter-root"
          className="result-box"
          style={{ textAlign: "center", padding: "32px" }}
        >
          Loading counter…
        </div>
        <noscript>Enable JavaScript to use the counter.</noscript>
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">Document lifetime</h2>
        <p className="demo-card-description">
          The server renders the page; the browser initializer mounts the
          counter into its container. This is a fresh client mount, not
          hydration. A new document gets fresh state, while browser Back/Forward
          may restore a previous document.
        </p>
        <div id="lifecycle-root" className="result-box" />
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">The complete pattern</h2>
        <div className="code-block">{`import { render } from "tradjs/client";

export default function initializePage() {
  const root = document.getElementById("counter-root");
  if (!root) return;
  const state = { count: 0 };
  const controller = {
    increment() {
      state.count++;
      render(<Counter />, root);
    },
  };
  function Counter() {
    return <button onClick={controller.increment}>{state.count}</button>;
  }
  render(<Counter />, root);
}`}</div>
      </div>
    </div>
  );
}
