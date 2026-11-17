// SSE Streaming API — sends a random data event every second
export function GET(req: Request) {
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let count = 0;
      let stopped = false;

      const interval = setInterval(() => {
        if (stopped) return;
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

      const stop = () => {
        if (stopped) return false;
        stopped = true;
        clearInterval(interval);
        req.signal.removeEventListener("abort", onAbort);
        return true;
      };
      const onAbort = () => {
        if (stop()) controller.close();
      };

      cleanup = stop;
      req.signal.addEventListener("abort", onAbort, { once: true });
      if (req.signal.aborted) onAbort();
    },
    cancel() {
      cleanup?.();
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
