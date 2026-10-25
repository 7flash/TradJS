# Applying the TradJS improvements

This archive contains only new and modified files relative to the 105-file source scan attached on 2026-09-08. Keep an untouched checkout or a clean branch of your project before applying it. Files missing from that scan could not be inspected, so review a collision with any locally existing new file rather than overwriting it blindly.

The project files are under `changed-files/`, preserving repository-relative paths. `changes.patch` is an alternative representation of those same changes, and `manifest.json` records the original and resulting SHA-256 hashes. `review/` contains validation evidence and the optional portable test helper. Those review helpers are not part of the project overlay.

Choose one application method:

1. For a checked overlay, run `python3 apply.py /absolute/path/to/tradjs` from the extracted archive. This performs a dry run and reports mismatches without writing. If the baseline matches, run the same command with `--apply`. Already-applied files are recognized by their resulting hashes. The helper refuses symlink destinations and validates every file before starting writes.
2. Alternatively, from the matching project checkout run `git apply --check /absolute/path/to/extracted/changes.patch`, followed by `git apply /absolute/path/to/extracted/changes.patch`. Inspect the resulting diff. Do not apply the patch after applying the overlay.

There are no file deletions in this revision. Do not use an old `DELETIONS.txt` from another bundle to infer additional work. The helper does not delete unrelated files or install dependencies. Writes replace individual files; a system failure during the write phase can leave a partially applied overlay, so use the clean branch/backup for recovery.

After applying, run `bun install`, `bun run typecheck`, `bun run build`, and `NODE_ENV=development bun test`. The new dependency is `@preact/signals-core@1.14.4`; no lockfile was invented or included. Read `docs/VALIDATION.md` for the native test limitation and the additional runtime/browser checks before publishing. Version `4.3.0` was retained for this unreleased source revision.

Start with `docs/FIRST_PRINCIPLES_REVIEW.md` for the reasons behind the changes, `docs/FRONTEND.md` for signals and default components, and `docs/ANIMATIONS_AND_PERFORMANCE.md` for motion, performance, and mistakes to avoid. Migration-sensitive changes include propagated asset/SSR failures, browser import rejection for detected server dependencies, stricter Unix-socket startup, router-local static caches, private production HTML headers, and explicit HTTP method handling.
