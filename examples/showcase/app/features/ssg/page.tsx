/**
 * This page opts into SSG — it will be pre-rendered at startup
 * and served from memory on subsequent requests.
 */
export const ssg = true;

export default function SsgDemoPage() {
    // This timestamp is baked in at build/startup time, NOT at request time
    const builtAt = new Date().toISOString();

    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">Static Site Generation (SSG)</h1>
                <p className="page-description">
                    Pre-render pages at startup, serve from memory — zero SSR on every request.
                </p>
            </div>

            <div className="demo-card" style={{ marginBottom: '24px' }}>
                <h3 className="demo-card-title">⚡ This page is pre-rendered</h3>
                <p className="demo-card-description">
                    This page was rendered at startup and cached in memory. Every request gets the identical HTML instantly —
                    no component execution, no JSX rendering, no template processing.
                </p>
                <div style={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginTop: '12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                }}>
                    <div style={{ color: 'var(--color-muted)', marginBottom: '4px' }}>Pre-rendered at:</div>
                    <div style={{ color: '#818cf8', fontWeight: '600' }} id="ssg-built-at">{builtAt}</div>
                    <div style={{ color: 'var(--color-muted)', marginTop: '8px', marginBottom: '4px' }}>Refresh this page — the timestamp stays the same!</div>
                    <div style={{ color: '#a3a3a3', fontSize: '0.8rem' }}>
                        (In production mode. Dev mode bypasses SSG cache.)
                    </div>
                </div>
            </div>

            <div className="demo-card" style={{ marginBottom: '24px' }}>
                <h3 className="demo-card-title">🔬 SSG vs SSR vs Cached SSR</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '10px', textAlign: 'left', color: 'var(--color-muted)' }}></th>
                            <th style={{ padding: '10px', textAlign: 'left', color: 'var(--color-muted)' }}>SSR</th>
                            <th style={{ padding: '10px', textAlign: 'left', color: 'var(--color-muted)' }}>Cached SSR</th>
                            <th style={{ padding: '10px', textAlign: 'left', color: '#818cf8', fontWeight: '600' }}>SSG ⚡</th>
                        </tr>
                    </thead>
                    <tbody style={{ color: 'var(--color-text-secondary)' }}>
                        <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: '10px', fontWeight: '500' }}>When rendered</td>
                            <td style={{ padding: '10px' }}>Every request</td>
                            <td style={{ padding: '10px' }}>First request</td>
                            <td style={{ padding: '10px', color: '#10b981' }}>Server startup</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: '10px', fontWeight: '500' }}>CPU per request</td>
                            <td style={{ padding: '10px' }}>Full render</td>
                            <td style={{ padding: '10px' }}>Lookup + serve</td>
                            <td style={{ padding: '10px', color: '#10b981' }}>Zero (memory read)</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: '10px', fontWeight: '500' }}>First visit latency</td>
                            <td style={{ padding: '10px' }}>~2-10ms</td>
                            <td style={{ padding: '10px' }}>~2-10ms (cold miss)</td>
                            <td style={{ padding: '10px', color: '#10b981' }}>~0.1ms (instant)</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: '10px', fontWeight: '500' }}>Dynamic data</td>
                            <td style={{ padding: '10px' }}>✅ Every request</td>
                            <td style={{ padding: '10px' }}>⚠️ Stale until TTL</td>
                            <td style={{ padding: '10px' }}>❌ Build-time only</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: '10px', fontWeight: '500' }}>Memory cost</td>
                            <td style={{ padding: '10px' }}>None (stateless)</td>
                            <td style={{ padding: '10px' }}>Per-page cache</td>
                            <td style={{ padding: '10px' }}>Per-page buffer</td>
                        </tr>
                        <tr>
                            <td style={{ padding: '10px', fontWeight: '500' }}>Invalidation</td>
                            <td style={{ padding: '10px' }}>N/A (always fresh)</td>
                            <td style={{ padding: '10px' }}>TTL + manual purge</td>
                            <td style={{ padding: '10px' }}>Server restart or API call</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="demo-card" style={{ marginBottom: '24px' }}>
                <h3 className="demo-card-title">⚙️ How to opt in</h3>
                <div className="code-block">
                    {`// Option 1: Simple — pre-render, cache forever
export const ssg = true;

// Option 2: With revalidation TTL (seconds)
// Cache expires after 60s → next request triggers fresh render
export const ssg = { revalidate: 60 };

export default function AboutPage() {
  // This runs ONCE at startup (or when cache expires)
  const builtAt = new Date().toISOString();
  return <main><h1>About Us</h1><p>Built: {builtAt}</p></main>;
}`}
                </div>
            </div>

            <div className="demo-card" style={{ marginBottom: '24px' }}>
                <h3 className="demo-card-title">🔄 Cache invalidation</h3>
                <p className="demo-card-description">Three ways to invalidate the SSG cache:</p>
                <div className="code-block">
                    {`// 1. Automatic TTL — set revalidate in seconds
export const ssg = { revalidate: 60 }; // refresh every minute

// 2. Server restart — all SSG pages re-render
//    (deploy = instant cache refresh)

// 3. Programmatic — clear from API route or middleware
import { clearSSGCache } from 'tradjs/server';

// API route to purge cache
export async function POST(req: Request) {
  clearSSGCache(); // clears all SSG pages
  return new Response('Cache cleared');
}`}
                </div>
            </div>

            <div className="demo-card" style={{ marginBottom: '24px' }}>
                <h3 className="demo-card-title">📊 Live Benchmark: SSG vs SSR vs Cached SSR</h3>
                <p className="demo-card-description">
                    Runs 100 iterations of each rendering strategy and compares response times.
                    The chart below auto-loads when you visit this page.
                </p>
                <div id="benchmark-chart" style={{
                    marginTop: '16px',
                    padding: '20px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                }}></div>
            </div>

            <div className="demo-card">
                <h3 className="demo-card-title">🎯 When to use SSG</h3>
                <ul style={{ color: 'var(--color-text-secondary)', lineHeight: '2', paddingLeft: '20px' }}>
                    <li><strong>Marketing pages</strong> — homepage, about, pricing (content rarely changes)</li>
                    <li><strong>Documentation</strong> — reference pages, API docs, changelogs</li>
                    <li><strong>Blog posts</strong> — render once, serve to millions</li>
                    <li><strong>Landing pages</strong> — maximum performance for first impressions</li>
                    <li style={{ color: '#f59e0b' }}><strong>NOT for:</strong> dashboards, user profiles, real-time data (use SSR instead)</li>
                </ul>
            </div>
        </div>
    );
}
