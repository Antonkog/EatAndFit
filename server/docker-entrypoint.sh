#!/bin/sh
set -eu

secret_source="${META_API_KEY_FILE:-/run/secrets/meta_api_key}"
if [ -f "$secret_source" ]; then
  secret_runtime=/tmp/eatandfit-meta-api-key
  umask 077
  cp "$secret_source" "$secret_runtime"
  chmod 400 "$secret_runtime"
  chown node:node "$secret_runtime"
  export META_API_KEY_FILE="$secret_runtime"
fi

exec su-exec node "$@"
