#!/bin/sh

PROJECT_DIR=${PROJECT_DIR:-/project}

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Project directory '$PROJECT_DIR' does not exist."
  exit 1
fi

exec npx @valerypopoff/rivet2-cli serve "$PROJECT_DIR" "$@"
