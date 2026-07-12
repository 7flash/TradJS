import { start } from "../../src/web";
import path from "path";

const appDir = path.join(import.meta.dir, "app");

await start({
  appDir,
  defaultTitle: "Melina.js Showcase",
});
