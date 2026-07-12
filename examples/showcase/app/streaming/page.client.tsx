import { render } from "tradjs/client";

type StreamEvent = {
  id: number;
  timestamp: string;
  value: number;
  label: string;
};

function EventList({ events }: { events: StreamEvent[] }) {
  return (
    <div className="stream-events">
      {events.map((ev) => (
        <div key={ev.id} className="stream-event">
          <span className="stream-event-time">
            {new Date(ev.timestamp).toLocaleTimeString()}
          </span>
          <span style={{ color: "var(--color-accent)", minWidth: "60px" }}>
            {ev.label}
          </span>
          <span className="stream-event-data">{ev.value}%</span>
          <div style={{ flex: 1 }}>
            <div className="perf-bar">
              <div
                className="perf-bar-fill"
                style={{ width: `${ev.value}%` }}
              ></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Status({ connected, count }: { connected: boolean; count: number }) {
  return (
    <span className="stream-status">
      <span className={`stream-dot${connected ? " connected" : ""}`}></span>
      <span
        style={{
          color: connected ? "var(--color-success)" : "var(--color-danger)",
        }}
      >
        {connected ? "Connected" : "Disconnected"}
      </span>
      {connected && (
        <span style={{ color: "var(--color-muted)", fontSize: "0.75rem" }}>
          ({count} events)
        </span>
      )}
    </span>
  );
}

function Stats({ events }: { events: StreamEvent[] }) {
  if (events.length === 0)
    return <span style={{ color: "var(--color-muted)" }}>No data yet</span>;

  const avg = events.reduce((s, e) => s + e.value, 0) / events.length;
  const max = Math.max(...events.map((e) => e.value));
  const min = Math.min(...events.map((e) => e.value));
  const labels = new Set(events.map((e) => e.label));

  return (
    <div>
      <div className="stat-row">
        <span className="stat-label">Events received</span>
        <span className="stat-value">{events.length}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Average value</span>
        <span className="stat-value">{avg.toFixed(1)}%</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Min / Max</span>
        <span className="stat-value">
          {min}% / {max}%
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Labels seen</span>
        <span className="stat-value">{Array.from(labels).join(", ")}</span>
      </div>
    </div>
  );
}

export default function mount() {
  const statusRoot = document.getElementById("stream-status");
  const eventsRoot = document.getElementById("stream-events");
  const statsRoot = document.getElementById("stream-stats");
  if (!statusRoot || !eventsRoot || !statsRoot) return;

  const events: StreamEvent[] = [];
  const MAX_EVENTS = 50;

  const es = new EventSource("/api/stream");

  es.onopen = () => {
    render(<Status connected={true} count={0} />, statusRoot);
  };

  es.onmessage = (ev) => {
    try {
      const data: StreamEvent = JSON.parse(ev.data);
      events.unshift(data); // newest first
      if (events.length > MAX_EVENTS) events.pop();

      render(<Status connected={true} count={events.length} />, statusRoot);
      render(<EventList events={events} />, eventsRoot);
      render(<Stats events={events} />, statsRoot);
    } catch {
      /* ignore parse errors */
    }
  };

  es.onerror = () => {
    render(<Status connected={false} count={events.length} />, statusRoot);
  };

  return () => {
    es.close();
    render(null, statusRoot);
    render(null, eventsRoot);
    render(null, statsRoot);
  };
}
