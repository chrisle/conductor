#!/usr/bin/env bash
# Full package script: ensures Go is installed, builds conductord, and packages the Electron app.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Git Bash on Windows sets this, which prevents cmd.exe from finding .bat files
# in the current directory — breaks node-pty/winpty's gyp build.
unset NoDefaultCurrentDirectoryInExePath

# ── Detect platform ─────────────────────────────────────────────────────────

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  arm64)  GOARCH=arm64 ;;
  x86_64) GOARCH=amd64 ;;
  *)      echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

# ── Ensure Go is installed ───────────────────────────────────────────────────

REQUIRED_GO=$(grep '^go ' "$ROOT_DIR/conductord/go.mod" | awk '{print $2}')
echo "==> Checking Go (required: $REQUIRED_GO)..."

version_ge() {
  # Returns 0 if version $1 >= $2 (X.Y or X.Y.Z format)
  local a_maj a_min b_maj b_min
  a_maj=$(echo "$1" | cut -d. -f1)
  a_min=$(echo "$1" | cut -d. -f2)
  b_maj=$(echo "$2" | cut -d. -f1)
  b_min=$(echo "$2" | cut -d. -f2)
  if [ "$a_maj" -gt "$b_maj" ]; then return 0; fi
  if [ "$a_maj" -eq "$b_maj" ] && [ "$a_min" -ge "$b_min" ]; then return 0; fi
  return 1
}

go_ok() {
  if ! command -v go &>/dev/null; then return 1; fi
  local installed
  installed=$(go version | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
  version_ge "$installed" "$REQUIRED_GO"
}

if go_ok; then
  echo "    Go $(go version | grep -oE 'go[0-9.]+') is installed."
else
  echo "    Go $REQUIRED_GO+ not found. Installing..."

  if [ "$OS" = "darwin" ]; then
    if ! command -v brew &>/dev/null; then
      echo "Homebrew is required on macOS to install Go. Install it from https://brew.sh"
      exit 1
    fi
    brew install go
    # Pick up brew-installed Go in the current shell
    eval "$(brew shellenv)"

  elif [ "$OS" = "linux" ]; then
    # Fetch the latest stable Go version from the official download API
    LATEST_GO=$(curl -fsSL "https://go.dev/dl/?mode=json" \
      | grep -oP '"version":\s*"go\K[^"]+' | head -1)
    if [ -z "$LATEST_GO" ]; then
      echo "Could not determine latest Go version. Check your internet connection."
      exit 1
    fi
    GO_TARBALL="go${LATEST_GO}.linux-${GOARCH}.tar.gz"
    echo "    Downloading Go $LATEST_GO..."
    curl -fsSL "https://go.dev/dl/$GO_TARBALL" -o "/tmp/$GO_TARBALL"
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf "/tmp/$GO_TARBALL"
    rm "/tmp/$GO_TARBALL"
    export PATH="/usr/local/go/bin:$PATH"
    echo "    Go installed to /usr/local/go — add /usr/local/go/bin to your PATH permanently."

  else
    echo "Unsupported OS: $OS"
    exit 1
  fi

  echo "    Go $(go version) ready."
fi

# ── Build conductord ─────────────────────────────────────────────────────────

echo "==> Building conductord..."
cd "$ROOT_DIR/conductord"
go build -o conductord .
cd "$ROOT_DIR"

# ── Load signing credentials from .env ───────────────────────────────────────

if [ -f "$ROOT_DIR/.env" ]; then
  echo "==> Loading .env..."
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

# electron-builder uses CSC_LINK / CSC_KEY_PASSWORD for the certificate.
# Only export when set — an empty CSC_LINK makes electron-builder treat the
# current directory as a cert path and fail with "<cwd> not a file".
if [ -n "${APPLE_CERTIFICATE_P12:-}" ]; then
  export CSC_LINK="$APPLE_CERTIFICATE_P12"
  export CSC_KEY_PASSWORD="${APPLE_CERTIFICATE_PASSWORD:-}"
  echo "    Signing with Apple certificate from \$APPLE_CERTIFICATE_P12."
else
  # Disable keychain auto-discovery so unsigned builds don't grab a random identity.
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  echo "    No APPLE_CERTIFICATE_P12 set — building with ad-hoc signature."
fi
# APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID are read by electron-builder directly

# ── Build + package Electron app ─────────────────────────────────────────────

echo "==> Packaging Electron app..."
npx electron-vite build
npx electron-builder
