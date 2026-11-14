#!/bin/sh
# Timing pass, Chromium then WebKit, sequential so runs do not disturb each other.
# Serves the same build that is deployed to the phone demo host.
cd "$(dirname "$0")/.." || exit 1
export SPIKE_PORT=41741 SPIKE_DIST=dist-phone
node test/pragmas.mjs chromium plain sahpool:default,sahpool:truncate,sahpool:wal-limit,coop:default,coop:sync-normal 20 3
node test/measure.mjs chromium plain sahpool,coop 300 5
node test/cold.mjs chromium plain sahpool,coop 10
SPIKE_TAG=opfs node test/measure.mjs chromium coi opfs,opfs-wl 300 5
node test/tabs.mjs chromium coi opfs,opfs-wl 20
SPIKE_TAG=headerfree node test/measure.mjs chromium coi sahpool,coop 60 3
node test/kill.mjs chromium coi opfs 10 10
echo CHROMIUM-CHAIN-DONE
