export function Header() {
  return (
    <header className="site-header">
      <div className="shell nav-shell">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span>Mements</span>
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          <a href="/">Agents</a>
          <a href="/launch">Instances</a>
          <a href="/components">Components</a>
          <a href="/publish">Publish</a>
        </nav>
        <a className="nav-cta" href="/#create-agent">
          New wallet / agent
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-shell">
        <div>
          <a className="brand brand-footer" href="/">
            <span className="brand-mark">M</span>
            <span>Mements</span>
          </a>
          <p>Wallet-backed agents with isolated strategy instances.</p>
        </div>
        <div className="footer-links">
          <a href="/">Agents</a>
          <a href="/launch">Instances</a>
          <a href="/components">Components</a>
          <a href="/#create-agent">New agent</a>
        </div>
      </div>
    </footer>
  );
}
