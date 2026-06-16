/**
 * tradjs/server — App Router Integration Tests
 * 
 * Tests createAppRouter request handling using the showcase app as fixture.
 * 
 * Run: bun test tests/app-router.test.ts
 */

import { describe, test, expect } from 'bun:test';
import { createAppRouter, renderPage } from '../src/server/app-router';
import { createElement } from '../src/client/render';
import path from 'path';

const showcaseDir = path.join(import.meta.dir, '..', 'examples', 'showcase', 'app');

function h(type: any, props: any, ...children: any[]) {
    return createElement(type, props, ...children);
}

// ─── createAppRouter ───────────────────────────────────────────────────────────

describe('createAppRouter', () => {
    test('creates a handler function', () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test App',
        });
        expect(typeof handler).toBe('function');
    });

    test('returns 200 for home page', async () => {
        const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: 'Test' });
        const req = new Request('http://localhost:3000/');
        const res = await handler(req) as Response;
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
    });

    test('home page contains expected HTML structure', async () => {
        const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: 'Test' });
        const req = new Request('http://localhost:3000/');
        const res = await handler(req) as Response;
        const html = await res.text();

        expect(html).toContain('<html');
        expect(html).toContain('TradJS');
        expect(html).toContain('</html>');
    });

    test('does not inject dev reload script into rendered pages', async () => {
        const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: 'Test' });
        const req = new Request('http://localhost:3000/counter');
        const res = await handler(req) as Response;
        const html = await res.text();

        expect(html).not.toContain('/__tradjs_hmr');
        expect(html).not.toContain('[TradJS HMR] Reloading...');
    });

    test('returns 200 for nested routes', async () => {
        const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: 'Test' });
        const req = new Request('http://localhost:3000/counter');
        const res = await handler(req) as Response;
        expect(res.status).toBe(200);
    });

    test('returns 404 for unknown routes', async () => {
        const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: 'Test' });
        const req = new Request('http://localhost:3000/nonexistent-page');
        const res = await handler(req) as Response;
        expect(res.status).toBe(404);
    });

    test('handles API routes', async () => {
        const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: 'Test' });
        const req = new Request('http://localhost:3000/api/benchmark-ssg');
        const res = await handler(req) as Response;
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toBeDefined();
    });
});

// ─── renderPage ────────────────────────────────────────────────────────────────

describe('renderPage', () => {
    test('renders a simple component to HTML', async () => {
        function TestPage() {
            return h('div', null,
                h('h1', null, 'Test'),
                h('p', null, 'Content'),
            );
        }

        const html = await renderPage({
            component: TestPage,
            title: 'Test Page',
        });

        expect(html).toContain('<h1>Test</h1>');
        expect(html).toContain('<p>Content</p>');
        expect(html).toContain('</html>');
    });

    test('includes title in rendered HTML', async () => {
        function Page() { return h('div', null, 'hello'); }
        const html = await renderPage({ component: Page, title: 'My Title' });
        expect(html).toContain('<title>My Title</title>');
    });

    test('includes meta tags', async () => {
        function Page() { return h('div', null, 'hello'); }
        const html = await renderPage({
            component: Page,
            title: 'Test',
            meta: [{ name: 'description', content: 'A test page' }],
        });
        expect(html).toContain('name="description"');
        expect(html).toContain('content="A test page"');
    });

    test('passes params and props to component', async () => {
        function Page({ name, params }: any) {
            return h('div', null, `Hello ${name} (${params.id})`);
        }
        const html = await renderPage({
            component: Page,
            title: 'Test',
            params: { id: '42' },
            props: { name: 'World' },
        });
        expect(html).toContain('Hello World (42)');
    });
});