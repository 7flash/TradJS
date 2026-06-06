/**
 * tradjs/server — App Router Integration Tests
 *
 * Tests createAppRouter request handling using the showcase app as fixture.
 *
 * Run: bun test tests/app-router.test.ts
 */

import { describe, test, expect } from 'bun:test';
import path from 'path';
import { createAppRouter } from '../src/server/app-router';
import { discoverRoutes, matchRoute } from '../src/server/router';

const showcaseDir = path.join(import.meta.dir, '..', 'examples', 'showcase', 'app');

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
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/');
        const res = await handler(req) as Response;

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
    });

    test('home page contains expected HTML structure', async () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/');
        const res = await handler(req) as Response;
        const html = await res.text();

        expect(res.status).toBe(200);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('<head>');
        expect(html).toContain('<body');
        expect(html).toContain('</html>');

        // Major-version cleanup: no old Melina branding should be required.
        expect(html).not.toContain('Melina.js');
    });

    test('does not inject dev reload script into rendered pages', async () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/counter');
        const res = await handler(req) as Response;
        const html = await res.text();

        expect(res.status).toBe(200);
        expect(html).not.toContain('/__melina_hmr');
        expect(html).not.toContain('[Melina HMR] Reloading.');
        expect(html).not.toContain('/__tradjs_hmr');
        expect(html).not.toContain('[TradJS HMR] Reloading.');
    });

    test('returns 200 for nested routes', async () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/counter');
        const res = await handler(req) as Response;

        expect(res.status).toBe(200);
    });

    test('returns 404 for unknown routes', async () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/nonexistent-page');
        const res = await handler(req) as Response;

        expect(res.status).toBe(404);
    });

    test('handles API routes', async () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/api/data');
        const res = await handler(req) as Response;

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');

        const body = await res.json();
        expect(body).toBeDefined();
        expect(typeof body).toBe('object');
    });

    test('passes route params to dynamic pages', async () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/items/123');
        const res = await handler(req) as Response;
        const html = await res.text();

        expect(res.status).toBe(200);
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
    });

    test('serves client script for client-mounted pages', async () => {
        const handler = createAppRouter({
            appDir: showcaseDir,
            defaultTitle: 'Test',
        });

        const req = new Request('http://localhost:3000/counter');
        const res = await handler(req) as Response;
        const html = await res.text();

        expect(res.status).toBe(200);
        expect(html).toContain('<script');
    });
});

// ─── Route Discovery ───────────────────────────────────────────────────────────

describe('Route Discovery', () => {
    test('discovers showcase routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const patterns = routes.map((route) => route.pattern);

        expect(patterns).toContain('/');
        expect(patterns).toContain('/counter');
        expect(patterns).toContain('/api/data');
    });

    test('finds API routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const apiRoutes = routes.filter((route) => route.type === 'api');

        expect(apiRoutes.length).toBeGreaterThan(0);

        const dataApi = apiRoutes.find((route) => route.pattern === '/api/data');
        expect(dataApi).toBeDefined();
    });

    test('finds nested page routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const patterns = routes.map((route) => route.pattern);

        expect(patterns).toContain('/counter');
        expect(patterns).toContain('/features/ssg');
    });

    test('associates layouts with routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const home = routes.find((route) => route.pattern === '/');

        expect(home).toBeDefined();
        expect(home!.layouts.length).toBeGreaterThan(0);
    });
});

// ─── Route Matching ────────────────────────────────────────────────────────────

describe('Route Matching', () => {
    test('matches exact routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const match = matchRoute('/', routes);

        expect(match).not.toBeNull();
        expect(match!.route.pattern).toBe('/');
    });

    test('matches nested routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const match = matchRoute('/counter', routes);

        expect(match).not.toBeNull();
        expect(match!.route.pattern).toBe('/counter');
    });

    test('returns null for non-existent routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const match = matchRoute('/this-does-not-exist', routes);

        expect(match).toBeNull();
    });

    test('matches API routes', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const match = matchRoute('/api/data', routes);

        expect(match).not.toBeNull();
        expect(match!.route.type).toBe('api');
    });

    test('matches dynamic item route and extracts params', async () => {
        const routes = await discoverRoutes(showcaseDir);
        const match = matchRoute('/items/abc123', routes);

        expect(match).not.toBeNull();
        expect(match!.route.pattern).toBe('/items/:id');
        expect(match!.params).toEqual({ id: 'abc123' });
    });
});
