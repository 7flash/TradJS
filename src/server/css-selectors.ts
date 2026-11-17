/**
 * Small selector-only transforms used by the CSS build pipeline.
 *
 * These helpers deliberately operate on Rule#selector strings, never on raw CSS,
 * so declarations, strings, URLs, comments, and at-rule payloads are untouched.
 */

// Skip opaque lexical regions when looking for functional pseudo boundaries.
function opaqueEnd(s: string, i: number): number {
  if (s.startsWith("/*", i)) {
    const end = s.indexOf("*/", i + 2);
    return end < 0 ? s.length : end + 2;
  }
  if (s[i] === "\\") return Math.min(s.length, i + 2);
  if (s[i] !== "[" && s[i] !== "'" && s[i] !== '"') return i;
  let depth = s[i] === "[" ? 1 : 0;
  let quote: string | null = depth ? null : s[i];
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") { j++; continue; }
    if (quote) {
      if (c === quote) { quote = null; if (!depth) return j + 1; }
      continue;
    }
    if (s.startsWith("/*", j)) { j = opaqueEnd(s, j) - 1; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "[") depth++;
    if (c === "]" && --depth === 0) return j + 1;
  }
  return s.length;
}

function closingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const end = opaqueEnd(s, i);
    if (end > i) { i = end - 1; continue; }
    if (s[i] === "(") depth++;
    if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

function unwrapGlobals(s: string): string {
  let out = "";
  for (let i = 0; i < s.length;) {
    const end = opaqueEnd(s, i);
    if (end > i) { out += s.slice(i, end); i = end; continue; }
    if (s.startsWith(":global(", i)) {
      const close = closingParen(s, i + 7);
      if (close >= 0) { out += unwrapGlobals(s.slice(i + 8, close)); i = close + 1; continue; }
    }
    out += s[i++];
  }
  return out;
}

function hasLexicalToken(s: string, token: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const end = opaqueEnd(s, i);
    if (end > i) { i = end - 1; continue; }
    if (s.startsWith(token, i)) return true;
  }
  return false;
}

function isIdentChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_-]/.test(ch);
}

function isIdentStart(ch: string | undefined): boolean {
  return !!ch && (/[A-Za-z_-]/.test(ch) || ch === "\\");
}

function readCssIdentifier(
  input: string,
  start: number,
): { raw: string; end: number } {
  let i = start;
  while (i < input.length) {
    const ch = input[i];
    if (isIdentChar(ch)) {
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < input.length) {
      // Keep CSS escapes opaque. They remain stable through rewriting even if the
      // class-map key is the escaped spelling rather than a decoded identifier.
      i += 2;
      continue;
    }
    break;
  }
  return { raw: input.slice(start, i), end: i };
}

/** Split a selector list on commas that are not inside (), [], or quotes. */
export function splitSelectorList(selector: string): string[] {
  const result: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (selector.startsWith("/*", i)) {
      const end = selector.indexOf("*/", i + 2);
      i = end < 0 ? selector.length : end + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      bracketDepth++;
      continue;
    }
    if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === "(") {
      parenDepth++;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (ch === "," && parenDepth === 0 && bracketDepth === 0) {
      result.push(selector.slice(start, i));
      start = i + 1;
    }
  }

  result.push(selector.slice(start));
  return result;
}

/**
 * Rewrite class selector tokens such as `.button` without touching attribute
 * values (`[data-x=".button"]`), strings, declarations, URLs, etc.
 */
export function rewriteClassSelectors(
  selector: string,
  rename: (className: string) => string,
): { selector: string; classNames: string[] } {
  const classNames: string[] = [];
  let output = "";
  let bracketDepth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < selector.length;) {
    const ch = selector[i];

    if (escaped) {
      output += ch;
      escaped = false;
      i++;
      continue;
    }
    if (ch === "\\") {
      output += ch;
      escaped = true;
      i++;
      continue;
    }
    if (quote) {
      output += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (selector.startsWith("/*", i)) {
      const end = opaqueEnd(selector, i);
      output += selector.slice(i, end);
      i = end;
      continue;
    }
    if (bracketDepth === 0 && selector.startsWith(":global(", i)) {
      const end = closingParen(selector, i + 7);
      if (end >= 0) {
        output += selector.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      output += ch;
      i++;
      continue;
    }
    if (ch === "[") {
      bracketDepth++;
      output += ch;
      i++;
      continue;
    }
    if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      output += ch;
      i++;
      continue;
    }

    if (ch === "." && bracketDepth === 0 && isIdentStart(selector[i + 1])) {
      const { raw, end } = readCssIdentifier(selector, i + 1);
      classNames.push(raw);
      output += `.${rename(raw)}`;
      i = end;
      continue;
    }

    output += ch;
    i++;
  }

  return { selector: output, classNames };
}

