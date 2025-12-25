#!/bin/bash

# Check if running as root/sudo
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (sudo)"
  exit 1
fi

echo "========================================="
echo "   📦 Preparing Fedora Build Environment"
echo "========================================="

# 1. Update Repositories
echo "→ Updating system..."
dnf check-update

# 2. Install Development Tools (GCC, Make, etc.)
echo "→ Installing Development Tools..."
dnf group install -y development-tools c-development 

# 3. Install GraphicsMagick (Required for icon resizing)
echo "→ Installing GraphicsMagick..."
dnf install -y GraphicsMagick

# 4. Install RPM Building Tools (Required for .rpm targets)
echo "→ Installing RPM build tools..."
dnf install -y rpm-build rpmdevtools

# 5. Install Debian Building Tools (Required for .deb targets)
# dpkg is needed to pack .deb files even on Fedora
echo "→ Installing Debian build tools..."
dnf install -y dpkg fakeroot

# 6. Install AppImage Requirements
# libfuse2 is often needed for AppImage creation/execution
echo "→ Installing AppImage dependencies..."
dnf install -y fuse fuse-libs libarchive

# 7. Install Library Dependencies
# libsecret is used for secure storage (keytar/safeStorage in Electron)
echo "→ Installing System Libraries..."
dnf install -y libsecret-devel libglvnd-devel mesa-libGL-devel

# 8. Install Flatpak Builder (Optional, complex to config locally)
echo "→ Installing Flatpak Builder..."
dnf install -y flatpak flatpak-builder

echo "========================================="
echo "   ✅ Fedora Preparation Complete!"
echo "========================================="
echo "You can now run: npm run build:linux:all"