#!/bin/bash

# Bump package version for development.
#
# Usage: ./development.sh RELEASE_VERSION

test -z "$(git status --untracked-files=no --porcelain)" || echo 'git repo must be clean' && exit 1

RELEASE_VERSION=$1

if [[ $RELEASE_VERSION == "" ]]; then
    echo "RELEASE_VERSION must be provided, e.g., 0.4.3"
    exit 1
fi

git checkout main
git merge "v${RELEASE_VERSION}"

git checkout "v${RELEASE_VERSION}"
git tag "v${RELEASE_VERSION}"

git checkout main

DEV_VERSION="${RELEASE_VERSION}.9000"

sed -i "s/$RELEASE_VERSION/$DEV_VERSION/" DESCRIPTION
sed -i "s/$RELEASE_VERSION/$DEV_VERSION/" inst/htmlwidgets/reactable.yaml
sed -i "1s/^/# reactableEdit ${DEV_VERSION} (Unreleased)\n\n/" NEWS.md

git commit -am "Bump version to ${DEV_VERSION}"

echo "
Review the changes, then run:

git push origin tag v${RELEASE_VERSION}
git push origin main"
