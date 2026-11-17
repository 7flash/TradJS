export default function HttpContractPage() {
  return (
    <div className="page">
      <h1>HTTP route contracts</h1>
      <p>
        GET returns a plain object. TradJS serializes the
        result as JSON. HEAD, OPTIONS and unsupported-method
        handling are demonstrated without custom handlers.
      </p>
      <a href="/api/http-contract">Open GET response</a>
      <div className="demo-card">
        <h2>Try different methods</h2>
        <pre>{`curl -i localhost:3000/api/http-contract
curl -I localhost:3000/api/http-contract
curl -i -X OPTIONS localhost:3000/api/http-contract
curl -i -X PUT localhost:3000/api/http-contract`}</pre>
        <p>
          PUT should return 405, not 404 or a successful
          empty response. Inspect the Allow header.
        </p>
      </div>
    </div>
  );
}
