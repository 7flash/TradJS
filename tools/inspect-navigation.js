(function inspectTradJSNavigation() {
  function inspectDocument() {
    const transitionStyle = document.querySelector(
      "style[data-tradjs-view-transitions]",
    );
    const sidebar = document.querySelector(".sidebar");
    const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
    const names = new Map();
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
    const timing = performance.getEntriesByType("navigation")[0];
    const readinessLink = document.head.querySelector(
      "link[data-tradjs-document-ready]",
    );
    return {
      path: location.pathname,
      transitionPolicy:
        transitionStyle?.getAttribute("data-tradjs-view-transitions") ||
        (transitionStyle ? "older-unmarked-policy" : "missing"),
      transitionCSS: transitionStyle?.textContent?.trim() || null,
      crossDocumentEvents: "onpageswap" in window && "onpagereveal" in window,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      documentReadiness: {
        target: readinessLink?.getAttribute("href") || null,
        blocking: readinessLink?.getAttribute("blocking") || null,
        elementParsed: Boolean(document.querySelector("[data-tradjs-document-end]")),
        browserSupportsExpect: document
          .createElement("link")
          .relList.supports("expect"),
      },
      recordedTransitions: performance
        .getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("tradjs:navigation:"))
        .map((entry) => ({
          phase: entry.name.slice("tradjs:navigation:".length),
          timeMs: Math.round(entry.startTime),
          ...entry.detail,
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
        document.querySelectorAll('link[rel="stylesheet"]'),
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
  console.info(
    "TradJS navigation: current document",
    JSON.stringify(inspectDocument(), null, 2),
  );
  window.addEventListener(
    "pageswap",
    function inspectPageSwap(event) {
      console.info(
        "TradJS navigation: outgoing document",
        JSON.stringify(
          {
            ...inspectDocument(),
            destination: event.activation?.entry?.url
              ? new URL(event.activation.entry.url).pathname
              : null,
            browserCreatedTransition: Boolean(event.viewTransition),
          },
          null,
          2,
        ),
      );
    },
    { once: true },
  );
  console.info(
    "The showcase records incoming pagereveal, ready, skipped, and finished events before this snippet runs. An empty recordedTransitions array means no early observation was recorded. Enable Preserve log and click one normal sidebar link, then run this snippet in the incoming document. The outgoing pageswap event alone does not prove an incoming capture; finished can also follow a skipped transition.",
  );
})();
