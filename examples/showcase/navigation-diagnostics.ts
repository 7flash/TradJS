export function inspectDocument() {
  const transitionStyle = document.querySelector(
    "style[data-tradjs-view-transitions]",
  );
  const sidebar = document.querySelector(".sidebar");
  const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
  const names = new Map<string, string[]>();
  for (const element of document.querySelectorAll("*")) {
    const style = getComputedStyle(element);
    const name = style.viewTransitionName;
    if (
      !name ||
      ["none", "auto", "match-element"].includes(name) ||
      style.display === "none" ||
      !element.getClientRects().length
    )
      continue;
    const label =
      element.tagName.toLowerCase() + (element.id ? `#${element.id}` : "");
    names.set(name, [...(names.get(name) || []), label]);
  }
  const timing = performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  const readinessLink = document.head.querySelector(
    "link[data-tradjs-document-ready]",
  );
  return {
    diagnosticsVersion: "showcase-panel-v1",
    path: location.pathname,
    navigationType: timing?.type || null,
    transitionPolicy:
      transitionStyle?.getAttribute("data-tradjs-view-transitions") ||
      (transitionStyle ? "older-unmarked-policy" : "missing"),
    transitionCSS: transitionStyle?.textContent?.trim() || null,
    crossDocumentEvents: "onpageswap" in window && "onpagereveal" in window,
    observerInHead: Boolean(
      document.head.querySelector("script[data-tradjs-navigation-observer]"),
    ),
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    documentReadiness: {
      target: readinessLink?.getAttribute("href") || null,
      blocking: readinessLink?.getAttribute("blocking") || null,
      elementParsed: Boolean(
        document.querySelector("[data-tradjs-document-end]"),
      ),
      browserSupportsExpect: document
        .createElement("link")
        .relList.supports("expect"),
    },
    recordedTransitions: performance
      .getEntriesByType("mark")
      .filter((entry) => entry.name.startsWith("tradjs:navigation:"))
      .map((entry) => ({
        ...(entry as PerformanceMark).detail,
        phase: entry.name.slice("tradjs:navigation:".length),
        timeMs: Math.round(entry.startTime),
      })),
    sidebarTransitionName: sidebarStyle?.viewTransitionName || null,
    activeLinks: Array.from(
      document.querySelectorAll('.sidebar-nav [aria-current="page"]'),
      (element) => element.getAttribute("href"),
    ),
    links: Array.from(
      document.querySelectorAll(".sidebar-nav .nav-link"),
      (element) => ({
        href: element.getAttribute("href"),
        class: element.className,
        current: element.getAttribute("aria-current"),
        background: getComputedStyle(element).backgroundColor,
      }),
    ),
    duplicateTransitionNames: Array.from(names, ([name, elements]) => ({
      name,
      elements,
    })).filter((item) => item.elements.length > 1),
    clientScriptInHead: Boolean(
      document.head.querySelector("script[data-tradjs-client]"),
    ),
    clientScriptBlocksRender:
      document.head
        .querySelector("script[data-tradjs-client]")
        ?.getAttribute("blocking") || null,
    stylesheets: Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      (element) => new URL(element.href, location.href).pathname,
    ),
    serverResponseMs: timing
      ? Math.round(timing.responseStart - timing.requestStart)
      : null,
    documentTransferMs: timing
      ? Math.round(timing.responseEnd - timing.responseStart)
      : null,
  };
}
export function installNavigationPanel(inspect: typeof inspectDocument): void {
  const panel = document.querySelector<HTMLDetailsElement>(
    "#navigation-diagnostics",
  );
  const summary = panel?.querySelector<HTMLElement>(
    "[data-navigation-summary]",
  );
  const report = panel?.querySelector<HTMLTextAreaElement>(
    "[data-navigation-report]",
  );
  const status = panel?.querySelector<HTMLElement>(
    "[data-navigation-copy-status]",
  );
  const refresh = panel?.querySelector<HTMLButtonElement>(
    "[data-navigation-refresh]",
  );
  const copy = panel?.querySelector<HTMLButtonElement>(
    "[data-navigation-copy]",
  );
  if (!panel || !summary || !report || !status || !refresh || !copy) return;
  const state = { summary: "", report: "", copyStatus: "", copying: false };
  function renderPanel(): void {
    summary!.textContent = state.summary;
    report!.value = state.report;
    status!.textContent = state.copyStatus;
    copy!.disabled = state.copying;
  }
  const controller = {
    refresh(): void {
      const result = inspect();
      const records = result.recordedTransitions;
      const reveal = records.find((entry) => entry.phase === "pagereveal");
      const skipped = records.find((entry) => entry.phase === "skipped");
      const ready = records.some((entry) => entry.phase === "ready");
      if (!reveal) {
        state.summary =
          "No incoming observation was recorded. Follow a sidebar link, then open this panel on the destination page.";
      } else if (!reveal.browserCreatedTransition) {
        state.summary =
          "The browser supplied no incoming transition for this load. Initial loads and reloads normally have none; test a sidebar link.";
      } else if (skipped) {
        state.summary = `The browser skipped the incoming transition: ${skipped.errorName}: ${skipped.message}`;
      } else if (ready) {
        state.summary =
          "The incoming transition reached ready. This does not prove visual continuity; review the report and a browser recording if a visual issue remains.";
      } else {
        state.summary =
          "An incoming transition was supplied, but no ready or skipped result was recorded yet. Refresh the report.";
      }
      state.report = JSON.stringify(result, null, 2);
      state.copyStatus = "";
      renderPanel();
    },
    async copy(): Promise<void> {
      controller.refresh();
      state.copying = true;
      renderPanel();
      try {
        await navigator.clipboard.writeText(state.report);
        state.copyStatus = "Report copied.";
      } catch {
        state.copyStatus =
          "Clipboard unavailable. Select the report below and copy it manually.";
      } finally {
        state.copying = false;
        renderPanel();
      }
    },
  };
  panel.addEventListener("toggle", () => {
    if (panel.open) controller.refresh();
  });
  refresh.addEventListener("click", controller.refresh);
  copy.addEventListener("click", controller.copy);
}
