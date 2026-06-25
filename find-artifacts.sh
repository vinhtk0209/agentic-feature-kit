#!/usr/bin/env bash
# find-artifacts.sh <FeatureName>
# Discovers where this workflow wrote artifacts for a completed feature run.
# Does NOT assume docs/specs/<Feature>/ — uses find to locate the actual path.

F=${1:?Usage: find-artifacts.sh <FeatureName>}

# Primary discovery: find checklist.md under any path containing the feature name
BASE=$(find . \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -name "checklist.md" \
  | while read -r p; do
      dir=$(dirname "$p")
      if echo "$dir" | grep -qi "$F"; then
        echo "$dir"
        break
      fi
    done)

if [ -z "$BASE" ]; then
  # Fallback: find by any of the known artifact names
  BASE=$(find . \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    \( -name "diagram.md" -o -name "ux-states.json" -o -name "context-summary.md" \) \
    | while read -r p; do
        dir=$(dirname "$p")
        if echo "$dir" | grep -qi "$F"; then
          echo "$dir"
          break
        fi
      done)
fi

if [ -z "$BASE" ]; then
  echo "ERROR: No artifacts found for feature: $F" >&2
  echo "Searched for checklist.md, diagram.md, ux-states.json, context-summary.md" >&2
  exit 1
fi

echo "Artifact base path: $BASE"
echo ""

FOUND=0; MISSING=0
for artifact in checklist.md diagram.md ux-states.json context-summary.md; do
  f="$BASE/$artifact"
  if [ -f "$f" ]; then
    echo "  FOUND  : $f"
    FOUND=$((FOUND+1))
  else
    echo "  MISSING: $BASE/$artifact"
    MISSING=$((MISSING+1))
  fi
done

echo ""
echo "--- $FOUND found / $MISSING missing ---"
[ $MISSING -eq 0 ]
