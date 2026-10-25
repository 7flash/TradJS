export default function RenderingPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Subtree rendering</h1>
        <p className="page-description">
          Controller methods change ordinary state and render the affected
          section. Each action updates its own section; Reset updates the whole
          widget.
        </p>
      </div>
      <div id="rendering-demo">
        <div className="demo-card">
          <p>The interactive example is loading.</p>
        </div>
      </div>
      <noscript>
        This example needs JavaScript. The rest of this page remains available.
      </noscript>
    </div>
  );
}
