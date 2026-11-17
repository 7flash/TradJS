export default function NotFoundBoundary() {
  return (
    <div className="page">
      <h1>404 — Resource not found</h1>
      <p>
        This is not-found.tsx, not error.tsx.
        The surrounding layouts remain available.
      </p>
      <a href="/features/not-found">Back to demo</a>
    </div>
  );
}
