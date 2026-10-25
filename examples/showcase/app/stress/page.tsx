export default function ThroughputPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Server throughput</h1>
        <p className="page-description">
          Test an HTTP URL from your browser. Set a concurrency level and run
          duration, then compare successful requests per second and
          complete-response latency.
        </p>
      </div>
      <div id="throughput-root">
        <p>Loading test controls…</p>
      </div>
      <noscript>Enable JavaScript to run a throughput test.</noscript>
      <div className="demo-card">
        <h2 className="demo-card-title">What the numbers measure</h2>
        <p className="demo-card-description">
          Requests go directly from this browser to the target. Same-origin
          paths work immediately. Another origin must allow this page through
          CORS; an HTTPS page also cannot fetch an insecure HTTP target.
        </p>
        <p className="demo-card-description">
          Latency includes network time and the full response body. It is not
          isolated server render time. Browser connection limits, service
          workers, and this device affect throughput. Fetch uses no-store; a
          service worker or upstream cache can still affect the result.
        </p>
        <p className="demo-card-description">
          The run stops at its duration or request limit. Stop cancels active
          requests. Latency percentiles cover completed HTTP responses,
          including HTTP errors; cancelled, timed-out, and network-failed
          requests are reported separately. Only successful responses count
          toward throughput.
        </p>
      </div>
    </div>
  );
}
