#!/bin/sh
set -e
# Named volumes are often root-owned; nodeapp must own /data for SQLite + storage.
mkdir -p /data/storage
chown -R nodeapp:nodeapp /data
exec gosu nodeapp /usr/bin/tini -- node dist/main.js
