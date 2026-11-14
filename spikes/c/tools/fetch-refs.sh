#!/bin/sh
# Download the public reference scripts into reference/in (not committed).
# Sources: fountain.io's sample scripts (Fountain, FDX and Final Draft PDF), afterwriting's own
# samples and test fixtures (MIT, https://github.com/ifrost/afterwriting-labs at f1912c08),
# and the Academy Nicholl formatting sample (oscars.org blocks scripted clients; Wayback copy).
set -eu
cd "$(dirname "$0")/.."
mkdir -p reference/in
cd reference/in
for n in Big-Fish Brick-\&-Steel The-Last-Birthday-Card; do
  slug=$(echo "$n" | tr 'A-Z' 'a-z' | sed 's/-&-/-and-/')
  for e in fountain fdx pdf; do
    curl -sfL "https://fountain.io/_downloads/$n.$e" -o "$slug.$e"
  done
  mv "$slug.pdf" "$slug.fd.pdf"
done
AW=https://raw.githubusercontent.com/ifrost/afterwriting-labs/f1912c08d0905bac42e1805830a1e72f98b88c2f
curl -sfL "$AW/samples/my_living_memory.fountain" -o aw-my-living-memory.fountain
curl -sfL "$AW/samples/printing_trouble.fountain" -o aw-printing-trouble.fountain
curl -sfL "$AW/test/data/screenplays/test.fountain" -o aw-test.fountain
curl -sfL "https://web.archive.org/web/2024id_/https://www.oscars.org/sites/oscars/files/scriptsample.pdf" -o nicholl.pdf
ls -la
cd ../..
for p in 30 120 500; do bun run src/fixtures/stress.ts $p 7 > reference/in/stress-$p.fountain; done
