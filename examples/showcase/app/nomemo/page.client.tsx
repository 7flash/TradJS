
import { render } from 'tradjs/client';

let count = 0;

function Counter({ onDec, onInc, onReset }: { onDec: () => void; onInc: () => void; onReset: () => void }) {
    return (
        <div>
            <div style={{
                fontSize: '3.5rem',
                fontWeight: '700',
                fontFamily: 'var(--font-mono)',
                color: count > 0 ? 'var(--color-success)' : count < 0 ? 'var(--color-danger)' : 'white',
                marginBottom: '20px',
                transition: 'color 0.15s ease',
            }}>
                {count}
            </div>
            <div className="btn-group" style={{ justifyContent: 'center' }}>
                <button className="btn" onclick={onDec}>- 1</button>
                <button className="btn btn-accent" onclick={onInc}>+ 1</button>
                <button className="btn" onclick={onReset}>Reset</button>
            </div>
            <div style={{
                marginTop: '16px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-muted)',
            }}>
                State machine transitions: {count} → render() → VDOM diff → DOM patch
            </div>
        </div>
    );
}

export default function mount() {
    const root = document.getElementById('counter-root');
    const lifecycleRoot = document.getElementById('lifecycle-root');
    if (!root) return;

    const mountTime = new Date().toLocaleTimeString();

    function update() {
        render(
            <Counter
                onDec={() => { count--; update(); }}
                onInc={() => { count++; update(); }}
                onReset={() => { count = 0; update(); }}
            />,
            root!
        );
    }

    update();

    // Show lifecycle info
    if (lifecycleRoot) {
        render(
            <div>
                <div className="stat-row">
                    <span className="stat-label">mount() called</span>
                    <span className="stat-value" style={{ color: 'var(--color-accent)' }}>{mountTime}</span>
                </div>
                <div className="stat-row">
                    <span className="stat-label">Status</span>
                    <span className="stat-value" style={{ color: 'var(--color-success)' }}>✓ Active</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                    Navigate away and back to see a fresh mount time (cleanup runs on leave).
                </div>
            </div>,
            lifecycleRoot!
        );
    }

    return () => {
        count = 0;
        render(null, root);
        if (lifecycleRoot) render(null, lifecycleRoot);
    };
}
