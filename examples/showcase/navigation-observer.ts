export function observeNavigation(): void {
  const prefix = "tradjs:navigation:";
  const phases = ["pageswap", "pagereveal", "ready", "skipped", "finished"];
  function record(phase: string, detail: Record<string, unknown> = {}): void {
    const name = prefix + phase;
    performance.clearMarks(name);
    performance.mark(name, {
      detail: {
        path: location.pathname,
        documentState: document.readyState,
        documentEndParsed: Boolean(
          document.querySelector("[data-tradjs-document-end]"),
        ),
        ...detail,
      },
    });
  }
  function onPageReveal(event: PageRevealEvent): void {
    for (const phase of phases) performance.clearMarks(prefix + phase);
    const transition = event.viewTransition;
    record("pagereveal", { browserCreatedTransition: Boolean(transition) });
    if (!transition) return;
    transition.ready.then(
      () => record("ready"),
      (error) =>
        record("skipped", {
          errorName: String(error?.name || "Error"),
          message: String(error?.message || error).slice(0, 400),
        }),
    );
    transition.finished.then(() => record("finished"));
  }
  function onPageSwap(event: PageSwapEvent): void {
    record("pageswap", {
      browserCreatedTransition: Boolean(event.viewTransition),
    });
  }
  window.addEventListener("pagereveal", onPageReveal);
  window.addEventListener("pageswap", onPageSwap);
}
