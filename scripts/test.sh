#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
run_id="$(date -u +%Y%m%dt%H%M%Sz)-$$"
project="fonsat-tests-$run_id"
export TEST_EVIDENCE_DIR="$root/.test-results/$run_id"
export TEST_GROUPS="${1:-all}"
mkdir -p "$TEST_EVIDENCE_DIR"
compose() { docker compose --project-name "$project" --file compose.test.yml "$@"; }
cleanup() {
  result=$?
  trap - EXIT INT TERM
  compose logs --no-color > "$TEST_EVIDENCE_DIR/compose.log" 2>&1 || true
  if compose down --volumes --remove-orphans --rmi local > "$TEST_EVIDENCE_DIR/cleanup.log" 2>&1; then
    printf 'Resources removed for %s\n' "$project" >> "$TEST_EVIDENCE_DIR/cleanup.log"
  else
    printf 'Cleanup failed for %s\n' "$project" >&2
    result=1
  fi
  printf 'Evidence: %s\n' "$TEST_EVIDENCE_DIR"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' "$project" > "$TEST_EVIDENCE_DIR/project.txt"
if ! compose build > "$TEST_EVIDENCE_DIR/build.log" 2>&1; then
  printf 'INFRASTRUCTURE: image build failed; see build.log\n' >&2
  exit 1
fi
set +e
compose up --abort-on-container-exit --exit-code-from checks > "$TEST_EVIDENCE_DIR/run.log" 2>&1
result=$?
set -e
printf 'Detailed container logs: %s/run.log\n' "$TEST_EVIDENCE_DIR"
if [ -f "$TEST_EVIDENCE_DIR/summary.txt" ]; then cat "$TEST_EVIDENCE_DIR/summary.txt"; fi
exit "$result"
