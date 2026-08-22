#!/bin/bash
# TwitchSim — removes the After Effects panel (macOS)
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.twitchsim.panel"
echo ""
if [ -e "$DEST" ]; then
  rm -rf "$DEST"
  echo "  ✓ TwitchSim panel removed. Restart After Effects."
else
  echo "  Nothing to remove — the panel isn't installed."
fi
echo ""
read -n 1 -s -r -p "  Press any key to close." || true
echo ""
