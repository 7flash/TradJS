import { sections } from "../navigation";
export default function HomePage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">TradJS, in practice</h1>
        <p className="page-description">
          Server-rendered pages, native browser navigation, and small
          interactive views. Explore each part of the framework below.
        </p>
      </div>
      <div className="demo-card">
        <h2 className="demo-card-title">One document per page</h2>
        <p className="demo-card-description">
          Every link loads a real page. TradJS enables native cross-document
          view transitions automatically; the shared sidebar stays visually
          steady while the page content changes in supporting browsers.
        </p>
        <p className="demo-card-description">
          Interactive views use ordinary state and explicit render calls.
          Controllers change state; JSX describes the result. Try the counter,
          then the subtree rendering example.
        </p>
      </div>
      {sections.map((section) => (
        <section
          key={section.title}
          className="overview-section"
          aria-label={section.title}
        >
          <h2>{section.title}</h2>
          <div className="feature-grid">
            {section.items.map((item) => (
              <a key={item.href} href={item.href} className="feature-card">
                <h3 className="feature-card-title">{item.label}</h3>
                <p className="feature-card-desc">{item.description}</p>
                <span className="feature-card-action" aria-hidden="true">
                  Open example →
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
