#!/bin/sh
# Fix FiiO Warmer device nodes left root-only by Plexamp's sudo process.
set -e

UDEV_RULE=/etc/udev/rules.d/90-fiio-warmer.rules

chmod 660 /dev/snd/pcmC1D0p /dev/snd/controlC1
chgrp users /dev/snd/pcmC1D0p /dev/snd/controlC1

if [ ! -f "$UDEV_RULE" ]; then
  cat > "$UDEV_RULE" <<'EOF'
KERNEL=="pcmC1*",   SUBSYSTEM=="sound", GROUP="users", MODE="0660"
KERNEL=="controlC1", SUBSYSTEM=="sound", GROUP="users", MODE="0660"
EOF
  echo "udev rule written to $UDEV_RULE"
fi

echo "done: $(ls -la /dev/snd/pcmC1D0p /dev/snd/controlC1)"
