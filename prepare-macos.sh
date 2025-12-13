#!/bin/bash

# Check if running as root (Homebrew should NOT be run as root)
if [ "$EUID" -eq 0 ]; then 
  echo "❌ Please run this script as a normal user (without sudo)."
  exit 1
fi

echo "========================================="
echo "   🍎 Preparing macOS Build Environment"
echo "========================================="

# 1. Check/Install Homebrew
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. It is required to install dependencies."
    echo "Please run this command to install Homebrew, then re-run this script:"
    echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
fi

echo "→ Updating Homebrew..."
brew update

# 2. Install Node.js (LTS)
if ! command -v node &> /dev/null; then
    echo "→ Installing Node.js..."
    brew install node
else
    echo "✔ Node.js is already installed ($(node -v))."
fi

# 3. Install GraphicsMagick (Required by electron-builder for icon processing)
echo "→ Installing GraphicsMagick..."
brew install graphicsmagick

# 4. Install Git LFS (Required for pulling large binaries in vendor folder)
echo "→ Installing Git LFS..."
brew install git-lfs
git lfs install

# 5. Check/Install Xcode Command Line Tools
# Required for native module compilation (sqlite3) and code signing tools (codesign)
echo "→ Checking Xcode Command Line Tools..."
if xcode-select -p &> /dev/null; then
    echo "✔ Xcode Command Line Tools are installed."
else
    echo "→ Installing Xcode Command Line Tools..."
    xcode-select --install
    echo "⚠️  A system dialog has appeared. Please follow the prompts to install the tools."
    echo "   Once the installation finishes, run this script again."
    exit 0
fi

# 6. Install Python (Optional fallback)
# While the project uses a portable python, system python is sometimes needed for build scripts
if ! command -v python3 &> /dev/null; then
    echo "→ Installing Python 3..."
    brew install python
fi

echo "========================================="
echo "   ✅ macOS Preparation Complete!"
echo "========================================="
echo "You can now run:"
echo "  1. npm install"
echo "  2. npm run build"