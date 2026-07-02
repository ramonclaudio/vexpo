#!/usr/bin/env bash
#
# E2E suite for the `create-vexpo` scaffolder. Builds the package, then drives
# the dist binary against temp dirs under /tmp and asserts the scaffold output.
# Every scaffold runs with -y so prompts never block; most run --no-install so
# the suite stays fast. One opt-in install case exercises the real npm path.
#
# Usage:
#   __tests__/e2e/run.sh              all tests
#   __tests__/e2e/run.sh GREP         only tests whose name matches GREP

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$HERE/../.." && pwd)"
CLI="$PKG_ROOT/dist/index.js"
TMPROOT="$(mktemp -d -t cvx-e2e.XXXXXX)"
cleanup() { if command -v trash >/dev/null 2>&1; then trash "$TMPROOT"; else rm -rf "$TMPROOT"; fi; }
trap cleanup EXIT

# Hermetic git identity so the scaffolder's commit works on hosts without one
# (CI runners) and host gpg-sign configs can't break the suite.
export GIT_CONFIG_GLOBAL="$TMPROOT/gitconfig"
git config --file "$GIT_CONFIG_GLOBAL" user.name "cvx-e2e"
git config --file "$GIT_CONFIG_GLOBAL" user.email "cvx-e2e@localhost"
git config --file "$GIT_CONFIG_GLOBAL" commit.gpgsign false

GREP="${1:-}"
PASSED=0
FAILED=0
SKIPPED=0
FAILS=()

if [ ! -f "$CLI" ]; then
  echo "build create-vexpo first: npm run build -w @ramonclaudio/create-vexpo" >&2
  exit 1
fi

# ─── Helpers ────────────────────────────────────────────────────────────────

C_RED=$'\e[31m'
C_GREEN=$'\e[32m'
C_DIM=$'\e[2m'
C_BOLD=$'\e[1m'
C_PURPLE=$'\e[38;5;141m'
C_RESET=$'\e[0m'

