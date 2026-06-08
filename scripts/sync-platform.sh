#!/usr/bin/env bash
# scripts/sync-platform.sh — push platform changes from DocPilot-Aviator to the
# public DocPilot mirror.
#
# Workflow:
#   1. You make a platform fix in this repo (DocPilot-Aviator), commit, push.
#   2. Run `npm run sync-platform`.
#   3. The script clones DocPilot public into /tmp, rsync's every file EXCEPT
#      tenant content paths from your working copy, shows the diff, and asks
#      before committing + pushing.
#
# Tenant content paths (ALWAYS skipped — these differ between the two repos):
#   - content/                       (per-tenant docs/games/sections JSON)
#   - src/data/manualContent.ts      (Aviator manual HTML body)
#   - server/seed-state.json         (first-boot CMS state)
#   - public/images/minescape/       (Minescape screenshots)
#   - public/images/backoffice/      (back-office screenshots)
#   - public/images/manual/          (manual screenshots)
#   - .docpilot-data/                (runtime data; gitignored anyway)
#   - node_modules/                  (dependencies; gitignored)
#   - dist/                          (build output; gitignored)
#   - .git/                          (handled separately)

set -euo pipefail

PUBLIC_REMOTE="${PUBLIC_REMOTE:-https://github.com/EarendilM83/DocPilot.git}"
WORK_DIR="${SYNC_WORK_DIR:-/tmp/docpilot-public-sync}"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Paths excluded from sync (tenant content). rsync --exclude patterns.
EXCLUDES=(
  ".git/"
  # Only the sync workflow itself is Aviator-private; issue/PR templates DO sync.
  ".github/workflows/sync-to-public.yml"
  ".docpilot-data/"
  ".docpilot-smoke-data/"
  ".vite/"
  "dist/"
  "node_modules/"
  "content/"
  "src/data/manualContent.ts"
  "server/seed-state.json"
  "public/images/minescape/"
  "public/images/backoffice/"
  "public/images/manual/"
  "HANDBOOK.md"
  # Aviator-specific deploy + dev docs. Public README has generic deploy info.
  "DEPLOY-AWS.md"
  "DEPLOY.md"
  "RESTART.md"
  "BATCAVE.md"
  # Aviator content-seeding + probe + tenant-fixtured dev scripts.
  "scripts/seed-minescape/"
  "scripts/probe-aviator-users.mjs"
  "scripts/browser-smoke.mjs"
  "scripts/contrast-sweep.mjs"
  "scripts/probe-create-user-modal.mjs"
  # Tenant-fixtured e2e tests (hit /c/aviator + Minescape docs). Unit tests in src/ still sync.
  "tests/"
  # Internal planning / Batcave / local-agent config.
  ".batcave/"
  ".batcave.json"
  ".claude/"
  "docs/"
)

EXCLUDE_FLAGS=()
for p in "${EXCLUDES[@]}"; do EXCLUDE_FLAGS+=(--exclude "$p"); done

echo "→ Source:   $SOURCE_DIR"
echo "→ Public:   $PUBLIC_REMOTE"
echo "→ Workdir:  $WORK_DIR"
echo ""

# Fresh clone of the public repo into a working directory.
rm -rf "$WORK_DIR"
git clone --quiet "$PUBLIC_REMOTE" "$WORK_DIR"

# Capture the last platform commit message from the source so the public commit
# can mirror its intent.
LAST_MSG=$(git -C "$SOURCE_DIR" log -1 --format='%s')
LAST_BODY=$(git -C "$SOURCE_DIR" log -1 --format='%b')

# Rsync platform files into the public clone (delete = files removed from source
# also get removed from public, but only for paths that aren't excluded).
echo "→ Copying platform files (excluding tenant content)…"
rsync -a --delete "${EXCLUDE_FLAGS[@]}" "$SOURCE_DIR"/ "$WORK_DIR"/
echo ""

# Show the diff in the public clone.
cd "$WORK_DIR"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "→ No platform changes to sync. ✓"
  exit 0
fi

echo "================ DIFF ================"
git status --short
echo ""
echo "================ DETAIL ================"
git diff --stat
echo ""

read -r -p "Commit + push to public DocPilot? [y/N] " ans
if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
  echo "Aborted. Working clone at $WORK_DIR if you want to inspect manually."
  exit 0
fi

git add -A
git commit -m "$(printf 'sync(platform): %s\n\nMirrored from DocPilot-Aviator. Tenant content untouched.\n\n%s\n' "$LAST_MSG" "$LAST_BODY")"
git push origin main
echo ""
echo "✓ Pushed to public DocPilot."
