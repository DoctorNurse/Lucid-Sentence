#!/usr/bin/env bash
# Fails if a banned word appears anywhere in tracked files or file names.
# The pattern is written with character classes so this script never matches itself.
set -euo pipefail
pattern='n[o]tab[i]lity'
status=0
if git grep -n -i -I -E "$pattern" -- . ; then
  echo "::error::Banned word found in tracked files (see above)."
  status=1
fi
if git ls-files | grep -i -E "$pattern"; then
  echo "::error::Banned word found in a file name (see above)."
  status=1
fi
if [ "$status" -eq 0 ]; then echo "Banned-word check passed."; fi
exit "$status"
