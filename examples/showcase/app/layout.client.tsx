export default function mount() {
  // Highlight active nav link based on current URL
  const path = window.location.pathname;
  document.querySelectorAll(".nav-link").forEach((link) => {
    const href =
      (link as HTMLAnchorElement).getAttribute("data-nav-href") || "";
    const isActive = href === "/" ? path === "/" : path.startsWith(href);
    link.classList.toggle("active", isActive);
  });

  return () => {};
}
