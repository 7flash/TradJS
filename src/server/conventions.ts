/**
 * File-convention helpers shared by the app router and build CLI.
 *
 * Keep source-extension knowledge in one place so JS/JSX and TS/TSX routes
 * receive identical companion-file behavior.
 */
const SOURCE_EXTENSION_RE = /\.(?:tsx?|jsx?)$/i;

function replaceSourceExtension(filePath: string, replacement: string): string {
  if (!SOURCE_EXTENSION_RE.test(filePath)) {
    throw new Error(`Expected a JS/TS source file: ${filePath}`);
  }
  return filePath.replace(SOURCE_EXTENSION_RE, replacement);
}

export function clientCompanionPath(filePath: string): string {
  return replaceSourceExtension(filePath, ".client.tsx");
}

export function styleCompanionPath(filePath: string): string {
  return replaceSourceExtension(filePath, ".css");
}
