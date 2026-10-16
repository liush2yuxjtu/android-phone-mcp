# Mac-hosted QR → Android emulator camera (no physical phone)

Proven on an **Apple Silicon Mac** with the Android Emulator’s `imagefile` back camera and ZXing Barcode Scanner. This document is the detailed repro for [`.cursor/skills/verify/SKILL.md`](../.cursor/skills/verify/SKILL.md).

This is **not AndroMeld**. The guest only needs `adb` + a FOSS scanner. The host only needs a tiny HTTP challenge server and a QR PNG.

**PASS** (camera claim) only when `GET /status` returns `scanned: true` **and** `ua` is the scanner (e.g. `ZXing (Android)`).  
`adb` `VIEW` intents, guest `curl`/`wget`, or host `curl` of `/s?t=<token>` are **not** a camera pass.

## Placeholders

| Variable | Meaning | Typical value |
| --- | --- | --- |
| `$ANDROID_HOME` | Android SDK root | `$HOME/Library/Android/sdk` (macOS) or `$HOME/Android/Sdk` |
| `$QR_E2E_DIR` | Scratch dir for this run (server pid, PNGs, status JSON) | `$PWD/tmp/qr-e2e` |
| `$QR_E2E_PORT` | Host challenge port | `8765` |
| `$AVD_NAME` | AVD from `emulator -list-avds` | `mcp_pixel` |
| `$ANDROID_SERIAL` | `adb` serial | `emulator-5554` |

```bash
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export QR_E2E_DIR="${QR_E2E_DIR:-$PWD/tmp/qr-e2e}"
export QR_E2E_PORT="${QR_E2E_PORT:-8765}"
mkdir -p "$QR_E2E_DIR"
```

Do not hard-code `/Users/<name>/…`.

## Why `imagefile` (and not VirtualScene / webcam)

| Back camera | Use for this e2e? |
| --- | --- |
| `-camera-back imagefile:$QR_E2E_DIR/camera-feed.png` | **Yes** — static PNG is the camera feed. Proven. |
| `virtualscene` | **No** for unattended verify. The QR is on a dining-room wall; you must WASD/Shift-look. Headless VirtualScene nav is a **BLOCKED**. |
| `webcam0` | **No** — host webcam, not the challenge PNG. |

### Critical: zoomed TOP band

The `imagefile` camera does **not** show the full PNG. It shows a **zoomed crop of the top band** of the source.

- Source size that worked: **1280×720** (landscape camera buffer).
- A **single QR centered** in that canvas is usually **below** the crop → scanner never decodes.
- **Tile** the same QR across the **top** of the canvas (y ≈ 0–280) so any horizontal slice of the top band still contains a complete code.

## 1. Challenge server

The emulator reaches the host loopback as `10.0.2.2`. Bind the server on `127.0.0.1` (or `0.0.0.0`) on the Mac.

Write `$QR_E2E_DIR/challenge_server.py`:

```python
#!/usr/bin/env python3
"""Host QR challenge: /s?t=TOKEN records a scan; /status reports UA."""
from __future__ import annotations

import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("QR_E2E_PORT", "8765"))
state = {
    "token": secrets.token_urlsafe(16),
    "scanned": False,
    "ua": None,
    "hits": [],
}


def payload() -> str:
    return f"http://10.0.2.2:{PORT}/s?t={state['token']}"


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, obj: object) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        ua = self.headers.get("User-Agent", "")
        if parsed.path == "/status":
            return self._json(
                200,
                {
                    "scanned": state["scanned"],
                    "ua": state["ua"],
                    "token": state["token"],
                    "qr_payload": payload(),
                    "hits": state["hits"],
                },
            )
        if parsed.path == "/reset":
            state["token"] = secrets.token_urlsafe(16)
            state["scanned"] = False
            state["ua"] = None
            state["hits"] = []
            return self._json(200, {"ok": True, "token": state["token"], "qr_payload": payload()})
        if parsed.path == "/s":
            token = parse_qs(parsed.query).get("t", [""])[0]
            ok = token == state["token"]
            state["hits"].append({"path": self.path, "ua": ua, "ok": ok})
            if ok:
                state["scanned"] = True
                state["ua"] = ua
            html = b"<html><body>ok</body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt: str, *args: object) -> None:
        print("[challenge]", fmt % args, flush=True)


if __name__ == "__main__":
    httpd = HTTPServer(("127.0.0.1", PORT), Handler)
    print(
        json.dumps(
            {
                "listen": f"127.0.0.1:{PORT}",
                "token": state["token"],
                "qr_payload": payload(),
            }
        ),
        flush=True,
    )
    httpd.serve_forever()
```

