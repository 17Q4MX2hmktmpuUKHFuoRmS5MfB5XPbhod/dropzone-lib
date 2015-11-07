#!/usr/bin/env bash

function apply_patch {
  PATCH="$*"
  TARGET="${PATCH%/*}"
  RELTARGET=node_modules/"${TARGET#patches/}"
  patch -l "$RELTARGET" "$PATCH"
}

export -f apply_patch

find patches -iname 'patch' \
  -exec bash -c 'apply_patch "{}"' \;

echo
