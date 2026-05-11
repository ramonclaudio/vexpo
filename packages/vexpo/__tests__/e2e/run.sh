#!/usr/bin/env bash
#
# E2E suite for the `vexpo` CLI. Builds the package, invokes the dist binary
# against real shell semantics. Safe to run anywhere — every path uses
# --dry-run / --help so nothing mutates external services or local state.
#
# Usage:
#   __tests__/e2e/run.sh              all tests
#   __tests__/e2e/run.sh GREP         only tests whose name matches GREP

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$HERE/../.." && pwd)"
CLI="$PKG_ROOT/dist/cli.js"
FIXTURES="$HERE/fixtures"
TMPROOT="$(mktemp -d -t vexpo-e2e.XXXXXX)"
trap 'rm -rf "$TMPROOT"' EXIT

GREP="${1:-}"
PASSED=0
FAILED=0
SKIPPED=0
FAILS=()

if [ ! -f "$CLI" ]; then
  echo "build vexpo first: bun --filter vexpo build" >&2
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

run_cli() {
  local sandbox="$1"
  shift
  if [ -n "$sandbox" ]; then
    (cd "$sandbox" && node "$CLI" "$@" < /dev/null 2>&1)
  else
    node "$CLI" "$@" < /dev/null 2>&1
  fi
}

make_sandbox() {
  local name="$1"
  local d="$TMPROOT/$name-$$-$RANDOM"
  mkdir -p "$d"
  if [ -f "$FIXTURES/$name.env.local" ]; then
    cp "$FIXTURES/$name.env.local" "$d/.env.local"
  fi
  if [ -f "$FIXTURES/$name.env.prod" ]; then
    cp "$FIXTURES/$name.env.prod" "$d/.env.prod"
  fi
  echo "$d"
}

# ─── Tests ──────────────────────────────────────────────────────────────────

section "Help + version"

n="vexpo --version returns version"
if match_grep "$n"; then
  out=$(run_cli "" --version)
  if [[ "$out" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then pass "$n"; else fail "$n" "got: $out"; fi
else skip "$n" "filtered"; fi

n="vexpo --help lists all subcommands"
if match_grep "$n"; then
  out=$(run_cli "" --help | strip_ansi)
  miss=""
  for cmd in lite full accounts rebrand review-account doctor convex better-auth resend apple env; do
    echo "$out" | grep -q "^  $cmd" || miss="$miss $cmd"
  done
  if [ -z "$miss" ]; then pass "$n"; else fail "$n" "missing:$miss"; fi
else skip "$n" "filtered"; fi

section "Doctor"

n="vexpo doctor exits cleanly in a fresh sandbox"
if match_grep "$n"; then
  sb="$TMPROOT/doctor-$$-$RANDOM"; mkdir -p "$sb"
  out=$(run_cli "$sb" doctor); code=$?
  if [ $code -gt 2 ]; then fail "$n" "exit $code"
  elif [ -z "$(echo "$out" | strip_ansi | tr -d '[:space:]')" ]; then fail "$n" "empty output"
  else pass "$n"; fi
else skip "$n" "filtered"; fi

n="vexpo doctor --json produces parseable JSON"
if match_grep "$n"; then
  if ! command -v python3 >/dev/null; then skip "$n" "no python3"
  else
    sb="$TMPROOT/doctor-json-$$-$RANDOM"; mkdir -p "$sb"
    out=$(run_cli "$sb" doctor --json)
    if echo "$out" | python3 -c 'import json, sys; json.load(sys.stdin)' 2>/dev/null; then pass "$n"
    else fail "$n" "not valid JSON"; fi
  fi
else skip "$n" "filtered"; fi

section "Env push"

n="vexpo env push --dry-run reports no source files when sandbox is empty"
if match_grep "$n"; then
  sb="$TMPROOT/empty-$$-$RANDOM"; mkdir -p "$sb"
  out=$(run_cli "$sb" env push --dry-run)
  if echo "$out" | strip_ansi | grep -q "no source files"; then pass "$n"
  else fail "$n" "no expected message"; fi
else skip "$n" "filtered"; fi

n="vexpo env push --dry-run with .env.local fixture"
if match_grep "$n"; then
  sb=$(make_sandbox dev-only)
  out=$(run_cli "$sb" env push --dry-run); code=$?
  if [ $code -ne 0 ]; then fail "$n" "exit $code"
  elif echo "$out" | strip_ansi | grep -qE "EXPO_PUBLIC_CONVEX_URL"; then pass "$n"
  else fail "$n" "no plan"; fi
else skip "$n" "filtered"; fi

n="vexpo env push --dry-run is side-effect free"
if match_grep "$n"; then
  sb=$(make_sandbox dev-only)
  run_cli "$sb" env push --dry-run > /dev/null
  [ -f "$sb/.setup-state.json" ] && fail "$n" "wrote state" || pass "$n"
else skip "$n" "filtered"; fi

n="vexpo env push --dry-run reports unrecognized keys"
if match_grep "$n"; then
  sb=$(make_sandbox dev-only)
  echo "BOGUS_UNKNOWN_KEY=hello" >> "$sb/.env.local"
  out=$(run_cli "$sb" env push --dry-run)
  if echo "$out" | strip_ansi | grep -qE "(unrecognized|BOGUS_UNKNOWN_KEY)"; then pass "$n"
  else fail "$n" "didn't report unknown key"; fi
else skip "$n" "filtered"; fi

section "Setup orchestrator"

n="vexpo lite --dry-run prints a phase plan"
if match_grep "$n"; then
  sb="$TMPROOT/lite-dry-$$-$RANDOM"; mkdir -p "$sb"
  out=$(run_cli "$sb" lite --dry-run); code=$?
  if [ $code -ne 0 ]; then fail "$n" "exit $code"
  elif echo "$out" | strip_ansi | grep -qE "Dry run plan|Summary|phases would run"; then pass "$n"
  else fail "$n" "no plan in output"; fi
else skip "$n" "filtered"; fi

n="vexpo full --dry-run is idempotent"
if match_grep "$n"; then
  sb="$TMPROOT/full-idem-$$-$RANDOM"; mkdir -p "$sb"
  o1=$(run_cli "$sb" full --dry-run --skip-rebrand | strip_ansi)
  o2=$(run_cli "$sb" full --dry-run --skip-rebrand | strip_ansi)
  [ "$o1" = "$o2" ] && pass "$n" || fail "$n" "outputs diverged"
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