section() { printf "\n${C_BOLD}${C_PURPLE}%s${C_RESET} ${C_DIM}─────────────────────────────${C_RESET}\n" "$1"; }
pass() { PASSED=$((PASSED + 1)); printf "  ${C_GREEN}✓${C_RESET} %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); FAILS+=("$1: $2"); printf "  ${C_RED}✗${C_RESET} %s\n      ${C_RED}%s${C_RESET}\n" "$1" "$2"; }
skip() { SKIPPED=$((SKIPPED + 1)); printf "  ${C_DIM}–${C_RESET} %s ${C_DIM}(skipped: %s)${C_RESET}\n" "$1" "$2"; }
strip_ansi() { sed $'s/\x1b\\[[0-9;]*[a-zA-Z]//g'; }
match_grep() { [ -z "$GREP" ] || [[ "$1" == *"$GREP"* ]]; }

# Scaffold into a fresh sandbox. Echoes the sandbox path on stdout (last line)
# and writes the scaffolder's combined output to "$sandbox/.scaffold.log".
# Usage: sb=$(scaffold <dir-name> [extra flags...])
scaffold() {
  local dir="$1"
  shift
  local sb="$TMPROOT/sb-$$-$RANDOM"
  mkdir -p "$sb"
  (cd "$sb" && node "$CLI" "$dir" "$@" < /dev/null > .scaffold.log 2>&1)
  echo "$sb"
}

# node one-liner that reads a scaffolded package.json field. Prints the value.
pkg_field() {
  local proj="$1" field="$2"
  node -e "const p=require('$proj/package.json'); const v=p['$field']; process.stdout.write(v===undefined?'__undef__':String(v));"
}

# ─── Tests ──────────────────────────────────────────────────────────────────

section "Default scaffold (-y --no-install)"

sb=$(scaffold my-app -y --no-install)
proj="$sb/my-app"

n="default scaffold creates the project dir"
if match_grep "$n"; then
  [ -d "$proj" ] && pass "$n" || fail "$n" "dir missing: $proj"
else skip "$n" "filtered"; fi

n="package.json name rewritten to the dir name"
if match_grep "$n"; then
  got=$(pkg_field "$proj" name)
  [ "$got" = "my-app" ] && pass "$n" || fail "$n" "name=$got"
else skip "$n" "filtered"; fi

n="package.json version reset to 0.0.0"
if match_grep "$n"; then
  got=$(pkg_field "$proj" version)
  [ "$got" = "0.0.0" ] && pass "$n" || fail "$n" "version=$got"
else skip "$n" "filtered"; fi

n="package.json marked private"
if match_grep "$n"; then
  got=$(pkg_field "$proj" private)
  [ "$got" = "true" ] && pass "$n" || fail "$n" "private=$got"
else skip "$n" "filtered"; fi

n="monorepo publish fields stripped from package.json"
if match_grep "$n"; then
  miss=""
  for f in author repository bugs homepage license publishConfig; do
    [ "$(pkg_field "$proj" "$f")" = "__undef__" ] || miss="$miss $f"
  done
  [ -z "$miss" ] && pass "$n" || fail "$n" "still present:$miss"
else skip "$n" "filtered"; fi

n="stripped dotfiles restored (.gitignore .env.example .npmrc)"
if match_grep "$n"; then
  miss=""
  for f in .gitignore .env.example .npmrc; do
    [ -f "$proj/$f" ] || miss="$miss $f"
  done
  # underscore placeholders must be gone, not lingering alongside
  for u in _gitignore _env.example _npmrc; do
    [ -e "$proj/$u" ] && miss="$miss leftover:$u"
  done
  [ -z "$miss" ] && pass "$n" || fail "$n" "$miss"
else skip "$n" "filtered"; fi

n="template files present (app.config.ts convex/ src/)"
if match_grep "$n"; then
  miss=""
  [ -f "$proj/app.config.ts" ] || miss="$miss app.config.ts"
  [ -d "$proj/convex" ] || miss="$miss convex/"
  [ -d "$proj/src" ] || miss="$miss src/"
  [ -z "$miss" ] && pass "$n" || fail "$n" "missing:$miss"
else skip "$n" "filtered"; fi

# The vendored local expo module (upstream expo/expo#47387) lives under
# modules/**/ios/, which an unanchored ios filter once gutted from the
# tarball. A scaffold without the Swift + podspec autolinks a module that
# cannot compile at pod install.
n="vendored ui-traits module survives scaffold (swift, podspec, config)"
if match_grep "$n"; then
  miss=""
  m="$proj/modules/vexpo-ui-traits"
  [ -f "$m/expo-module.config.json" ] || miss="$miss expo-module.config.json"
  [ -f "$m/ios/VexpoUITraitsModule.swift" ] || miss="$miss ios/VexpoUITraitsModule.swift"
  [ -f "$m/ios/VexpoUITraits.podspec" ] || miss="$miss ios/VexpoUITraits.podspec"
  [ -z "$miss" ] && pass "$n" || fail "$n" "missing:$miss"
else skip "$n" "filtered"; fi

n="git repo initialized with the initial commit"
if match_grep "$n"; then
  if [ ! -d "$proj/.git" ]; then fail "$n" "no .git dir"
  else
    msg=$(cd "$proj" && git log -1 --pretty=%s 2>/dev/null)
    [ "$msg" = "feat: initial commit" ] && pass "$n" || fail "$n" "commit subject: '$msg'"
  fi
else skip "$n" "filtered"; fi

n="initial commit working tree is clean"
if match_grep "$n"; then
  dirty=$(cd "$proj" && git status --porcelain 2>/dev/null)
  [ -z "$dirty" ] && pass "$n" || fail "$n" "uncommitted: $dirty"
else skip "$n" "filtered"; fi

section "Flag variants"

n="--no-git leaves no .git dir"
if match_grep "$n"; then
  sb=$(scaffold nogit-app -y --no-install --no-git --no-setup)
  [ ! -d "$sb/nogit-app/.git" ] && pass "$n" || fail "$n" ".git exists"
else skip "$n" "filtered"; fi

n="--no-setup suppresses the next-steps block"
if match_grep "$n"; then
  sb=$(scaffold nosetup-app -y --no-install --no-setup --no-git)
  out=$(strip_ansi < "$sb/.scaffold.log")
  if echo "$out" | grep -qE "Next steps:"; then fail "$n" "next-steps block printed"
  else pass "$n"; fi
else skip "$n" "filtered"; fi

n="default scaffold (setup on) prints the next-steps block"
if match_grep "$n"; then
  sb=$(scaffold setup-app -y --no-install --no-git)
  out=$(strip_ansi < "$sb/.scaffold.log")
  if echo "$out" | grep -qE "Next steps:"; then pass "$n"
  else fail "$n" "no next-steps block"; fi
else skip "$n" "filtered"; fi

n="no git identity: repo initialized, commit skipped with guidance"
if match_grep "$n"; then
  sb="$TMPROOT/noident-$$-$RANDOM"; mkdir -p "$sb"
  (cd "$sb" && env -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL -u EMAIL \
    GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 \
    node "$CLI" noident-app -y --no-install --no-setup < /dev/null > .scaffold.log 2>&1)
  proj="$sb/noident-app"
  out=$(strip_ansi < "$sb/.scaffold.log")
  miss=""
  [ -d "$proj/.git" ] || miss="$miss no-.git"
  (cd "$proj" && git log -1 >/dev/null 2>&1) && miss="$miss unexpected-commit"
  echo "$out" | grep -qi "no git identity" || miss="$miss no-guidance"
  [ -z "$miss" ] && pass "$n" || fail "$n" "$miss"
else skip "$n" "filtered"; fi

section "Name validation"

n="scoped name (@scope/app) rejected (ec80ff6)"
if match_grep "$n"; then
  sb="$TMPROOT/scoped-$$-$RANDOM"; mkdir -p "$sb"
  out=$(cd "$sb" && node "$CLI" "@scope/app" -y --no-install --no-git < /dev/null 2>&1); code=$?
  if [ $code -eq 0 ]; then fail "$n" "exit 0, name not rejected"
  elif echo "$out" | strip_ansi | grep -qiE "scope|invalid"; then pass "$n"
  else fail "$n" "exit $code but no rejection message"; fi
else skip "$n" "filtered"; fi

n="bare @scope name rejected"
if match_grep "$n"; then
  sb="$TMPROOT/scoped2-$$-$RANDOM"; mkdir -p "$sb"
  out=$(cd "$sb" && node "$CLI" "@acme/widget" -y --no-install --no-git < /dev/null 2>&1); code=$?
  [ $code -ne 0 ] && pass "$n" || fail "$n" "expected non-zero exit, got $code"
else skip "$n" "filtered"; fi

n="name with spaces rejected"
if match_grep "$n"; then
  sb="$TMPROOT/spaced-$$-$RANDOM"; mkdir -p "$sb"
  out=$(cd "$sb" && node "$CLI" "my app" -y --no-install --no-git < /dev/null 2>&1); code=$?
  [ $code -ne 0 ] && pass "$n" || fail "$n" "expected non-zero exit, got $code"
else skip "$n" "filtered"; fi

section "Built template payload"

n="dist/templates/default exists in the built package"
if match_grep "$n"; then
  [ -d "$PKG_ROOT/dist/templates/default" ] && pass "$n" || fail "$n" "missing dist/templates/default"
else skip "$n" "filtered"; fi

n="dist payload ships underscore-stripped dotfiles"
if match_grep "$n"; then
  miss=""
  for u in _gitignore _env.example _npmrc; do
    [ -f "$PKG_ROOT/dist/templates/default/$u" ] || miss="$miss $u"
  done
  # real dotfiles must NOT be in the tarball payload (npm strips them)
  for d in .gitignore .env.example .npmrc; do
    [ -e "$PKG_ROOT/dist/templates/default/$d" ] && miss="$miss leaked:$d"
  done
  [ -z "$miss" ] && pass "$n" || fail "$n" "$miss"
else skip "$n" "filtered"; fi

n="dist payload excludes node_modules, ios, lockfiles, local env, .dev, secret keys"
if match_grep "$n"; then
  dest="$PKG_ROOT/dist/templates/default"
  bad=""
  for d in node_modules ios android .expo .dev; do
    [ -e "$dest/$d" ] && bad="$bad $d"
  done
  for f in package-lock.json bun.lock .env.local .env.prod .setup-state.json SETUP.md DESIGN.md; do
    [ -e "$dest/$f" ] && bad="$bad $f"
  done
  # No private key may ever ship, including one staged in credentials/.
  keyleak=$(find "$dest" \( -name '*.p8' -o -name '*.p12' -o -name 'AuthKey_*' \) 2>/dev/null)
  [ -n "$keyleak" ] && bad="$bad keyleak:$keyleak"
  # The credentials/ staging dir ships its README (dir + guidance travel, keys don't).
  [ -f "$dest/credentials/README.md" ] || bad="$bad missing:credentials/README.md"
  [ -z "$bad" ] && pass "$n" || fail "$n" "leaked:$bad"
else skip "$n" "filtered"; fi

# Positive twin of the excludes test: the root ios/ must NOT ship, but the
# vendored module's nested ios/ MUST (upstream expo/expo#47387). pack-guard
# can't catch a missing file, only a leaked one, so this is the sole tripwire.
n="dist payload keeps the vendored ui-traits module intact"
if match_grep "$n"; then
  dest="$PKG_ROOT/dist/templates/default"
  miss=""
  m="$dest/modules/vexpo-ui-traits"
  [ -f "$m/expo-module.config.json" ] || miss="$miss expo-module.config.json"
  [ -f "$m/ios/VexpoUITraitsModule.swift" ] || miss="$miss ios/VexpoUITraitsModule.swift"
  [ -f "$m/ios/VexpoUITraits.podspec" ] || miss="$miss ios/VexpoUITraits.podspec"
  [ -z "$miss" ] && pass "$n" || fail "$n" "missing:$miss"
else skip "$n" "filtered"; fi

section "Full install (opt-in)"

n="scaffold WITH install lands node_modules, lockfile, committed lock"
if match_grep "$n"; then
  if [ "${CVX_E2E_INSTALL:-}" != "1" ]; then
    skip "$n" "set CVX_E2E_INSTALL=1 to run real npm install"
  else
    sb=$(scaffold installed-app -y)
    proj="$sb/installed-app"
    miss=""
    [ -d "$proj/node_modules" ] || miss="$miss node_modules"
    [ -f "$proj/package-lock.json" ] || miss="$miss package-lock.json"
    if [ -d "$proj/.git" ]; then
      git -C "$proj" ls-files --error-unmatch package-lock.json >/dev/null 2>&1 \
        || miss="$miss lock-not-committed"
    else
      miss="$miss no-git"
    fi
    [ -z "$miss" ] && pass "$n" || fail "$n" "$miss (log: $(tail -3 "$sb/.scaffold.log" | tr '\n' ' '))"
  fi
else skip "$n" "filtered"; fi

# ─── Summary ────────────────────────────────────────────────────────────────

printf "\n${C_BOLD}${C_PURPLE}Summary${C_RESET} ${C_DIM}─────────────────────────────${C_RESET}\n"
TOTAL=$((PASSED + FAILED + SKIPPED))
if [ $FAILED -eq 0 ]; then
  printf "  ${C_GREEN}%d passed${C_RESET}" "$PASSED"
  [ $SKIPPED -gt 0 ] && printf ", ${C_DIM}%d skipped${C_RESET}" "$SKIPPED"
  printf "  ${C_DIM}(of %d)${C_RESET}\n" "$TOTAL"
  exit 0
else
  printf "  ${C_GREEN}%d passed${C_RESET}, ${C_RED}%d failed${C_RESET}" "$PASSED" "$FAILED"
  [ $SKIPPED -gt 0 ] && printf ", ${C_DIM}%d skipped${C_RESET}" "$SKIPPED"
  printf "  ${C_DIM}(of %d)${C_RESET}\n\n" "$TOTAL"
  for f in "${FAILS[@]}"; do printf "  ${C_RED}✗${C_RESET} %s\n" "$f"; done
  exit 1
fi
