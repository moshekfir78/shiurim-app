#!/bin/sh
# Daily update on GitHub Actions: all importers (each failure is tolerated), then build.py.
# Spotify shows collected with a browser (spotify_avraham.py) are static data and are not re-run.
cd "$(dirname "$0")"
run() { echo "::group::$*"; timeout "${T:-1800}" "$@" || echo "::warning::failed: $*"; echo "::endgroup::"; }
run python3 importers/haravhendler.py update --content
run python3 importers/podcast.py
run python3 importers/kby.py
run python3 importers/spotify.py
run python3 importers/etzion.py
T=3600 run python3 importers/ostlv.py
T=5400 run python3 importers/youtube.py
T=3600 run python3 importers/siach.py
run python3 importers/sketches.py
python3 build.py
