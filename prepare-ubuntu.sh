#!/bin/bash

# Check if running as root/sudo
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (sudo)"
  exit 1
fi

echo "========================================="
echo "   📦 Preparing Ubuntu/Debian Build Environment"
echo "========================================="

# 1. Update Repositories
echo "→ Updating apt..."
apt-get update

# 2. Install Build Essentials (GCC, Make, etc.)
echo "→ Installing Build Essentials..."
apt-get install -y build-essential

# 3. Install GraphicsMagick (Required for icon resizing)
echo "→ Installing GraphicsMagick..."
apt-get install -y graphicsmagick

# 4. Install RPM Building Tools (Required to build .rpm on Ubuntu)
echo "→ Installing RPM build tools..."
apt-get install -y rpm

# 5. Install Debian Building Tools (Required for .deb targets)
echo "→ Installing Debian build tools..."
apt-get install -y dpkg-dev fakeroot

# 6. Install AppImage Requirements
# libfuse2 is required for AppImages on Ubuntu 22.04+
echo "→ Installing AppImage dependencies..."
apt-get install -y libfuse2 libarchive-tools

# 7. Install Library Dependencies
# libsecret is used for secure storage
echo "→ Installing System Libraries..."
apt-get install -y libsecret-1-dev libgl1-mesa-dev

# 8. Install Flatpak Builder
echo "→ Installing Flatpak Builder..."
apt-get install -y flatpak flatpak-builder

echo "========================================="
echo "   ✅ Ubuntu Preparation Complete!"
echo "========================================="
echo "You can now run: npm run build:linux:all"