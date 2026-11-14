#!/usr/bin/env bash
# Runs every measurement configuration one after another (never in parallel).
set -u
cd "$(dirname "$0")/.."
mkdir -p measure/out
for cfg in "chromium 4" "chromium 1" "webkit 1"; do
  set -- $cfg
  echo "### $1 $2x  $(date -Is)  load $(cut -d' ' -f1-3 /proc/loadavg)"
  node measure/run.mjs "$1" "$2" 1,2,3 2>&1 | grep -v 'interactive-widget'
done
echo "### done $(date -Is)"
