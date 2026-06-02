import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

describe('client navigation', () => {
    let dom: JSDOM;
    const originalGlobals = {
        window: (globalThis as any).window,
        document: (globalThis as any).document,
        DOMParser: (globalThis as any).DOMParser,
        HTMLElement: (globalThis as any).HTMLElement,
        HTMLAnchorElement: (globalThis as any).HTMLAnchorElement,
        Element: (globalThis as any).Element,
        Text: (globalThis as any).Text,
        Node: (globalThis as any).Node,
        Event: (globalThis as any).Event,
        MouseEvent: (globalThis as any).MouseEvent,
        fetch: (globalThis as any).fetch,
    };

    beforeEach(() => {
        dom = new JSDOM(
            '<!DOCTYPE html><html><head><title>Before</title><meta name="description" content="before"></head><body class="before"><main>Old</main></body></html>',
            { url: 'http://localhost/start', runScripts: 'dangerously' }
        );

        Object.assign(globalThis, {
            window: dom.window,
            document: dom.window.document,
            DOMParser: dom.window.DOMParser,
            HTMLElement: dom.window.HTMLElement,
            HTMLAnchorElement: dom.window.HTMLAnchorElement,
            Element: dom.window.Element,
            Text: dom.window.Text,
            Node: dom.window.Node,
            Event: dom.window.Event,
            MouseEvent: dom.window.MouseEvent,
        });
        (dom.window as any).scrollTo = () => {};

        (globalThis as any).fetch = async () => new Response(
            '<!DOCTYPE html><html><head><title>After</title><meta name="description" content="after"></head><body class="after"><section id="new-page">Next</section><script>window.__navScriptRuns = (window.__navScriptRuns || 0) + 1;</script></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
        );
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(originalGlobals)) {
            if (value === undefined) delete (globalThis as any)[key];
            else (globalThis as any)[key] = value;
        }
    });

    test('navigate replaces body, runs cleanups, and reactivates page scripts', async () => {
        const cleanupCalls: string[] = [];
        (window as any).__melinaCleanups__ = [
            { cleanup: () => cleanupCalls.push('cleanup-ran') },
        ];

        const { navigate } = await import('../src/client/render');
        await navigate('/next?x=1');

        expect(cleanupCalls).toEqual(['cleanup-ran']);
        expect(document.title).toBe('After');
        expect(document.body.className).toBe('after');
        expect(document.querySelector('#new-page')?.textContent).toBe('Next');
        expect(window.location.pathname).toBe('/next');
        expect(window.location.search).toBe('?x=1');
        expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('after');
        expect(document.body.querySelectorAll('script').length).toBe(1);
        expect((window as any).__melinaCleanups__).toEqual([]);
    });
});
