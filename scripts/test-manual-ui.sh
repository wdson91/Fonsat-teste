#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
project="fonsat-manual-$(date -u +%Y%m%dt%H%M%Sz)-$$"
export TEST_EVIDENCE_DIR="$root/.test-results/$project"
mkdir -p "$TEST_EVIDENCE_DIR"
compose() { docker compose -p "$project" -f compose.test.yml -f tests/compose.manual.yml "$@"; }
cleanup() {
 result=$?
 trap - EXIT INT TERM
 compose logs > "$TEST_EVIDENCE_DIR/compose.log" 2>&1 || true
 if ! compose down --volumes --rmi local > "$TEST_EVIDENCE_DIR/cleanup.log" 2>&1; then result=1; fi
 printf 'Evidências: %s
' "$TEST_EVIDENCE_DIR"
 exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose up --build --abort-on-container-exit --exit-code-from checks > "$TEST_EVIDENCE_DIR/run.log" 2>&1
