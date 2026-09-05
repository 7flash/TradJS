/**
 * Import Map Generator
 *
 * Generates ESM import maps from package.json dependencies.
 * Maps npm packages to esm.sh CDN URLs with peer dependency resolution.
 */

import path from "path";
import { importMapMeasure, measureRequired } from "./measure";
import type { ImportConfig, ImportMap } from "./types";

const isDev = process.env.NODE_ENV !== "production";

interface PackageManifest {
  dependencies?: Record<string, string>;
}

interface PeerDependencyMeta {
  optional?: boolean;
}

interface BunLockPackageMetadata {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, PeerDependencyMeta>;
}

interface BunLockFile {
  packages?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asPackageManifest(value: unknown): PackageManifest | null {
  if (!isRecord(value)) return null;
  const dependencies = value.dependencies;
  if (dependencies !== undefined && !isRecord(dependencies)) return null;

  return {
    dependencies: dependencies as Record<string, string> | undefined,
  };
}

function asBunLock(value: unknown): BunLockFile | null {
  if (!isRecord(value)) return null;
  return { packages: isRecord(value.packages) ? value.packages : undefined };
}

function getLockMetadata(
  lockFile: BunLockFile | null,
  packageName: string,
): BunLockPackageMetadata | undefined {
  const entry = lockFile?.packages?.[packageName];
  if (!Array.isArray(entry)) return undefined;

  const metadata = entry[2];
  return isRecord(metadata) ? (metadata as BunLockPackageMetadata) : undefined;
}

function getPeerDependencies(
  packageName: string,
  dependencies: Record<string, string>,
  lockFile: BunLockFile | null,
): string[] {
  const metadata = getLockMetadata(lockFile, packageName);
  if (!metadata?.peerDependencies) return [];

  return Object.keys(metadata.peerDependencies).filter((peerName) => {
    const isOptional = metadata.peerDependenciesMeta?.[peerName]?.optional;
    return !isOptional && peerName in dependencies;
  });
}

function cleanVersion(version: string): string {
  return version.replace(/^[~^]/, "");
}

function splitPackageSpecifier(specifier: string): {
  baseName: string;
  subpath: string;
} {
  const parts = specifier.split("/").filter(Boolean);

  if (specifier.startsWith("@")) {
    const baseName = parts.slice(0, 2).join("/");
    return { baseName, subpath: parts.slice(2).join("/") };
  }

  return {
    baseName: parts[0] ?? specifier,
    subpath: parts.slice(1).join("/"),
  };
}

async function loadJsonFile(filePath: string): Promise<unknown> {
  return (
    await import(filePath, {
      assert: { type: "json" },
    })
  ).default;
}

export async function imports(
  subpaths: string[] = [],
  pkgJson?: unknown,
  lockFile: unknown = null,
): Promise<ImportMap> {
  // Explicit null means the caller intentionally wants no dependencies.
  if (pkgJson === null) return { imports: {} };

  let packageJsonValue: unknown = pkgJson;
  if (packageJsonValue === undefined) {
    try {
      packageJsonValue = await loadJsonFile(
        path.resolve(process.cwd(), "package.json"),
      );
    } catch {
      return { imports: {} };
    }
  }

  const packageJson = asPackageManifest(packageJsonValue);
  if (!packageJson) return { imports: {} };

  let bunLock = asBunLock(lockFile);
  if (lockFile == null) {
    try {
      bunLock = asBunLock(
        await loadJsonFile(path.resolve(process.cwd(), "bun.lock")),
      );
    } catch {
      // A lockfile is optional; package.json still provides enough information.
      bunLock = null;
    }
  }

  const dependencies = packageJson.dependencies ?? {};
  if (Object.keys(dependencies).length === 0) return { imports: {} };

  const importsConfig: Record<string, ImportConfig> = {};

  for (const [name, versionSpec] of Object.entries(dependencies)) {
    if (typeof versionSpec !== "string") continue;

    const peerDeps = getPeerDependencies(name, dependencies, bunLock);
    importsConfig[name] = {
      name,
      version: cleanVersion(versionSpec),
      ...(peerDeps.length > 0 ? { deps: peerDeps } : {}),
    };
  }

  for (const specifier of subpaths) {
    const { baseName, subpath } = splitPackageSpecifier(specifier);
    const versionSpec = dependencies[baseName];
    if (!versionSpec) continue;

    const peerDeps = getPeerDependencies(baseName, dependencies, bunLock);
    importsConfig[specifier] = {
      name: specifier,
      version: cleanVersion(versionSpec),
      ...(peerDeps.length > 0 ? { deps: peerDeps } : {}),
      baseName,
      subpath,
    };
  }

  return measureRequired(
    importMapMeasure,
    {
      label: "Generate import map",
      packages: Object.keys(importsConfig).length,
      result: (value: ImportMap) => ({
        imports: Object.keys(value.imports).length,
      }),
    },
    async () => {
      const importMap: ImportMap = { imports: {} };
      const versionMap: Record<string, string> = {};

      // First pass: collect versions for base packages.
      for (const imp of Object.values(importsConfig)) {
        const { baseName } = splitPackageSpecifier(imp.baseName || imp.name);
        versionMap[baseName] ??= imp.version ?? "latest";
      }

      // Second pass: build esm.sh URLs.
      for (const [key, imp] of Object.entries(importsConfig)) {
        const { baseName } = splitPackageSpecifier(imp.baseName || imp.name);
        const version = versionMap[baseName] || "latest";
        const useStarPrefix = imp.markAllExternal === true;
        const starPrefix = useStarPrefix ? "*" : "";

        const url = imp.subpath
          ? `https://esm.sh/${starPrefix}${baseName}@${version}/${imp.subpath}`
          : `https://esm.sh/${starPrefix}${imp.name}@${version}`;

        const queryParts: string[] = [];

        if (imp.external && !useStarPrefix) {
          let externals: string[] = [];
          if (Array.isArray(imp.external)) {
            externals = imp.external;
          } else {
            externals = Object.keys(importsConfig)
              .filter((otherKey) => otherKey !== key)
              .map((otherKey) => splitPackageSpecifier(otherKey).baseName)
              .filter((value, index, self) => self.indexOf(value) === index);
          }
          if (externals.length > 0) {
            queryParts.push(`external=${externals.join(",")}`);
          }
        }

        if (imp.deps?.length) {
          const depsList = imp.deps
            .map((depName) => {
              const depBaseName = splitPackageSpecifier(depName).baseName;
              const depVersion = versionMap[depBaseName] || "latest";
              return `${depName}@${depVersion}`;
            })
            .join(",");
          queryParts.push(`deps=${depsList}`);
        }

        if (isDev) queryParts.push("dev");

        const query = queryParts.length ? `?${queryParts.join("&")}` : "";
        importMap.imports[key] = url + query;

        if (!key.endsWith("/")) {
          // Import-map prefix targets must themselves be path prefixes. Query
          // parameters belong on the exact-package mapping, not after the slash.
          importMap.imports[`${key}/`] = `${url}/`;
        }
      }

      return importMap;
    },
  );
}
