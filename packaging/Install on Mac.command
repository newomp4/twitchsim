#!/bin/bash
# TwitchSim — After Effects panel installer (macOS)
# Copies the panel into Adobe's CEP extensions folder and allows unsigned panels to load.

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/com.twitchsim.panel"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.twitchsim.panel"

finish() {
  echo ""
  read -n 1 -s -r -p "  Press any key to close." || true
  echo ""
  exit "$1"
}

echo ""
echo "  TwitchSim — After Effects panel"
echo "  ==============================="
echo ""

if [ ! -f "$SRC/CSXS/manifest.xml" ]; then
  echo "  ✗ Can't find the 'com.twitchsim.panel' folder next to this installer."
  echo "    Unzip the whole download first, then run this again."
  finish 1
fi

# the panel needs CEP 12, which arrived in After Effects 25.0 — warn before it silently no-shows
newest=0
for d in /Applications/Adobe\ After\ Effects\ */; do
  y="${d##*Adobe After Effects }"
  y="${y%/}"
  case "$y" in
    [0-9][0-9][0-9][0-9]) [ "$y" -gt "$newest" ] && newest="$y" ;;
  esac
done
if [ "$newest" != 0 ] && [ "$newest" -lt 2025 ]; then
  echo "  ! Found After Effects $newest, but this panel needs 2025 or newer."
  echo "    Installing anyway, but it will not appear in Window ▸ Extensions"
  echo "    until you're on After Effects 2025+."
  echo ""
fi

echo "  Installing…"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
if [ ! -f "$DEST/CSXS/manifest.xml" ]; then
  echo "  ✗ Copy failed — the panel isn't where it should be."
  echo "    If After Effects is open, quit it completely and run this again."
  finish 1
fi
# files out of a downloaded zip are quarantined; After Effects won't load them
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
echo "  ✓ Panel installed"

# let After Effects load a panel that isn't signed by Adobe
for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null
done
killall cfprefsd 2>/dev/null
echo "  ✓ After Effects allowed to load it"

echo ""
echo "  Done. Now:"
echo "    1. Quit After Effects if it's open, then start it again"
echo "    2. Window ▸ Extensions ▸ TwitchSim"
finish 0
