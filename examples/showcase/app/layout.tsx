import type { Child } from "tradjs/client";
import { isActive, sections } from "../navigation";
import { observeNavigation } from "../navigation-observer";
export default function RootLayout({
  children,
  pathname = "/",
}: {
  children: Child;
  pathname?: string;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>TradJS Showcase</title>
        <script
          data-tradjs-navigation-observer
          dangerouslySetInnerHTML={{
            __html: `(${observeNavigation.toString()})();`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#page-content">
          Skip to content
        </a>
        <div className="app-shell">
          <aside
            className="sidebar"
            style={{ viewTransitionName: "showcase-sidebar" }}
          >
            <div className="sidebar-header">
              <a className="sidebar-logo" href="/">
                TradJS
              </a>
              <div className="sidebar-subtitle">Framework examples</div>
            </div>
            <nav className="sidebar-nav" aria-label="Showcase">
              <a
                href="/"
                className="nav-link"
                aria-current={pathname === "/" ? "page" : undefined}
              >
                Overview
              </a>
              {sections.map((section) => (
                <div key={section.title}>
                  <div className="nav-section">{section.title}</div>
                  {section.items.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="nav-link"
                      aria-current={
                        isActive(item, pathname) ? "page" : undefined
                      }
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              ))}
            </nav>
            <div className="sidebar-footer">
              Server-rendered pages. Native links.
            </div>
          </aside>
          <main
            id="page-content"
            className="main-content"
            style={{ viewTransitionName: "showcase-content" }}
          >
            {children}
          </main>
        </div>
        <details id="navigation-diagnostics" className="navigation-diagnostics">
          <summary>Navigation diagnostics</summary>
          <div className="navigation-diagnostics-body">
            <p>
              Close this panel, follow a sidebar link, then reopen it on the
              destination page.
            </p>
            <p data-navigation-summary aria-live="polite">
              Open the panel to read the incoming navigation records.
            </p>
            <div className="navigation-diagnostics-actions">
              <button type="button" data-navigation-refresh>
                Refresh report
              </button>
              <button type="button" data-navigation-copy>
                Copy report
              </button>
            </div>
            <p data-navigation-copy-status role="status" />
            <label htmlFor="navigation-report">Navigation report</label>
            <textarea
              id="navigation-report"
              data-navigation-report
              readOnly
              rows={10}
              spellCheck={false}
            />
          </div>
        </details>
      </body>
    </html>
  );
}
