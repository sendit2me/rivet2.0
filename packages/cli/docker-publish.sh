#!/usr/bin/env bash

yarn build

VERSION=$(node -p "require('./package.json').version")

echo "Publishing version $VERSION..."

docker build -t valerypopoff/rivet-server:$VERSION -t valerypopoff/rivet-server:latest . --platform=linux/amd64
docker build -t valerypopoff/rivet-server:$VERSION-arm64 -t valerypopoff/rivet-server:latest-arm64 . --platform=linux/arm64

docker push valerypopoff/rivet-server:$VERSION
docker push valerypopoff/rivet-server:$VERSION-arm64
docker push valerypopoff/rivet-server:latest
docker push valerypopoff/rivet-server:latest-arm64
