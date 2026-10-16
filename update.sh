#!/bin/sh
# Update all sources, rebuild, redeploy. YouTube step is slow and can hit 429 rate limits; failures don't stop the rest.
cd "$(dirname "$0")"
python3 importers/haravhendler.py update --content
python3 importers/podcast.py || echo "podcast import failed"
python3 importers/kby.py || echo "kby import failed"
python3 importers/spotify.py || echo "spotify import failed"
[ "$SKIP_YOUTUBE" = 1 ] || python3 importers/youtube.py || echo "youtube import failed"
python3 importers/ostlv.py || echo "ostlv import failed"
python3 importers/siach.py $( [ "$SKIP_YOUTUBE" = 1 ] && echo site ) || echo "siach import failed"
python3 importers/sketches.py || echo "sketches failed"
python3 build.py && ./redeploy.sh