```bash
python3 "$QR_E2E_DIR/challenge_server.py" >"$QR_E2E_DIR/challenge.log" 2>&1 &
echo $! >"$QR_E2E_DIR/challenge.pid"
sleep 0.3
curl -s "http://127.0.0.1:${QR_E2E_PORT}/status"
```

Copy `qr_payload` from that JSON. It must look like `http://10.0.2.2:8765/s?t=…`.

## 2. Build the 1280×720 tiled camera feed

Needs Python `qrcode` + Pillow (`pip install --user 'qrcode[pil]' pillow`).

Write `$QR_E2E_DIR/make_camera_feed.py`:

```python
#!/usr/bin/env python3
"""Encode a URL as QR tiles in the TOP band of a 1280x720 camera-feed PNG."""
from __future__ import annotations

import os
import sys

import qrcode
from PIL import Image

W, H = 1280, 720
TILE = 240
TOP = 8
GAP = 16


def main() -> None:
    payload = sys.argv[1]
    out = sys.argv[2]
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    tile = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    tile = tile.resize((TILE, TILE), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (W, H), "white")
    x = GAP
    while x + TILE <= W:
        canvas.paste(tile, (x, TOP))
        x += TILE + GAP
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    canvas.save(out, "PNG")
    print(f"wrote {out} {W}x{H} payload={payload}", flush=True)


if __name__ == "__main__":
    main()
```

```bash
QR_PAYLOAD="$(python3 -c "import json,urllib.request; print(json.load(urllib.request.urlopen('http://127.0.0.1:${QR_E2E_PORT}/status'))['qr_payload'])")"
python3 "$QR_E2E_DIR/make_camera_feed.py" "$QR_PAYLOAD" "$QR_E2E_DIR/camera-feed.png"
file "$QR_E2E_DIR/camera-feed.png"   # expect: 1280 x 720
```

`qr_payload` must stay the **guest** URL (`10.0.2.2`), never `127.0.0.1` / `localhost`.

## 3. AVD + emulator with `imagefile`

SDK / AVD bootstrap is in [`start-emulator.md`](./start-emulator.md). On Apple Silicon install `system-images;android-34;google_apis;arm64-v8a` (not `x86_64`).

```bash
emulator -list-avds
# create mcp_pixel if needed (ABI must match the host)
echo no | avdmanager create avd \
  -n mcp_pixel \
  -k "system-images;android-34;google_apis;arm64-v8a" \
  -d pixel_6

# imagefile path must be absolute
emulator -avd "${AVD_NAME:-mcp_pixel}" \
  -camera-back "imagefile:${QR_E2E_DIR}/camera-feed.png" \
  -netdelay none -netspeed full
```

Wait until `adb devices -l` shows `emulator-5554 … device`.

If `-camera-back imagefile:…` is rejected, record emulator `-version` and mark the camera claim **BLOCKED**. Do not fall back to `am start -a VIEW`.

Confirm the guest can reach the host (this is connectivity only, **not** a camera pass):

```bash
adb -s "${ANDROID_SERIAL:-emulator-5554}" shell wget -qO- "http://10.0.2.2:${QR_E2E_PORT}/status" | head -c 400
# then reset so this wget cannot be mistaken for a scan:
curl -s "http://127.0.0.1:${QR_E2E_PORT}/reset" >/dev/null
# rebuild camera-feed.png from the new qr_payload (step 2) and restart the emulator
# if imagefile is only read at boot
```

Skip the guest `wget` if you prefer not to burn a token; the camera run below is sufficient.

## 4. FOSS scanner

Preferred: **ZXing Barcode Scanner** (`com.google.zxing.client.android`). After a URL decode it GETs the link with User-Agent `ZXing (Android)` to show the page title — that is the PASS signal.

Alternative: **Binary Eye** (`de.markusfisch.android.binaryeye`). Only PASS if `/status` `ua` is clearly that scanner, not Chrome / `Dalvik`.

