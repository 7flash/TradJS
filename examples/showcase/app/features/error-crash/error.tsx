/**
 * Error boundary for /features/error-crash.
 * Catches the intentional throw and renders a user-friendly error page.
 *
 * Props: { error: { message: string, stack?: string }, pathname: string }
 */
export default function ErrorBoundary({
  error,
  pathname,
}: {
  error: { message: string; stack?: string };
  pathname: string;
}) {
  const errorMessage =
    typeof error === "string" ? error : error?.message || "Unknown error";

  return (
    <div className="page">
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.05))",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "12px",
          padding: "32px",
          marginBottom: "24px",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "16px" }}>💥</div>
        <h1
          style={{ color: "#ef4444", fontSize: "1.5rem", marginBottom: "12px" }}
        >
          Error Boundary Caught This!
        </h1>
        <p
          style={{ color: "var(--color-text-secondary)", marginBottom: "16px" }}
        >
          This is <code>error.tsx</code> — the page component at{" "}
          <code>/features/error-crash</code> crashed during SSR, but the error
          boundary preserved the layout and shows this error page instead.
        </p>

        <div
          style={{
            background: "rgba(0,0,0,0.3)",
            borderRadius: "8px",
            padding: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
            color: "#fca5a5",
            marginBottom: "16px",
            whiteSpace: "pre-wrap",
          }}
        >
          Error: {errorMessage}
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <a
            href="/features/error"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "white",
              borderRadius: "8px",
              fontWeight: "600",
              textDecoration: "none",
            }}
          >
            ← Back to Error Demo
          </a>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "rgba(255,255,255,0.1)",
              color: "var(--color-text)",
              borderRadius: "8px",
              fontWeight: "500",
              textDecoration: "none",
              border: "1px solid var(--color-border)",
            }}
          >
            Go Home
          </a>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">✅ What happened</h3>
        <ol
          style={{
            color: "var(--color-text-secondary)",
            lineHeight: "2",
            paddingLeft: "20px",
          }}
        >
          <li>
            <code>page.tsx</code> threw:{" "}
            <code>throw new Error('Intentional crash!')</code>
          </li>
          <li>Melina caught the error in the SSR try/catch</li>
          <li>
            Found <code>error.tsx</code> in this directory (walk-up discovery)
          </li>
          <li>
            Rendered this boundary and passed{" "}
            <code>{"{ error: { message, stack }, pathname }"}</code> props
          </li>
          <li>
            Wrapped it in parent layouts — notice the sidebar is still intact!
          </li>
        </ol>
      </div>
    </div>
  );
}
