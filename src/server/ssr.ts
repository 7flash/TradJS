/**
	 * melina — Server-Side Rendering
	 *
	 * String-based HTML renderer for VNodes. This module has ZERO DOM dependencies
	 * and runs exclusively on the server. It is never bundled into client scripts.
	 *
	 * Lives at src/server/ssr.ts (NOT inside src/client/) because src/client/ is bundled
	 * and served to the browser. SSR code must never appear in client bundles.
	 *
	 * The client renderer (client/render.ts) and this SSR renderer share types
	 * but have completely separate implementations. SSR produces strings via
	 * concatenation; client produces real DOM nodes via diffing reconciler.
	 */

import { Fragment, type VNode, type Child, type Component } from '../client/types';
import { Head } from './head';

// ─── HTML Escaping ─────────────────────────────────────────────────────

const ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

const ESCAPE_RE = /[&<>"']/g;

function escapeHtml(str: string): string {
    return str.replace(ESCAPE_RE, ch => ESCAPE_MAP[ch]);
}

// ─── Void Elements ─────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
    'meta', 'link', 'img', 'br', 'input', 'hr', 'area',
    'base', 'col', 'embed', 'param', 'source', 'track', 'wbr',
]);

// ─── renderToString ────────────────────────────────────────────────────

export function renderToString(vnode: VNode | Child): string {
    if (vnode === null || vnode === undefined || vnode === true || vnode === false) return '';
    if (typeof vnode === 'string') return escapeHtml(vnode);
    if (typeof vnode === 'number') return String(vnode);
    if (Array.isArray(vnode)) return vnode.map(child => renderToString(child)).join('');

    const { type, props } = vnode as VNode;

    // Fragment — render children only
    if (type === Fragment) return renderChildrenToString(props?.children);

    // Component — execute and render result (async support)
    if (typeof type === 'function') {
        // Head component: call for side-channel collection, render nothing in body
        if (type === Head) {
            (type as any)(props || {});
            return '';
        }
        const result = (type as Component)(props || {});
        const html = await renderToStringAsync(result);
        return html;
    }

    // HTML Element
    const tagName = type as string;
    let html = `<${tagName}`;

    const propsObj = props || {};
    for (const [key, value] of Object.entries(propsObj)) {
        if (key === 'children' || key === 'key' || key === 'ref' || key.startsWith('on')) continue;
        if (value === undefined || value === null || value === false) continue;

        if (key === 'className' || key === 'class') {
            html += ` class="${escapeHtml(String(value))}"`;
            continue;
        }

        if (key === 'style' && typeof value === 'object') {
            const styleStr = Object.entries(value)
                .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
                .join(';');
            html += ` style="${escapeHtml(styleStr)}"`;
            continue;
        }

        if (key === 'dangerouslySetInnerHTML') continue;

        if (value === true) {
            html += ` ${key}`;
        } else {
            html += ` ${key}="${escapeHtml(String(value))}"`;
        }
    }

    html += '>';

    // Void elements self-close
    if (VOID_ELEMENTS.has(tagName)) return html;

    // Inner content
    if (propsObj.dangerouslySetInnerHTML) {
        html += propsObj.dangerouslySetInnerHTML.__html;
    } else {
        html += renderChildrenToString(propsObj.children);
    }

    html += `</${tagName}>`;
    return html;
}

// ─── renderToStringAsync (async support) ─────────────────────────────────

export async function renderToStringAsync(vnode: VNode | Child | Promise<VNode | Child>): Promise<string> {
    if (vnode === null || vnode === undefined || vnode === true || vnode === false) return '';
    if (typeof vnode === 'string') return vnode;
    if (typeof vnode === 'number') return String(vnode);
    if (Array.isArray(vnode)) {
        const results = await Promise.all(vnode.map(child => renderToStringAsync(child)));
        return results.join('');
    }

    // Handle Promise from async component
    if (vnode instanceof Promise) {
        const resolved = await vnode;
        return renderToStringAsync(resolved);
    }

    const { type, props } = vnode as VNode;

    // Fragment — render children only
    if (type === Fragment) {
        const children = props?.children;
        return renderChildrenAsync(children);
    }

    // Component — execute and render result (async support)
    if (typeof type === 'function') {
        // Head component: call for side-channel collection, render nothing in body
        if (type === Head) {
            (type as any)(props || {});
            return '';
        }
        const result = (type as Component)(props || {});
        const html = await renderToStringAsync(result);
        return html;
    }

    // HTML Element
    const tagName = type as string;
    let html = `<${tagName}`;

    const propsObj = props || {};
    for (const [key, value] of Object.entries(propsObj)) {
        if (key === 'children' || key === 'key' || key === 'ref' || key.startsWith('on')) continue;
        if (value === undefined || value === null || value === false) continue;

        if (key === 'className' || key === 'class') {
            html += ` class="${escapeHtml(String(value))}"`;
            continue;
        }

        if (key === 'style' && typeof value === 'object') {
            const styleStr = Object.entries(value)
                .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
                .join(';');
            html += ` style="${escapeHtml(styleStr)}"`;
            continue;
        }

        if (key === 'dangerouslySetInnerHTML') continue;

        if (value === true) {
            html += ` ${key}`;
        } else {
            html += ` ${key}="${escapeHtml(String(value))}"`;
        }
    }

    html += '>';

    // Void elements self-close
    if (VOID_ELEMENTS.has(tagName)) return html;

    // Inner content
    if (propsObj.dangerouslySetInnerHTML) {
        html += propsObj.dangerouslySetInnerHTML.__html;
    } else {
        html += await renderChildrenAsync(propsObj.children);
    }

    html += `</${tagName}>`;
    return html;
}

// ─── Children Helper ───────────────────────────────────────────────────

function renderChildrenToString(children: Child | Child[] | undefined): string {
    if (children === undefined || children === null) return '';
    if (Array.isArray(children)) return children.map(c => renderToString(c)).join('');
    return renderToString(children);
}

async function renderChildrenAsync(children: Child | Child[] | undefined): Promise<string> {
    if (children === undefined || children === null) return '';
    if (Array.isArray(children)) {
        const results = await Promise.all(children.map(c => renderToStringAsync(c)));
        return results.join('');
    }
    return renderToStringAsync(children);
}
