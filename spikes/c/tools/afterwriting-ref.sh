#!/bin/sh
# Produce the afterwriting reference PDFs. afterwriting is untrusted upstream code, so it runs only
# inside a capped container with no network and only the input (read-only) and output folders mounted.
# 1. AW=<dir>: an unpacked copy of the npm package afterwriting@1.17.3 (`npm pack afterwriting@1.17.3`),
#    with runtime dependencies installed inside the container without lifecycle scripts:
#      docker run --rm --memory=1800m --cpus=1.5 --user "$(id -u):$(id -g)" \
#        -e HOME=/tmp -v "$AW:/aw" -w /aw mcr.microsoft.com/playwright:v1.64.1-noble \
#        npm install --omit=dev --ignore-scripts --legacy-peer-deps
# 2. This script: runs the CLI on every reference/in/*.fountain with --network none.
set -eu
cd "$(dirname "$0")/.."
: "${AW:?set AW to the afterwriting package directory}"
mkdir -p reference/out
cat > reference/out/aw-config.json <<'JSON'
{"print_profile":"usletter","print_title_page":false,"show_page_numbers":true,"split_dialogue":true,"use_dual_dialogue":true,"merge_empty_lines":true,"double_space_between_scenes":false,"print_sections":false,"print_synopsis":false,"print_notes":false,"scene_continuation_bottom":false,"scene_continuation_top":false,"scenes_numbers":"none","embolden_scene_headers":false}
JSON
docker run --rm --network none --memory=1800m --cpus=1.5 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$AW:/aw:ro" -v "$PWD/reference/in:/in:ro" -v "$PWD/reference/out:/out" -w /aw \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  sh -c 'for f in /in/*.fountain; do b=$(basename $f .fountain); node awc.js --source $f --config /out/aw-config.json --pdf /out/$b.aw.pdf --overwrite >/dev/null || echo FAIL $b; done'
ls reference/out