function cssString(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, "\\A ")}"`;
}

function isWordBoundary(input: string, index: number): boolean {
  return !isIdentChar(input[index]);
}

/**
 * Find a top-level type selector (outside [] and functional pseudos).
 * We only use this for html/body, where injecting the route marker into the
 * existing document selector preserves semantics better than descendant-prefixing.
 */
function findTopLevelTypeSelector(selector: string, name: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i <= selector.length - name.length; i++) {
    const ch = selector[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (selector.startsWith("/*", i)) {
      const end = selector.indexOf("*/", i + 2);
      i = end < 0 ? selector.length : end + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      bracketDepth++;
      continue;
    }
    if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === "(") {
      parenDepth++;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (parenDepth !== 0 || bracketDepth !== 0) continue;
    if (!selector.startsWith(name, i)) continue;

    const before = selector[i - 1];
    const after = selector[i + name.length];
    if (
      !isWordBoundary(selector, i - 1) ||
      !isWordBoundary(selector, i + name.length)
    ) {
      continue;
    }

    // `.body`, `#body`, and `:body` are not type selectors.
    if (before === "." || before === "#" || before === ":") continue;
    // `somebody` / `bodyguard` are rejected by the word-boundary checks above.
    if (after && isIdentChar(after)) continue;

    return i;
  }

  return -1;
}

function findTopLevelRootPseudo(selector: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i <= selector.length - 5; i++) {
    const ch = selector[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (selector.startsWith("/*", i)) {
      const end = selector.indexOf("*/", i + 2);
      i = end < 0 ? selector.length : end + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      bracketDepth++;
      continue;
    }
    if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === "(") {
      parenDepth++;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      selector.startsWith(":root", i) &&
      !isIdentChar(selector[i + 5]) &&
      selector[i - 1] !== ":"
    ) {
      return i;
    }
  }
  return -1;
}

function scopeSingleSelector(selector: string, routePattern: string): string {
  const leading = selector.match(/^\s*/)?.[0] ?? "";
  const trailing = selector.match(/\s*$/)?.[0] ?? "";
  const core = selector.trim();
  if (!core) return selector;

  // Keep ordinary :where() outside the route token (specificity matters).
  const fn = /^:(is|where)\(/.exec(core);
  if (fn) {
    const end = closingParen(core, fn[0].length - 1);
    const parts = end < 0 ? [] : splitSelectorList(core.slice(fn[0].length, end));
    if (parts.some(p => /^\s*(?::global\(|:root\b|html\b|body\b)/.test(p))) {
      const branches = parts
        .map((part) => scopeSingleSelector(part, routePattern).trim()).join(",");
      return `${leading}:${fn[1]}(${branches})${core.slice(end + 1)}${trailing}`;
    }
  }

  const globalEnd = core.startsWith(":global(") ? closingParen(core, 7) : -1;
  if (globalEnd === core.length - 1) {
    return `${leading}${unwrapGlobals(core)}${trailing}`;
  }
  const unwrapped = unwrapGlobals(core);
  if (unwrapped !== core) {
    return scopeSingleSelector(`${leading}${unwrapped}${trailing}`, routePattern);
  }

  const attribute = `[data-page=${cssString(routePattern)}]`;
  const scope = `body${attribute}`;

  if (hasLexicalToken(core, scope)) return selector;

  const bodyIndex = findTopLevelTypeSelector(core, "body");
  if (bodyIndex >= 0) {
    const scoped = `${core.slice(0, bodyIndex + 4)}${attribute}${core.slice(bodyIndex + 4)}`;
    return `${leading}${scoped}${trailing}`;
  }

  const htmlIndex = findTopLevelTypeSelector(core, "html");
  if (htmlIndex >= 0) {
    const insertAt = htmlIndex + 4;
    const scoped = `${core.slice(0, insertAt)}:has(> ${scope})${core.slice(insertAt)}`;
    return `${leading}${scoped}${trailing}`;
  }

  const rootIndex = findTopLevelRootPseudo(core);
  if (rootIndex >= 0) {
    const insertAt = rootIndex + 5;
    const scoped = `${core.slice(0, insertAt)}:has(> ${scope})${core.slice(insertAt)}`;
    return `${leading}${scoped}${trailing}`;
  }

  return `${leading}${scope} ${core}${trailing}`;
}

/** Prefix every top-level selector in a selector list with the route body scope. */
export function scopeSelectorList(
  selector: string,
  routePattern: string,
  nested = false,
): string {
  // Pass nested=true for Rule children of another Rule, including through @media.
  if (nested || hasLexicalToken(selector, "&")) return selector;
  return splitSelectorList(selector)
    .map((part) => scopeSingleSelector(part, routePattern))
    .join(",");
}
