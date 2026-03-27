#!/usr/bin/env bash
# Bundles a self-contained tmux binary (+ required dylibs) for embedding
# in the conductord binary via //go:embed.
#
# Run this once before building conductord:
#   bash scripts/prepare-tmux.sh
#
# Output: conductord/embedded/<os>-<arch>/
#   tmux              patched binary
#   lib*.dylib        non-system dependencies (macOS only)
set -euo pipefail

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  arm64)  ARCH=arm64 ;;
  x86_64) ARCH=amd64 ;;
  *)      echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

DEST="conductord/embedded/${OS}-${ARCH}"
mkdir -p "$DEST"

echo "==> Bundling tmux for ${OS}/${ARCH} → ${DEST}/"

# ── macOS ──────────────────────────────────────────────────────────────────
if [ "$OS" = "darwin" ]; then
  if ! command -v brew &>/dev/null; then
    echo "Homebrew is required on macOS. Install from https://brew.sh"
    exit 1
  fi

  echo "--> Ensuring tmux + deps are installed via Homebrew..."
  brew install tmux libevent ncurses utf8proc --quiet 2>&1 | tail -5

  TMUX_BIN=$(realpath "$(brew --prefix tmux)/bin/tmux")
  echo "--> Source binary: $TMUX_BIN"

  # Copy tmux binary
  cp "$TMUX_BIN" "$DEST/tmux"
  chmod 755 "$DEST/tmux"

  # Collect non-system dylibs and patch references to @executable_path
  echo "--> Bundling dylibs..."
  while IFS= read -r line; do
    # otool lines look like: "  /path/to/lib.dylib (compat...)"
    lib=$(echo "$line" | awk '{print $1}')
    # Skip system libs and self-reference
    if [[ "$lib" == /usr/lib/* ]] || [[ "$lib" == /System/* ]] || [[ "$lib" == /usr/local/lib/* ]]; then
      continue
    fi
    if [[ ! -f "$lib" ]]; then
      continue
    fi
    libname=$(basename "$lib")
    echo "   bundling $libname"
    cp "$lib" "$DEST/$libname"
    chmod 755 "$DEST/$libname"
    # Patch the reference in tmux to use @executable_path
    install_name_tool -change "$lib" "@executable_path/$libname" "$DEST/tmux"
  done < <(otool -L "$TMUX_BIN" | tail -n +2)

  # Re-sign the patched binary (ad-hoc, no identity required)
  echo "--> Signing patched binary..."
  codesign --force --sign - "$DEST/tmux"

  echo "--> Done."
  ls -lh "$DEST/"

# ── Linux ──────────────────────────────────────────────────────────────────
elif [ "$OS" = "linux" ]; then
  if ! command -v tmux &>/dev/null; then
    echo "tmux not found. Install it with your package manager, e.g.:"
    echo "  sudo apt install tmux   # Debian/Ubuntu"
    echo "  sudo dnf install tmux   # Fedora/RHEL"
    exit 1
  fi
  TMUX_BIN=$(which tmux)
  echo "--> Source binary: $TMUX_BIN"
  cp "$TMUX_BIN" "$DEST/tmux"
  chmod 755 "$DEST/tmux"
  echo "--> Done (Linux uses system tmux binary; ensure deps are present at runtime)."
  ls -lh "$DEST/"

else
  echo "Unsupported OS: $OS"
  exit 1
fi
