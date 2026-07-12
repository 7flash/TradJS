import path from "path";
import { start } from "../../src/web";

const appDir = path.join(import.meta.dir, "app");

console.log("[port-check] starting implicit server from port 3000");

await start({
  appDir,
  defaultTitle: "Port Check",
});
