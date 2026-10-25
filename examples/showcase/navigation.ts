export const sections = [
  {
    title: "Rendering",
    items: [
      {
        href: "/ssr",
        label: "Server rendering",
        description: "HTML generated from server data on each request.",
      },
      {
        href: "/counter",
        label: "Counter",
        description:
          "Plain state, controller methods, and explicit render calls.",
      },
      {
        href: "/features/rendering",
        label: "Subtree rendering",
        description: "Update one owned section or render the whole widget.",
      },
      {
        href: "/features/components",
        label: "Boundary components",
        description:
          "Build interactive controls with explicit render boundaries.",
      },
      {
        href: "/reconciler",
        label: "Reconciler strategies",
        description: "Compare keyed, sequential, and automatic reconciliation.",
      },
      {
        href: "/xstate",
        label: "XState integration",
        description: "Drive ordinary JSX views from an optional state machine.",
      },
    ],
  },
  {
    title: "Pages and routing",
    items: [
      {
        href: "/items/alpha",
        prefix: "/items/",
        label: "Dynamic routes",
        description: "Read URL parameters in a server-rendered page.",
      },
      {
        href: "/features/head",
        label: "Page metadata",
        description: "Set document titles and metadata from a page.",
      },
      {
        href: "/features/scoped-css",
        label: "Scoped CSS",
        description: "Keep a route’s styles within its page.",
      },
      {
        href: "/features/middleware",
        label: "Middleware",
        description: "Handle a request before its route runs.",
      },
      {
        href: "/features/error",
        prefix: "/features/error",
        label: "Error boundaries",
        description: "Render a useful response when a page fails.",
      },
    ],
  },
  {
    title: "Data and performance",
    items: [
      {
        href: "/features/ssg",
        label: "Page caching",
        description: "Reuse generated HTML and observe revalidation.",
      },
      {
        href: "/streaming",
        label: "Event streaming",
        description: "Receive server-sent events in the current document.",
      },
      {
        href: "/stress",
        label: "Server throughput",
        description: "Measure an HTTP URL with bounded concurrent requests.",
      },
    ],
  },
];
export function isActive(
  item: {
    href: string;
    prefix?: string;
  },
  pathname: string,
): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return (
    normalized === item.href ||
    Boolean(item.prefix && normalized.startsWith(item.prefix))
  );
}
