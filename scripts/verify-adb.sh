#!/usr/bin/env bash
# Exact local verification against a running emulator or USB device.
# Usage: ./scripts/verify-adb.sh
set -euo pipefail

ADB="${ADB_PATH:-adb}"

echo "==> adb version"
"$ADB" version

echo "==> adb devices -l"
"$ADB" devices -l

SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$SERIAL" ]]; then
  SERIAL="$("$ADB" devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
fi
if [[ -z "$SERIAL" ]]; then
  echo "No online device. Start an emulator first (see scripts/start-emulator.md)." >&2
  exit 1
fi

echo "==> using serial $SERIAL"
"$ADB" -s "$SERIAL" shell getprop ro.product.model
"$ADB" -s "$SERIAL" shell getprop ro.build.version.release
"$ADB" -s "$SERIAL" shell wm size

echo "==> uiautomator dump"
"$ADB" -s "$SERIAL" shell uiautomator dump --compressed /data/local/tmp/android-phone-mcp-uidump.xml
"$ADB" -s "$SERIAL" exec-out cat /data/local/tmp/android-phone-mcp-uidump.xml | head -c 500
echo
echo "==> dump ok. MCP tools phone_connect / phone_observe should work on this serial."
