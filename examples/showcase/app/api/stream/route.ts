// SSE Streaming API — sends a random data event every second
export function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let count = 0;

      const interval = setInterval(() => {
        count++;
        const data = JSON.stringify({
          id: count,
          timestamp: new Date().toISOString(),
          value: Math.round(Math.random() * 100),
          label: ["CPU", "Memory", "Disk", "Network"][
            Math.floor(Math.random() * 4)
          ],
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }, 1000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
