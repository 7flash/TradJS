import type { Root } from "postcss";

const keyframesRule = /(?:^|-)keyframes$/i;
const animationProperty = /^(?:-[a-z]+-)?animation(?:-name)?$/i;
const shorthandWords: Record<string, string> = {
  ease: "timing", "ease-in": "timing", "ease-out": "timing",
  "ease-in-out": "timing", linear: "timing",
  "step-start": "timing", "step-end": "timing",
  infinite: "iteration", normal: "direction", reverse: "direction",
  alternate: "direction", "alternate-reverse": "direction",
  forwards: "fill", backwards: "fill", both: "fill", none: "fill",
  running: "play", paused: "play",
};

function rewriteAnimation(
  value: string,
  names: ReadonlyMap<string, string>,
  shorthand: boolean,
): string {
  let out = "";
  let i = 0;
  let depth = 0;
  const used = new Set<string>();
  while (i < value.length) {
    const start = i;
    if (value.startsWith("/*", i)) {
      const end = value.indexOf("*/", i + 2);
      i = end < 0 ? value.length : end + 2;
      out += value.slice(start, i);
      continue;
    }
    if (value[i] === '"' || value[i] === "'") {
      const quote = value[i++];
      while (i < value.length) {
        if (value[i] === "\\") { i = Math.min(i + 2, value.length); continue; }
        if (value[i++] === quote) break;
      }
      const raw = value.slice(start, i);
      const name = raw.slice(1, -1);
      out += depth === 0 && names.has(name)
        ? `${quote}${names.get(name)}${quote}` : raw;
      continue;
    }
    if (/[A-Za-z_-]/.test(value[i]) && !/[0-9\\]/.test(value[i - 1] ?? "")) {
      i++;
      while (i < value.length && /[\w-]/.test(value[i])) i++;
      const word = value.slice(start, i);
      const group = shorthandWords[word.toLowerCase()];
      const isFunction = /^\s*\(/.test(value.slice(i));
      let rename = depth === 0 && !isFunction;
      if (shorthand && depth === 0) {
        if (isFunction && /^(?:steps|cubic-bezier|linear)$/i.test(word))
          used.add("timing");
        if (group && !used.has(group)) { used.add(group); rename = false; }
      }
      out += rename ? names.get(word) ?? word : word;
      continue;
    }
    const ch = value[i++];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) used.clear();
    out += ch;
  }
  return out;
}

/** Namespace only definitions in this stylesheet, not globally defined animations. */
export function namespaceKeyframes(root: Root, routePattern: string): void {
  const suffix = new Bun.CryptoHasher("sha256")
    .update(routePattern).digest("hex").slice(0, 8);
  const names = new Map<string, string>();
  root.walkAtRules((atRule) => {
    if (!keyframesRule.test(atRule.name)) return;
    const name = atRule.params.trim();
    if (!name) return;
    const scoped = `${name}-${suffix}`;
    names.set(name, scoped);
    atRule.params = scoped;
  });
  if (!names.size) return;
  root.walkDecls((decl) => {
    if (!animationProperty.test(decl.prop)) return;
    const shorthand = /(?:^|-)animation$/i.test(decl.prop);
    const rewritten = rewriteAnimation(decl.value, names, shorthand);
    if (rewritten === decl.value) return;
    if (decl.raws.value) {
      decl.raws.value = {
        raw: rewriteAnimation(decl.raws.value.raw, names, shorthand),
        value: rewritten,
      };
    }
    decl.value = rewritten;
  });
}
