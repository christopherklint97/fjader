#!/bin/sh
# Timing pass in Playwright's Linux WebKit build (not Safari on iOS).
cd "$(dirname "$0")/.." || exit 1
export SPIKE_PORT=41742 SPIKE_DIST=dist-phone
node test/measure.mjs webkit plain sahpool,coop 300 5
node test/cold.mjs webkit plain sahpool,coop 10
node test/pragmas.mjs webkit plain sahpool:default,sahpool:truncate,sahpool:wal-limit,coop:default,coop:sync-normal 20 3
SPIKE_TAG=headerfree node test/measure.mjs webkit coi sahpool,coop 60 3
echo WEBKIT-CHAIN-DONE
