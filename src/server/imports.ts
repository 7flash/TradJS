/**
 * Import Map Generator
 *
 * Generates ESM import maps from package.json dependencies.
 * Maps npm packages to esm.sh CDN URLs with peer dependency resolution.
 */

import path from "path";
import { importMapMeasure } from "./measure";
import type { ImportConfig, ImportMap } from "./types";

const isDev = process.env.NODE_ENV !== "production";

export async function imports(
  subpaths: string[] = [],
  pkgJson?: any,
  lockFile: any = null,
): Promise<ImportMap> {
  // Explicit null/empty → no dependencies
  if (pkgJson === null) {
    return { imports: {} };
  }

  let packageJson: any = pkgJson;
  if (packageJson === undefined) {
    try {
      const packagePath = path.resolve(process.cwd(), "package.json");
      packageJson = (await import(packagePath, { assert: { type: "json" } }))
        .default;
    } catch (e) {
      return { imports: {} };
    }
  }

  if (!packageJson || typeof packageJson !== "object") {
    return { imports: {} };
  }

  let bunLock: any = lockFile;
  if (!bunLock) {
    try {
      bunLock = (
        await import(path.resolve(process.cwd(), "bun.lock"), {
          assert: { type: "json" },
        })
      ).default;
    } catch (e) {
      // No bun.lock file, proceeding without it
    }
  }

  const importMap: ImportMap = { imports: {} };
  const versionMap: Record<string, string> = {};
  const dependencies = {
    ...(packageJson.dependencies || {}),
  };

  // No dependencies → empty map
  if (Object.keys(dependencies).length === 0) {
    return { imports: {} };
  }

  const getCleanVersion = (version: string): string =>
    version.replace(/^[~^]/, "");

  const importsConfig: Record<string, ImportConfig> = {};

  // Process top-level dependencies
  Object.entries(dependencies).forEach(([name, versionSpec]) => {
    if (typeof versionSpec !== "string") return;

    const cleanVersion = getCleanVersion(versionSpec);
    let peerDeps: string[] = [];

    if (bunLock && bunLock.packages && bunLock.packages[name]) {
      const lockEntry = bunLock.packages[name];
      const metadata = lockEntry[2];

      if (metadata && metadata.peerDependencies) {
        Object.keys(metadata.peerDependencies).forEach((peerName) => {
          if (!metadata.peerDependenciesMeta?.[peerName]?.optional) {
            if (dependencies[peerName]) {
              peerDeps.push(peerName);
            }
          }
        });
      }
    }

    importsConfig[name] = {
      name,
      version: cleanVersion,
      ...(peerDeps.length > 0 ? { deps: peerDeps } : {}),
    };
  });

  subpaths.forEach((subpath) => {
    const [baseName, ...subpathParts] = subpath.split("/");
    const versionSpec = dependencies[baseName];
    if (!versionSpec) return;

    const cleanVersion = getCleanVersion(versionSpec);
    let peerDeps: string[] = [];

    if (bunLock && bunLock.packages && bunLock.packages[baseName]) {
      const lockEntry = bunLock.packages[baseName];
      const metadata = lockEntry[2];

      if (metadata && metadata.peerDependencies) {
        Object.keys(metadata.peerDependencies).forEach((peerName) => {
          if (!metadata.peerDependenciesMeta?.[peerName]?.optional) {
            if (dependencies[peerName]) {
              peerDeps.push(peerName);
            }
          }
        });
      }
    }

    importsConfig[subpath] = {
      name: subpath,
      version: cleanVersion,
      ...(peerDeps.length > 0 ? { deps: peerDeps } : {}),
      baseName,
      subpath: subpathParts.join("/"),
    };
  });

  await importMapMeasure.measure("Generate Import Map", async () => {
    // First pass: Collect all versions specified for base packages
    Object.entries(importsConfig).forEach(([_, imp]) => {
      const baseName =
        imp.baseName ||
        (imp.name.startsWith("@")
          ? imp.name.split("/").slice(0, 2).join("/")
          : imp.name.split("/")[0]);
      if (!versionMap[baseName] || imp.version) {
        versionMap[baseName] = imp.version ?? "latest";
      }
    });

    // Second pass: Build the import map URLs
    Object.entries(importsConfig).forEach(([key, imp]) => {
      let url: string;
      const baseName =
        imp.baseName ||
        (imp.name.startsWith("@")
          ? imp.name.split("/").slice(0, 2).join("/")
          : imp.name.split("/")[0]);
      const version = versionMap[baseName] || "latest";

      const useStarPrefix = imp.markAllExternal === true;
      const starPrefix = useStarPrefix ? "*" : "";

      if (imp.subpath) {
        url = `https://esm.sh/${starPrefix}${baseName}@${version}/${imp.subpath}`;
      } else {
        url = `https://esm.sh/${starPrefix}${imp.name}@${version}`;
      }

      let queryParts: string[] = [];

      if (imp.external && !useStarPrefix) {
        let externals: string[] = [];
        if (Array.isArray(imp.external)) {
          externals = imp.external;
        } else if (imp.external === true) {
          externals = Object.keys(importsConfig)
            .filter((otherKey) => otherKey !== key)
            .map((otherKey) => importsConfig[otherKey].name.split("/")[0])
            .filter((value, index, self) => self.indexOf(value) === index);
        }
        if (externals.length > 0) {
          queryParts.push(`external=${externals.join(",")}`);
        }
      }

      if (imp.deps?.length) {
        const depsList = imp.deps
          .map((depName) => {
            const depBaseName = depName.startsWith("@")
              ? depName.split("/").slice(0, 2).join("/")
              : depName.split("/")[0];
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
        let subQuery = query ? query.replace(/^\?/, "&") : "";
        importMap.imports[key + "/"] = url + subQuery + "/";
      }

      importMapMeasure.measure.note(`Import: ${key} → ${url + query}`);
    });
  });

  return importMap;
}
