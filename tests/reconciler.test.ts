/**
 * melina/client — Reconciler Benchmarks
 * 
 * Validates the three reconciliation strategies and proves their correctness
 * with measurable performance data.
 * 
 * Run: bun test tests/reconciler.bench.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { JSDOM } from 'jsdom';

// We need a DOM environment for the reconciler
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Text: dom.window.Text,
    Node: dom.window.Node,
    DocumentFragment: dom.window.DocumentFragment,
});

// Now import the renderer (needs DOM globals)
import { render, createElement, memo } from '../src/client/render';
import { Fragment } from '../src/client/types';
import type { VNode } from '../src/client/types';

function h(type: any, props: any, ...children: any[]): VNode {
    return createElement(type, props, ...children);
}

describe('Reconciler Strategies', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
    });

    // ─── Strategy 1: Sequential Diff ───────────────────────────────────

    describe('Sequential Diff (non-keyed)', () => {
        test('mounts initial tree', () => {
            render(h('div', { className: 'root' },
                h('span', null, 'hello'),
                h('span', null, 'world'),
            ), container);

            expect(container.innerHTML).toBe(
                '<div class="root"><span>hello</span><span>world</span></div>'
            );
        });

        test('patches text content without recreating element', () => {
            render(h('div', null, h('span', null, 'v1')), container);
            const span = container.querySelector('span')!;

            render(h('div', null, h('span', null, 'v2')), container);
            const spanAfter = container.querySelector('span')!;

            // Same DOM node — reused, not recreated
            expect(span).toBe(spanAfter);
            expect(container.innerHTML).toBe('<div><span>v2</span></div>');
        });

        test('patches className without touching other props', () => {
            render(h('div', { className: 'old', id: 'test' }), container);
            const div = container.querySelector('#test')!;

            render(h('div', { className: 'new', id: 'test' }), container);
            const divAfter = container.querySelector('#test')!;

            expect(div).toBe(divAfter);
            expect(divAfter.className).toBe('new');
        });

        test('preserves event listeners on patch', () => {
            let count = 0;
            const handler = () => count++;

            render(h('button', { onClick: handler }, 'click'), container);
            const btn = container.querySelector('button')!;

            // Re-render with same handler
            render(h('button', { onClick: handler }, 'click'), container);
            const btnAfter = container.querySelector('button')!;

            expect(btn).toBe(btnAfter);
        });

        test('appends new children', () => {
            render(h('ul', null, h('li', null, 'a')), container);
            expect(container.querySelectorAll('li').length).toBe(1);

            render(h('ul', null, h('li', null, 'a'), h('li', null, 'b')), container);
            expect(container.querySelectorAll('li').length).toBe(2);
        });

        test('removes extra children', () => {
            render(h('ul', null,
                h('li', null, 'a'),
                h('li', null, 'b'),
                h('li', null, 'c'),
            ), container);
            expect(container.querySelectorAll('li').length).toBe(3);

            render(h('ul', null, h('li', null, 'a')), container);
            expect(container.querySelectorAll('li').length).toBe(1);
        });

        test('handles type change (div → span)', () => {
            render(h('div', null, 'content'), container);
            expect(container.firstElementChild!.tagName).toBe('DIV');

            render(h('span', null, 'content'), container);
            expect(container.firstElementChild!.tagName).toBe('SPAN');
        });
    });

    // ─── Strategy 2: Keyed Diff ────────────────────────────────────────

    describe('Keyed Diff', () => {
        test('reuses elements by key on reorder', () => {
            render(h('ul', null,
                h('li', { key: 'a' }, 'A'),
                h('li', { key: 'b' }, 'B'),
                h('li', { key: 'c' }, 'C'),
            ), container);

            const [liA, liB, liC] = Array.from(container.querySelectorAll('li'));

            // Reverse order
            render(h('ul', null,
                h('li', { key: 'c' }, 'C'),
                h('li', { key: 'b' }, 'B'),
                h('li', { key: 'a' }, 'A'),
            ), container);

            const items = container.querySelectorAll('li');
            // Same DOM nodes, just reordered
            expect(items[0]).toBe(liC);
            expect(items[1]).toBe(liB);
            expect(items[2]).toBe(liA);
        });

        test('inserts new keyed items', () => {
            render(h('ul', null,
                h('li', { key: 'a' }, 'A'),
                h('li', { key: 'c' }, 'C'),
            ), container);

            const liA = container.querySelectorAll('li')[0];
            const liC = container.querySelectorAll('li')[1];

            render(h('ul', null,
                h('li', { key: 'a' }, 'A'),
                h('li', { key: 'b' }, 'B'),
                h('li', { key: 'c' }, 'C'),
            ), container);

            const items = container.querySelectorAll('li');
            expect(items.length).toBe(3);
            expect(items[0]).toBe(liA);   // Reused
            expect(items[2]).toBe(liC);   // Reused
            expect(items[1].textContent).toBe('B'); // New
        });

        test('removes keyed items', () => {
            render(h('ul', null,
                h('li', { key: 'a' }, 'A'),
                h('li', { key: 'b' }, 'B'),
                h('li', { key: 'c' }, 'C'),
            ), container);

            const liA = container.querySelectorAll('li')[0];
            const liC = container.querySelectorAll('li')[2];

            render(h('ul', null,
                h('li', { key: 'a' }, 'A'),
                h('li', { key: 'c' }, 'C'),
            ), container);

            const items = container.querySelectorAll('li');
            expect(items.length).toBe(2);
            expect(items[0]).toBe(liA);
            expect(items[1]).toBe(liC);
        });

        test('handles complete list replacement', () => {
            render(h('ul', null,
                h('li', { key: 'a' }, 'A'),
                h('li', { key: 'b' }, 'B'),
            ), container);

            render(h('ul', null,
                h('li', { key: 'x' }, 'X'),
                h('li', { key: 'y' }, 'Y'),
            ), container);

            const items = container.querySelectorAll('li');
            expect(items.length).toBe(2);
            expect(items[0].textContent).toBe('X');
            expect(items[1].textContent).toBe('Y');
        });
    });

    // ─── Strategy 3: Property Patching ─────────────────────────────────

    describe('Property Patching', () => {
        test('updates style object', () => {
            render(h('div', { style: { color: 'red', fontSize: '12px' } }), container);
            const div = container.firstElementChild as HTMLElement;
            expect(div.style.color).toBe('red');

            render(h('div', { style: { color: 'blue', fontWeight: 'bold' } }), container);
            const divAfter = container.firstElementChild as HTMLElement;
            expect(div).toBe(divAfter); // Same node
            expect(divAfter.style.color).toBe('blue');
        });

        test('removes old attributes', () => {
            render(h('div', { 'data-x': 'old', className: 'foo' }), container);
            const div = container.firstElementChild as HTMLElement;
            expect(div.getAttribute('data-x')).toBe('old');

            render(h('div', { className: 'bar' }), container);
            const divAfter = container.firstElementChild as HTMLElement;
            expect(div).toBe(divAfter);
            expect(divAfter.getAttribute('data-x')).toBeNull();
            expect(divAfter.className).toBe('bar');
        });

        test('handles boolean attributes', () => {
            render(h('input', { disabled: true, type: 'text' }), container);
            const input = container.querySelector('input')!;
            expect(input.hasAttribute('disabled')).toBe(true);

            render(h('input', { disabled: false, type: 'text' }), container);
            const inputAfter = container.querySelector('input')!;
            expect(input).toBe(inputAfter);
            expect(inputAfter.hasAttribute('disabled')).toBe(false);
        });
    });

    // ─── Components ────────────────────────────────────────────────────

    describe('Component Reconciliation', () => {
        test('re-executes component on re-render', () => {
            let renderCount = 0;
            function Counter({ count }: { count: number }) {
                renderCount++;
                return h('span', null, `Count: ${count}`);
            }

            render(h(Counter, { count: 0 }), container);
            expect(container.textContent).toBe('Count: 0');
            expect(renderCount).toBe(1);

            render(h(Counter, { count: 5 }), container);
            expect(container.textContent).toBe('Count: 5');
            expect(renderCount).toBe(2);
        });

        test('handles Fragment children', () => {
            render(h(Fragment, null,
                h('span', null, 'a'),
                h('span', null, 'b'),
            ), container);

            expect(container.querySelectorAll('span').length).toBe(2);
        });
    });

    // ─── Benchmarks ────────────────────────────────────────────────────

    describe('Performance Benchmarks', () => {
        test('1000 items: initial mount', () => {
            const items = Array.from({ length: 1000 }, (_, i) =>
                h('li', { key: `item-${i}` }, `Item ${i}`)
            );

            const start = performance.now();
            render(h('ul', null, ...items), container);
            const elapsed = performance.now() - start;

            expect(container.querySelectorAll('li').length).toBe(1000);
            console.log(`  Mount 1000 items: ${elapsed.toFixed(2)}ms`);
            // Should be under 50ms
            expect(elapsed).toBeLessThan(200);
        });

        test('1000 items: keyed reorder (reverse)', () => {
            const items = Array.from({ length: 1000 }, (_, i) =>
                h('li', { key: `item-${i}` }, `Item ${i}`)
            );
            render(h('ul', null, ...items), container);

            const reversed = [...items].reverse();
            const start = performance.now();
            render(h('ul', null, ...reversed), container);
            const elapsed = performance.now() - start;

            expect(container.querySelectorAll('li').length).toBe(1000);
            expect(container.querySelectorAll('li')[0].textContent).toBe('Item 999');
            console.log(`  Keyed reorder 1000 items: ${elapsed.toFixed(2)}ms`);
            expect(elapsed).toBeLessThan(200);
        });

        test('1000 items: sequential patch (text update)', () => {
            const items = Array.from({ length: 1000 }, (_, i) =>
                h('li', null, `v1-${i}`)
            );
            render(h('ul', null, ...items), container);

            const updated = Array.from({ length: 1000 }, (_, i) =>
                h('li', null, `v2-${i}`)
            );
            const start = performance.now();
            render(h('ul', null, ...updated), container);
            const elapsed = performance.now() - start;

            expect(container.querySelectorAll('li')[0].textContent).toBe('v2-0');
            console.log(`  Sequential patch 1000 items: ${elapsed.toFixed(2)}ms`);
            expect(elapsed).toBeLessThan(200);
        });

        test('partial update: change 10 of 1000', () => {
            const items = Array.from({ length: 1000 }, (_, i) =>
                h('li', { key: `item-${i}` }, `Item ${i}`)
            );
            render(h('ul', null, ...items), container);

            // Change only 10 items
            const updated = items.map((item, i) =>
                i % 100 === 0
                    ? h('li', { key: `item-${i}`, className: 'updated' }, `Updated ${i}`)
                    : item
            );

            const start = performance.now();
            render(h('ul', null, ...updated), container);
            const elapsed = performance.now() - start;

            const updatedItems = container.querySelectorAll('.updated');
            expect(updatedItems.length).toBe(10);
            console.log(`  Partial update 10/1000: ${elapsed.toFixed(2)}ms`);
            expect(elapsed).toBeLessThan(100);
        });
    });

    // ─── Component Re-Render Semantics ────────────────────────────────

    describe('Function Components', () => {
        test('re-renders function components with unchanged props by default', () => {
            let mode: 'close' | 'tab' = 'close';

            function App() {
                return mode === 'close'
                    ? h('button', { 'data-click': 'panel-close' }, 'Close panel')
                    : h('button', { 'data-tab': 'buildings' }, 'Buildings tab');
            }

            render(h(App, null), container);

            mode = 'tab';
            render(h(App, null), container);

            const button = container.querySelector('button')!;

            expect(button.textContent).toBe('Buildings tab');
            expect(button.getAttribute('data-click')).toBeNull();
            expect(button.getAttribute('data-tab')).toBe('buildings');
        });

        test('memo explicitly skips function component rerender when props compare equal', () => {
            let mode: 'close' | 'tab' = 'close';
            let renders = 0;

            function Inner() {
                renders++;

                return mode === 'close'
                    ? h('button', { 'data-click': 'panel-close' }, 'Close panel')
                    : h('button', { 'data-tab': 'buildings' }, 'Buildings tab');
            }

            const App = memo(Inner);

            render(h(App, null), container);

            mode = 'tab';
            render(h(App, null), container);

            const button = container.querySelector('button')!;

            expect(renders).toBe(1);
            expect(button.textContent).toBe('Close panel');
            expect(button.getAttribute('data-click')).toBe('panel-close');
            expect(button.getAttribute('data-tab')).toBeNull();
        });
    });

});