Sideload an APK you obtained from F-Droid (or a local build) into `$QR_E2E_DIR`. Do not commit APKs.

```bash
SERIAL="${ANDROID_SERIAL:-emulator-5554}"
adb -s "$SERIAL" install -r "$QR_E2E_DIR/zxing.apk"
adb -s "$SERIAL" shell pm grant com.google.zxing.client.android android.permission.CAMERA
adb -s "$SERIAL" shell am start -n com.google.zxing.client.android/.CaptureActivity
```

Grant the in-app camera prompt if `pm grant` is not enough (Android version dependent). The preview should show the tiled QR (top-band crop), not a living room.

Wait 5–20s for decode + title fetch.

## 5. PASS / FAIL observables

```bash
curl -s "http://127.0.0.1:${QR_E2E_PORT}/status" | tee "$QR_E2E_DIR/status.json"
adb -s "${ANDROID_SERIAL:-emulator-5554}" exec-out screencap -p > "$QR_E2E_DIR/decode-result.png"
```

**PASS** all of:

- `"scanned": true`
- `"ua"` is the scanner, e.g. `"ZXing (Android)"` (substring `ZXing` is acceptable)
- screenshot shows ZXing’s decode result (URL / title), not the launcher
- you did **not** fire `am start -a android.intent.action.VIEW` or host/guest `curl` of the **correct** `/s?t=` token

**FAIL** if `scanned` is true but `ua` is `curl`, `Wget`, `Dalvik`, `Mozilla`, `Chrome`, or empty.

**FAIL** if CaptureActivity is open, feed looks correct, and after a reasonable wait `scanned` is still false (after you have ruled out the top-band crop).

## 6. Edge probe

Do at least one. Both is better.

### Wrong token must not flip `scanned`

```bash
# assume current status is scanned:true from the real scan — reset first
curl -s "http://127.0.0.1:${QR_E2E_PORT}/reset" >/dev/null
curl -s "http://127.0.0.1:${QR_E2E_PORT}/s?t=definitely-wrong"
curl -s "http://127.0.0.1:${QR_E2E_PORT}/status" | tee "$QR_E2E_DIR/status-wrong-token.json"
```

Expect `scanned: false`. `hits` may contain `{ "ok": false, … }`.

### Second scan after reset

1. `GET /reset` → new `token` / `qr_payload`, `scanned: false`.
2. Rebuild `camera-feed.png` (step 2).
3. If the emulator caches `imagefile` at boot, **restart** the emulator with the same `-camera-back` flag. If it re-reads the file, reopening CaptureActivity is enough.
4. Open CaptureActivity again.
5. `/status` must return `scanned: true` with a scanner UA for the **new** token.

## 7. MCP package + ADB smoke (same `/verify` run)

```bash
npm test && npm run build
export ANDROID_SERIAL="${ANDROID_SERIAL:-emulator-5554}"
./scripts/verify-adb.sh
```

If this session has the `android-phone` MCP: `phone_connect` then `phone_observe`. That is claim 1. It does not substitute for claim 2.

## Cleanup

Stop only what this run started:

```bash
if [[ -f "$QR_E2E_DIR/challenge.pid" ]]; then
  kill "$(cat "$QR_E2E_DIR/challenge.pid")" || true
fi
# If you launched the emulator for this run, close that window / kill that PID.
# Do not killall emulator.
```

Keep `$QR_E2E_DIR/status.json` and `$QR_E2E_DIR/decode-result.png`. They are the proof. Repo `.gitignore` matches `*.png`; evidence is local unless you copy JSON into the report.

## Blockers

Report **BLOCKED** (not FAIL, not a VIEW-intent “workaround PASS”):

- **BIOS virtualization off / Windows AEHD missing** — emulator will not boot.
- **Headless VirtualScene** — cannot walk to the wall QR; use `imagefile` instead, or BLOCKED.
- **Disk space** — SDK image / AVD / emulator abort.
- **Missing SDK** — no `$ANDROID_HOME`, `adb`, or `emulator`.
- **`imagefile` unsupported** — emulator binary rejects the flag.
- **Scanner APK unavailable** — cannot install ZXing / Binary Eye.

A Linux CI runner or cloud agent without an AVD should mark `qr_camera: BLOCKED` and still run `npm test && npm run build`.
