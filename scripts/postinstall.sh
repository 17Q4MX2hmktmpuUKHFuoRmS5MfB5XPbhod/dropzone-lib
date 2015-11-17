#!/usr/bin/env bash
find patches -iname 'patch' \
  -exec sh -c '
    PATCH="{}"
    TARGET="${PATCH%/*}"
    RELTARGET=node_modules/"${TARGET#patches/}"
    patch -l "$RELTARGET" "$PATCH"
  ' \;
echo
