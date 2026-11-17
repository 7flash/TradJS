// TradJS 4.6 method handling and JSON normalization.
export function GET() {
  // A plain JSON-compatible result, not a Response.
  return {
    ok: true,
    feature: "Automatic JSON result",
    methods: ["GET"],
  };
}

// No explicit HEAD or OPTIONS needed for framework defaults.
// No PUT handler: PUT should receive 405 Method Not Allowed.
//
// Try:
// curl -i http://localhost:3000/api/http-contract
// curl -I http://localhost:3000/api/http-contract
// curl -i -X OPTIONS http://localhost:3000/api/http-contract
// curl -i -X PUT http://localhost:3000/api/http-contract
//
// Check HEAD's empty body, OPTIONS/Allow, and PUT's 405.
// The JSON response should have application/json content type.
