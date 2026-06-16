/**
 * CSS Modules — Unit Tests
 *
 * Tests the buildCSSModule() function that scopes class names
 * and builds CSS modules for client-side import.
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { buildCSSModule, clearCaches } from '../src/server/build';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(process.cwd(), 'test-data-css-modules');

describe('CSS Modules', () => {
    beforeAll(() => {
        fs.mkdirSync(TEST_DIR, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    });

    beforeEach(() => {
        clearCaches();
    });

    test('extracts class names and creates scoped versions', async () => {
        const cssPath = path.join(TEST_DIR, 'card.module.css');

        fs.writeFileSync(cssPath, `
.card {
    padding: 16px;
    border-radius: 8px;
}

.card-header {
    font-weight: bold;
}

.active {
    opacity: 1;
}
`);

        const result = await buildCSSModule(cssPath);

        expect(Object.keys(result.classMap)).toHaveLength(3);
        expect(result.classMap['card']).toBeDefined();
        expect(result.classMap['card-header']).toBeDefined();
        expect(result.classMap['active']).toBeDefined();

        expect(result.classMap['card']).toMatch(/^card_[a-f0-9]{8}$/);
        expect(result.classMap['card-header']).toMatch(/^card-header_[a-f0-9]{8}$/);
        expect(result.classMap['active']).toMatch(/^active_[a-f0-9]{8}$/);
    });

    test('scoped CSS contains renamed class selectors', async () => {
        const cssPath = path.join(TEST_DIR, 'button.module.css');

        fs.writeFileSync(cssPath, `
.btn {
    cursor: pointer;
}

.btn-primary {
    background: blue;
}
`);

        const result = await buildCSSModule(cssPath);

        expect(result.css).toContain(result.classMap['btn']);
        expect(result.css).toContain(result.classMap['btn-primary']);
        expect(result.css).toContain('cursor: pointer');
        expect(result.css).toContain('background: blue');

        expect(result.css).not.toContain('.btn {');
        expect(result.css).not.toContain('.btn-primary {');
    });

    test('returns a valid CSS URL path', async () => {
        const cssPath = path.join(TEST_DIR, 'nav.module.css');

        fs.writeFileSync(cssPath, `.nav { display: flex; }`);

        const result = await buildCSSModule(cssPath);

        // Current builder normalizes "nav.module.css" to "nav-module-[hash].css".
        expect(result.cssUrl).toMatch(/^\/nav-module-[a-f0-9]{8}\.css$/);
    });

    test('different files produce different hashes', async () => {
        const cssPath1 = path.join(TEST_DIR, 'a.module.css');
        const cssPath2 = path.join(TEST_DIR, 'b.module.css');

        fs.writeFileSync(cssPath1, `.box { color: red; }`);
        fs.writeFileSync(cssPath2, `.box { color: blue; }`);

        const result1 = await buildCSSModule(cssPath1);
        const result2 = await buildCSSModule(cssPath2);

        expect(result1.classMap['box']).not.toBe(result2.classMap['box']);
        expect(result1.cssUrl).not.toBe(result2.cssUrl);
    });

    test('handles pseudo-selectors and combinators', async () => {
        const cssPath = path.join(TEST_DIR, 'pseudo.module.css');

        fs.writeFileSync(cssPath, `
.button:hover {
    opacity: 0.9;
}

.card .title {
    font-size: 20px;
}

.list > .item {
    padding: 4px;
}
`);

        const result = await buildCSSModule(cssPath);

        expect(result.classMap['button']).toBeDefined();
        expect(result.classMap['card']).toBeDefined();
        expect(result.classMap['title']).toBeDefined();
        expect(result.classMap['list']).toBeDefined();
        expect(result.classMap['item']).toBeDefined();

        expect(result.css).toContain(`.${result.classMap['button']}:hover`);
        expect(result.css).toContain(`.${result.classMap['card']} .${result.classMap['title']}`);
        expect(result.css).toContain(`.${result.classMap['list']} > .${result.classMap['item']}`);
    });

    test('handles @media queries with scoped classes inside', async () => {
        const cssPath = path.join(TEST_DIR, 'responsive.module.css');

        fs.writeFileSync(cssPath, `
.container {
    display: grid;
}

@media (max-width: 600px) {
    .container {
        display: block;
    }

    .item {
        margin: 8px;
    }
}
`);

        const result = await buildCSSModule(cssPath);

        expect(result.classMap['container']).toBeDefined();
        expect(result.classMap['item']).toBeDefined();

        expect(result.css).toContain('@media');
        expect(result.css).toContain(result.classMap['container']);
        expect(result.css).toContain(result.classMap['item']);
    });

    test('throws on non-existent file', async () => {
        await expect(buildCSSModule('/nonexistent/file.module.css')).rejects.toThrow('CSS module not found');
    });
});
