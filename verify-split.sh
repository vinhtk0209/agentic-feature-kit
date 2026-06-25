#!/usr/bin/env bash
# verify-split.sh <golden_dir> <new_dir>
# Compares workflow artifacts between a golden baseline directory and a new run directory.
# Prints unified diffs for any mismatch and copies mismatches to a temp directory for inspection.
# Exits 1 if any artifact differs; exits 0 if all match.
#
# Usage:
#   verify-split.sh /tmp/golden/MyFeature docs/specs/MyFeature
#   verify-split.sh /tmp/golden/MyFeature /tmp/new/MyFeature

GOLDEN=${1:?Usage: verify-split.sh <golden_dir> <new_dir>}
NEW=${2:?Usage: verify-split.sh <golden_dir> <new_dir>}

if [ ! -d "$GOLDEN" ]; then
  echo "ERROR: golden directory not found: $GOLDEN" >&2
  exit 2
fi
if [ ! -d "$NEW" ]; then
  echo "ERROR: new directory not found: $NEW" >&2
  exit 2
fi

PASS=0; FAIL=0; SKIP=0
MISMATCH_DIR="${TMPDIR:-/tmp}/verify-split-$$"

for artifact in checklist.md diagram.md ux-states.json context-summary.md; do
  g="$GOLDEN/$artifact"
  n="$NEW/$artifact"

  if [ ! -f "$g" ]; then
    echo "SKIP   : $artifact  (not in golden — cannot compare)"
    SKIP=$((SKIP+1))
    continue
  fi

  if [ ! -f "$n" ]; then
    echo "MISSING: $artifact  (in golden but not in new run)"
    FAIL=$((FAIL+1))
    continue
  fi

  if diff -q "$g" "$n" > /dev/null 2>&1; then
    echo "PASS   : $artifact"
    PASS=$((PASS+1))
  else
    echo "FAIL   : $artifact"
    echo "--- diff (golden vs new) ---"
    diff --unified=3 "$g" "$n"
    echo "--- end diff ---"
    echo ""
    mkdir -p "$MISMATCH_DIR"
    cp "$g" "$MISMATCH_DIR/${artifact}.golden"
    cp "$n" "$MISMATCH_DIR/${artifact}.new"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "--- Results: $PASS passed / $FAIL failed / $SKIP skipped ---"

if [ $FAIL -gt 0 ]; then
  echo ""
  if [ -d "$MISMATCH_DIR" ]; then
    echo "Mismatches copied to: $MISMATCH_DIR"
  fi
  echo ""
  echo "Rollback command (current phase only):"
  echo "  git checkout -- .claude/commands/feature-from-confluence.md"
  echo ""
  echo "Rollback to pre-modular tag:"
  echo "  git checkout ffc-monolith-pre-modular -- .claude/commands/feature-from-confluence.md"
  exit 1
fi

exit 0
