#!/bin/bash
set -e

# Define image name
IMAGE_NAME="livestream-builder"

echo "========================================="
echo "   🐳 Building Docker Image: $IMAGE_NAME"
echo "========================================="

# Build the docker image
docker build -t "$IMAGE_NAME" .

echo "========================================="
echo "   🚀 Running Build in Docker"
echo "========================================="

# Determine the host user ID and Group ID to fix permissions later
HOST_UID=$(id -u)
HOST_GID=$(id -g)

# Run the container
# -v $(pwd):/app            : Mount current directory to /app
# -v /app/node_modules      : Use a volume for node_modules to avoid conflicts with host
# --device /dev/fuse        : Required for AppImage creation
# --cap-add SYS_ADMIN       : Required for FUSE/AppImage
# --security-opt apparmor:unconfined : Often needed for Electron builds in Docker
# -e HOST_UID...            : Pass IDs for permission fix
docker run --rm \
  -v "$(pwd)":/app \
  -v /app/node_modules \
  --device /dev/fuse \
  --cap-add SYS_ADMIN \
  --security-opt apparmor:unconfined \
  -e HOST_UID="$HOST_UID" \
  -e HOST_GID="$HOST_GID" \
  "$IMAGE_NAME" \
  /bin/bash -c "
    set -e

    echo '→ Installing dependencies (npm ci)...'
    npm ci

    echo '→ Preparing environment...'
    # We ensure large files are joined
    npm run files:join

    # Hydrate Python environment (downloads binaries if missing)
    echo '→ Hydrating Python environment...'
    npm run env:update

    echo '→ Building Linux Artifacts...'
    # Run the CI build command
    npm run build:linux:ci

    echo '→ Fixing permissions for release/ directory...'
    chown -R \$HOST_UID:\$HOST_GID release/linux || true

    echo '✅ Build Complete! Artifacts are in release/linux/'
  "

echo "========================================="
echo "   🎉 Done!"
echo "========================================="
