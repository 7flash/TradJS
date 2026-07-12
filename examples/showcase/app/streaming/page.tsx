export default function StreamingPage() {
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
          <h1 className="page-title">SSE Streaming</h1>
          <span className="badge badge-api">API Route</span>
          <span className="badge badge-client">Client Mount</span>
        </div>
        <p className="page-description">
          Real-time data streaming via Server-Sent Events. The server pushes
          random metric updates every second, and the client updates the DOM
          live via <code className="code-inline">render()</code>.
        </p>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📡 Live Stream</h3>
        <p className="demo-card-description">
          Connected to <code className="code-inline">/api/stream</code> via
          EventSource. Cleanup runs on navigation (closes connection).
        </p>
        <div id="stream-status" style={{ marginBottom: "12px" }}>
          <span className="stream-status">
            <span className="stream-dot"></span>
            <span style={{ color: "var(--color-muted)" }}>Connecting...</span>
          </span>
        </div>
        <div id="stream-events" className="stream-events">
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "var(--color-muted)",
              fontSize: "0.85rem",
            }}
          >
            Waiting for events...
          </div>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📊 Stats</h3>
        <div id="stream-stats" className="result-box">
          <span style={{ color: "var(--color-muted)" }}>No data yet</span>
        </div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📝 Server (API Route)</h3>
        <div className="code-block">{`// app/api/stream/route.ts
export function GET(req: Request) {
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            const interval = setInterval(() => {
                const data = JSON.stringify({ value: Math.random() * 100 });
                controller.enqueue(encoder.encode(\`data: \${data}\\n\\n\`));
            }, 1000);

            req.signal.addEventListener('abort', () => {
                clearInterval(interval);
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' }
    });
}`}</div>
      </div>

      <div className="demo-card">
        <h3 className="demo-card-title">📝 Client (Mount Script)</h3>
        <div className="code-block">{`// page.client.tsx
export default function mount() {
    const es = new EventSource('/api/stream');
    es.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        render(<Events events={[...events, data]} />, root);
    };
    return () => es.close();  // cleanup!
}`}</div>
      </div>
    </div>
  );
}
