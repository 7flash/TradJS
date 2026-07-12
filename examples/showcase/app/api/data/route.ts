// REST API endpoint
export function GET(req: Request) {
  return Response.json({
    message: "Hello from the Melina.js API!",
    timestamp: new Date().toISOString(),
    routes: [
      { method: "GET", path: "/api/data", description: "This endpoint" },
      {
        method: "GET",
        path: "/api/stream",
        description: "SSE streaming endpoint",
      },
    ],
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return Response.json({
    received: body,
    echo: true,
    processedAt: new Date().toISOString(),
  });
}
