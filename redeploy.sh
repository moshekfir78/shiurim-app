#!/bin/sh
# Publish public/ to GitHub Pages (repo orikfir10/shiurim-app, branch main). Usage: ./update.sh && ./redeploy.sh
set -e
cd "$(dirname "$0")"
REPO=orikfir10/shiurim-app; D=.deploy
if [ ! -d $D/.git ]; then
  mkdir -p $D && git -C $D init -q -b main
  git -C $D remote add origin "https://github.com/$REPO.git"
  git -C $D config user.name "shiurim-bot"; git -C $D config user.email "orikfir10@users.noreply.github.com"
  git -C $D config credential.helper '!gh auth git-credential'
fi
find $D -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +; cp -a public/. $D/
touch $D/.nojekyll
git -C $D add -A
git -C $D commit -qm "deploy $(date -Iseconds)" || echo "no changes"
git -C $D push -q -u origin main
echo "deployed -> https://orikfir10.github.io/shiurim-app/"
