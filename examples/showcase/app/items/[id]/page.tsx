const items: Record<
  string,
  { title: string; description: string; color: string }
> = {
  alpha: {
    title: "Alpha Component",
    description:
      "The first dynamic route item. This page was rendered on the server using the [id] parameter from the URL.",
    color: "#818cf8",
  },
  bravo: {
    title: "Bravo Component",
    description:
      "Another dynamic route — same template, different data. The server reads params.id and renders accordingly.",
    color: "#f472b6",
  },
  charlie: {
    title: "Charlie Component",
    description:
      "Dynamic routes support any string as the ID segment. File-based routing maps [id] to :id in the URL pattern.",
    color: "#34d399",
  },
};

export default function DynamicPage({ params }: { params: { id: string } }) {
  const id = params?.id || "unknown";
  const item = items[id];

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
          <h1 className="page-title">Dynamic Routes</h1>
          <span className="badge badge-server">Server SSR</span>
        </div>
        <p className="page-description">
          Melina.js uses <strong>file-based routing</strong>. The directory
          structure inside <code className="code-inline">app/</code> maps
          directly to URL paths. Dynamic segments are defined by wrapping a
          folder name in square brackets.
        </p>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📂 How File-Based Routing Works</h3>
        <p className="demo-card-description">
          Every <code className="code-inline">page.tsx</code> in the{" "}
          <code className="code-inline">app/</code> directory becomes a route.
          Folders create URL segments. Folders named{" "}
          <code className="code-inline">[param]</code> match any value.
        </p>
        <div className="code-block">{`app/
├── page.tsx                 →  /
├── ssr/page.tsx              →  /ssr
├── counter/page.tsx          →  /counter
├── items/
│   └── [id]/                 ← dynamic segment
│       └── page.tsx          →  /items/:id  (matches any id)
└── api/
    ├── data/route.ts         →  /api/data   (API route)
    └── stream/route.ts       →  /api/stream (API route)

Routes are discovered automatically at startup.
No manual configuration, no router setup.`}</div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">🔗 Current Route</h3>
        <div className="result-box">
          <div className="stat-row">
            <span className="stat-label">File on disk</span>
            <span className="stat-value" style={{ fontSize: "0.75rem" }}>
              app/items/[id]/page.tsx
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">URL pattern</span>
            <span className="stat-value">/items/:id</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">params.id</span>
            <span
              className="stat-value"
              style={{ color: item?.color || "var(--color-danger)" }}
            >
              {id}
            </span>
          </div>
        </div>
      </div>

      {item ? (
        <div className="demo-card" style={{ borderColor: item.color + "33" }}>
          <h3 className="demo-card-title">
            <span style={{ color: item.color }}>●</span> {item.title}
          </h3>
          <p className="demo-card-description" style={{ marginBottom: 0 }}>
            {item.description}
          </p>
        </div>
      ) : (
        <div
          className="demo-card"
          style={{ borderColor: "var(--color-danger)" }}
        >
          <h3
            className="demo-card-title"
            style={{ color: "var(--color-danger)" }}
          >
            ⚠️ Unknown ID: "{id}"
          </h3>
          <p className="demo-card-description" style={{ marginBottom: 0 }}>
            No data found for this ID. This is how you'd handle 404s or missing
            resources in a dynamic route. Try one of the known items below.
          </p>
        </div>
      )}

      <div className="demo-card">
        <h3 className="demo-card-title">📍 Navigate Between Items</h3>
        <p className="demo-card-description">
          Each link below navigates to the same{" "}
          <code className="code-inline">[id]/page.tsx</code> template with a
          different <code className="code-inline">params.id</code> value.
        </p>
        <div className="btn-group">
          {Object.entries(items).map(([key, val]) => (
            <a
              key={key}
              href={`/items/${key}`}
              className="btn"
              style={{
                borderColor: val.color,
                color: key === id ? "white" : val.color,
                background: key === id ? val.color : "transparent",
              }}
            >
              /items/{key}
            </a>
          ))}
          <a
            href="/items/unknown"
            className="btn"
            style={{
              borderColor: "var(--color-danger)",
              color: "var(--color-danger)",
            }}
          >
            /items/unknown
          </a>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📝 Component Code</h3>
        <div className="code-block">{`// app/items/[id]/page.tsx

// The component receives \`params\` with the matched URL segments
export default function DynamicPage({ params }) {
    const id = params.id;  // "alpha", "bravo", "charlie", etc.

    // Look up data from any source — database, API, in-memory
    const item = items[id];

    if (!item) return <div>Not found: {id}</div>;

    return (
        <div>
            <h1>{item.title}</h1>
            <p>{item.description}</p>
        </div>
    );
}`}</div>
      </div>
    </div>
  );
}
