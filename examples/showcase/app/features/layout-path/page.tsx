export default function LayoutPathPage() {
  return (
    <div className="demo-card">
      <h1>Path-aware layouts</h1>
      <p>
        The parent layout receives the pathname without
        accessing window.location or parsing a Request.
      </p>
      <a href="/features/head">Compare page metadata</a>
    </div>
  );
}
