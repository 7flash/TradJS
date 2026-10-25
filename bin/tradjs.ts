#!/usr/bin/env bun
const args = process.argv.slice(2);
const command = args[0];
if (!command || command === "--help" || command === "-h") {
  console.log(`
🦊 tradjs — Bun-native web framework

Usage:
  bunx tradjs init <project-name>   Create a new project
  bunx tradjs init .                Create in current directory
  bunx tradjs serve                 Run ./app or route files in the current directory
  bunx tradjs build                 Build all routes & assets to disk
  bunx tradjs build --outdir ./out  Build to custom output directory
  bunx tradjs build --entry <file>  Build specific entry points

Serve options:
  [port]               Explicit port (busy ports throw)
  --appdir <dir>       App directory (default: ./app, then route files in .)
  --unix <path>        Unix socket path

Build options:
  --outdir <dir>     Output directory (default: ./dist)
  --appdir <dir>     App directory for route discovery (default: ./app)
  --css <file>       Global CSS file to process
  --entry <file>     Entry point to build (repeatable)

Options:
  --help, -h         Show this help message
`);
  process.exit(0);
}
if (command === "build") {
  const { buildToDisk, parseBuildArgs } =
    await import("../src/server/cli-build");
  const options = parseBuildArgs(args.slice(1));
  await buildToDisk(options);
  process.exit(0);
}
if (command === "serve") {
  const [{ serve }, { parseServeArgs }] = await Promise.all([
    import("../src/server"),
    import("../src/server/cli-serve"),
  ]);
  const options = parseServeArgs(args.slice(1));
  await serve(options);
  await new Promise(() => {});
}
if (command !== "init") {
  console.error(
    `Unknown command: ${command}\nRun 'bunx tradjs --help' for usage.`,
  );
  process.exit(1);
}
const projectName = args[1] || ".";
const targetDir =
  projectName === "." ? process.cwd() : `${process.cwd()}/${projectName}`;
const fs = await import("fs");
const path = await import("path");
if (projectName !== ".") {
  if (fs.existsSync(targetDir)) {
    console.error(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }
  fs.mkdirSync(targetDir, { recursive: true });
}
const appDir = path.join(targetDir, "app");
fs.mkdirSync(appDir, { recursive: true });
const files: Record<string, string> = {
  "package.json": `{
    "name": "${projectName === "." ? "my-app" : projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}",
    "version": "0.1.0",
    "type": "module",
    "scripts": {
        "dev": "tradjs serve",
        "build": "tradjs build",
        "start": "tradjs serve"
    },
    "dependencies": {
        "tradjs": "latest"
    },
    "devDependencies": {
        "@types/bun": "latest",
        "tailwindcss": "^4.0.0"
    }
}
`,
  ".gitignore": `# Dependencies
node_modules/

# Build output
dist/

# Runtime
.DS_Store
*.log
bun.lockb

# IDE
.vscode/
.idea/
*.swp
*.swo
`,
  "tsconfig.json": `{
    "compilerOptions": {
        "jsx": "react-jsx",
        "jsxImportSource": "tradjs/client",
        "baseUrl": ".",
        "paths": {
            "tradjs": ["./node_modules/tradjs/src/web.ts"],
            "tradjs/*": ["./node_modules/tradjs/src/*"]
        },
        "lib": ["ESNext", "DOM", "DOM.Iterable"],
        "target": "ESNext",
        "module": "ESNext",
        "moduleResolution": "bundler",
    "strict": true,
        "noEmit": true,
        "skipLibCheck": true
    },
    "include": ["app/**/*"]
}
`,
  "app/layout.tsx": `export default function RootLayout({ children }: { children: any }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>${projectName === "." ? "My App" : projectName}</title>
            </head>
            <body>
                <main id="tradjs-page-content">{children}</main>
            </body>
        </html>
    );
}
`,
  "app/page.tsx": `export default function HomePage() {
    return (
        <div style={{ maxWidth: '640px', margin: '80px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '16px' }}>
                🦊 ${projectName === "." ? "My App" : projectName}
            </h1>
            <p style={{ color: '#71717a', fontSize: '1.1rem', lineHeight: 1.6 }}>
                Your TradJS app is running. Edit <code>app/page.tsx</code> to get started.
            </p>
            <div id="app-root" style={{ marginTop: '32px' }} />
        </div>
    );
}
`,
  "app/page.client.tsx": `import { render } from 'tradjs/client';

function App() {
    return (
        <div style={{ padding: '20px', background: '#18181b', borderRadius: '12px', color: '#e4e4e7' }}>
            <p>✨ Client interactivity works! Edit <code>app/page.client.tsx</code> to add more.</p>
        </div>
    );
}

export default function mount() {
    const root = document.getElementById('app-root');
    if (!root) return;
    render(<App />, root);
}
`,
  "app/globals.css": `@import "tailwindcss";

@theme {
    --color-background: #0a0a0f;
    --color-surface: #111118;
    --color-foreground: #e4e4e7;
    --color-muted: #71717a;
    --color-accent: #6366f1;

    --font-sans: system-ui, -apple-system, sans-serif;
}

body {
    background: var(--color-background);
    color: var(--color-foreground);
    margin: 0;
}

code {
    background: rgba(99, 102, 241, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
}
`,
};
let written = 0;
for (const [filePath, content] of Object.entries(files)) {
  const fullPath = path.join(targetDir, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(fullPath)) {
    console.log(`  skip  ${filePath} (already exists)`);
    continue;
  }
  fs.writeFileSync(fullPath, content);
  console.log(`  create  ${filePath}`);
  written++;
}
const displayName = projectName === "." ? "current directory" : projectName;
console.log(`
🦊 Project scaffolded in ${displayName} (${written} files)
`);
console.log("  install  dependencies...");
const { spawn } = await import("child_process");
await new Promise<void>((resolve, reject) => {
  const install = spawn("bun", ["install"], {
    cwd: targetDir,
    stdio: "inherit",
    shell: false,
  });
  install.on("error", reject);
  install.on("close", (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`bun install exited with code ${code}`));
    }
  });
});
console.log(`
🦊 Done!

Next steps:
  ${projectName !== "." ? `cd ${projectName}\n  ` : ""}bun run dev

Open http://localhost:3000 to see your app.
`);
