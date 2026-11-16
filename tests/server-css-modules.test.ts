import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAppRouter } from "../src/server/app-router";
import {
  buildClientScript,
  buildCSSModule,
  builtAssets,
  clearCaches,
} from "../src/server/build";

const root = mkdtempSync(path.join(tmpdir(), "tradjs-css-module-test-"));
const appDir = path.join(root, "app");
mkdirSync(path.join(appDir, "other"), { recursive: true });
const renderer = JSON.stringify(path.resolve(import.meta.dir, "../src/client/render.ts"));
const write = (name: string, contents: string) =>
  writeFileSync(path.join(appDir, name), contents);

write("card.module.css", ".card { color: rebeccapurple; }");
write("child.ts", `
  import { createElement } from ${renderer};
  import classes from "./card.module.css";
  export function Child() {
    return createElement("p", { class: classes.card }, "child");
  }
`);
write("layout.ts", `
  import { createElement } from ${renderer};
  import classes from "./card.module.css";
  export default function Layout({ children }) {
    return createElement("html", {},
      createElement("head", {}),
      createElement("body", {},
        createElement("section", { class: classes.card }, children)));
  }
`);
write("page.ts", `
  import { createElement } from ${renderer};
  import classes from "./card.module.css";
  import { Child } from "./child";
  export default function Page() {
    return createElement("main", { class: classes.card },
      createElement(Child, {}));
  }
`);
write("page.client.tsx", `
  import classes from "./card.module.css";
  export default function mount() {
    document.body.dataset.clientClass = classes.card;
  }
`);
write("other/other.module.css", ".other { color: teal; }");
write("other/page.ts", `
  import { createElement } from ${renderer};
  import classes from "./other.module.css";
  export default function Page() {
    return createElement("article", { class: classes.other }, "other");
  }
`);

const router = createAppRouter({ appDir, viewTransitions: false });
afterAll(() => {
  clearCaches();
  rmSync(root, { recursive: true, force: true });
});

test("SSR shares a class map across page, layout and nested component", async () => {
  const response = await router(new Request("http://localhost/"));
  expect(response.status).toBe(200);
  const html = await response.text();
  const { classMap, cssUrl } = await buildCSSModule(path.join(appDir, "card.module.css"));
  expect(html.match(new RegExp(`class="${classMap.card}"`, "g"))?.length).toBe(3);
  const head = html.split("</head>")[0];
  expect(head).toContain(`<link rel="stylesheet" href="${cssUrl}">`);
  expect(html.match(new RegExp(`href="${cssUrl}"`, "g"))?.length).toBe(1);
  const css = new TextDecoder().decode(builtAssets[cssUrl].content);
  expect(css).toContain(`.${classMap.card}`);
});

test("the browser bundle uses the identical hashed class", async () => {
  const { classMap } = await buildCSSModule(path.join(appDir, "card.module.css"));
  const url = await buildClientScript(path.join(appDir, "page.client.tsx"));
  const js = new TextDecoder().decode(builtAssets[url].content);
  expect(js).toContain(classMap.card);
});

test("a second route gets its own module without leaking into the first", async () => {
  const [response, rootResponse] = await Promise.all([
    router(new Request("http://localhost/other")),
    router(new Request("http://localhost/")),
  ]);
  expect(response.status).toBe(200);
  const html = await response.text();
  const { cssUrl, classMap } = await buildCSSModule(
    path.join(appDir, "other/other.module.css"),
  );
  expect(html).toContain(`class="${classMap.other}"`);
  expect(html).toContain(`<link rel="stylesheet" href="${cssUrl}">`);
  const rootHtml = await rootResponse.text();
  expect(rootHtml).not.toContain(cssUrl);
});
