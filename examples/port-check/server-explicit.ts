import path from "path";
import { start } from "../../src/web";

const appDir = path.join(import.meta.dir, "app");

console.log("[port-check] starting explicit server on port 3000");

await start({
  port: 3000,
  appDir,
  defaultTitle: "Port Check",
});
