#!/usr/bin/env bash
patch -s node_modules/commander/index.js < patches/commander.patch
patch -s node_modules/bitcore-p2p/node_modules/buffers/index.js < patches/buffers.patch
