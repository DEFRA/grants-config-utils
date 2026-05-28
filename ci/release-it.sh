#!/usr/bin/env bash

set -e

name=$1

version=$(jq -r '.version' "package.json")
tag="${name}-${version}"

echo "Processing $name ($tag) from: $(pwd)"

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Tag $tag already exists — skipping tagging & GitHub release."
else
  echo "Tag does not exist — running release-it for $tag..."
  npx release-it@19.0.4 --no-increment --ci || echo "Release-it failed for $tag"
fi

echo "Finished processing $tag"
