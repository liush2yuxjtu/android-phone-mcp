---
name: verify
description: Verify android-phone-mcp (package/ADB/QR camera) plus TLC on formal/ when present. Use when confirming MCP/adb control, Mac-hosted QR camera scan, or formal ADB-op exclusivity invariants.
---

# /verify — android-phone-mcp

This repo is an **open-source ADB MCP** (stdio) server. It is **not AndroMeld**, is not affiliated with Catching Now / AndroMeld, and does not implement Continuity, Finder mounting, Meld Mode, Mac widgets, or AndroMeld’s helper app. Tool names (`phone_connect`, `phone_observe`, …) match AndroMeld’s public list so a client config is easier to swap. Behavior is ADB-only.

Use this skill when asked to `/verify`, confirm MCP/adb control, or prove that a phone can scan a **Mac-hosted challenge QR** without a physical device.

Detailed camera repro: [`scripts/verify-qr-mac-scan.md`](../../../scripts/verify-qr-mac-scan.md). Emulator bootstrap: [`scripts/start-emulator.md`](../../../scripts/start-emulator.md).

Keep every path generic. Use `$ANDROID_HOME` and `$QR_E2E_DIR`. Never hard-code personal home directories.

## Verdict model

Every check, and the overall run, is exactly one of:

| Verdict | Meaning |
| --- | --- |
| **PASS** | The claim was exercised on a real runtime and the required observables matched. |
| **FAIL** | The method ran far enough to observe a counterexample (wrong UA, `scanned` stayed false, tests failed). |
| **BLOCKED** | The method could not be executed because of environment (no SDK, virt off, disk, no camera path). |
| **SKIP** | The check is out of scope for this run (caller asked only for package tests, or only for QR). |

**No partial pass.** Do not write “PASS with caveats”, “mostly works”, or “PASS except UA”. If the camera claim is missing a scanner User-Agent, that check is **FAIL**, not PASS. If you could not start the emulator, that check is **BLOCKED**, not FAIL.

Report each check separately, then one overall verdict:

- Overall **PASS** only if every non-SKIP check is PASS.
- If any required check is **FAIL**, overall is FAIL.
- Else if any required check is **BLOCKED**, overall is BLOCKED.
- When `formal/` exists, the **tla_formal** check is required (not SKIP). Missing Java/`tla2tools.jar` → **FAIL** with install instructions (not SKIP); invariant violation → **FAIL**. Overall cannot be PASS while tla_formal is red.

## Claims

Two runtime claims plus a formal check when `formal/` exists. Verify the ones the user asked for; when they say `/verify` with no qualifier, attempt package + both runtime claims + **tla_formal** (if `formal/` is present).

1. **ADB MCP control.** An AI/client can control Android via this open-source ADB MCP: a reachable emulator or USB device, then `phone_connect` / `phone_observe` (or the ADB equivalent in `scripts/verify-adb.sh`).
2. **Camera QR e2e.** An emulator can **scan a Mac-hosted challenge QR through its camera**, then the host `/status` shows `scanned: true` **and** a **scanner** User-Agent (e.g. `ZXing (Android)`).

Claim 2 is **not** proven by:

- `adb shell am start -a android.intent.action.VIEW -d 'http://10.0.2.2:…'`
- `adb shell` + `curl` / `wget` / Chrome from the guest
- Host `curl` of `/s?t=<token>`
- VirtualScene screenshots without a scanner fetch
- A `/status` of `scanned: true` whose `ua` is `curl`, `Wget`, `Dalvik`, or a browser

Those shortcuts hit the URL without a camera decode. They are **FAIL** if presented as the camera claim.


## Formal (TLA+) — `tla_formal` (required when `formal/` exists)

Models single-serial ADB op exclusivity (`Inv_AtMostOneInflight`, disconnect/idle rules). See `formal/README.md`.

### Install TLC

1. Java 11+ (`java -version`).
2. Download `tla2tools.jar` from [TLA+ releases](https://github.com/tlaplus/tlaplus/releases).

Optional: `export TLA2TOOLS_JAR=/path/to/tla2tools.jar`.

### Run

```bash
JAR="${TLA2TOOLS_JAR:-tla2tools.jar}"
test -f "$JAR" || JAR="./tla2tools.jar"
command -v java >/dev/null || { echo "tla_formal FAIL: java missing — install JDK 11+"; exit 1; }
test -f "$JAR" || { echo "tla_formal FAIL: tla2tools.jar missing — https://github.com/tlaplus/tlaplus/releases"; exit 1; }
( cd formal && java -cp "$JAR" tlc2.TLC -config Spec.cfg Spec.tla )
```

| Outcome | Verdict |
| --- | --- |
| TLC exits 0 + `No error has been found` | **PASS** |
| Invariant/property violation or TLC error | **FAIL** |
| `java` or `tla2tools.jar` missing while `formal/` exists | **FAIL** (install above; do not SKIP) |

Read TLC results with the pstack `/statechart` skill (commands change by release — do not copy them here).

## Package check (always cheap)

From the repo root:

```bash
npm test && npm run build
```

Same commands formerly run in GitHub Actions CI (removed in favor of this skill). **PASS** = both exit 0. This does **not** prove a device or a camera scan.

## ADB MCP smoke

Doctor (read-only: is this instance worth driving?):

```bash
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
adb version
adb devices -l
export ANDROID_SERIAL="${ANDROID_SERIAL:-emulator-5554}"
./scripts/verify-adb.sh
```

Need an online `device` (not `offline` / `unauthorized`). Start an AVD only if this run owns it — see `scripts/start-emulator.md`. On Apple Silicon use an `arm64-v8a` system image; on Intel/Linux `x86_64` is typical.

If MCP is wired in this session:

1. `phone_connect` (optional `device=emulator-5554`)
2. `phone_observe` (optional `includeScreenshot=true`)
3. Optional: `phone_launch` `app=settings`, then observe again

**PASS** = `adb devices` shows the serial **and** `verify-adb.sh` (or `phone_connect` + `phone_observe`) returns a hierarchy / screen summary.

**BLOCKED** examples: missing `adb`, no AVD, BIOS virtualization / Windows AEHD off, disk full, SDK not installed.

Do not kill an emulator you did not start.

## Camera QR e2e (proven on Apple Silicon Mac)

This is the method that succeeded without a physical phone. Follow the full recipe in [`scripts/verify-qr-mac-scan.md`](../../../scripts/verify-qr-mac-scan.md). Summary:

1. **Host HTTP challenge** bound on the Mac (loopback is enough; emulator alias `10.0.2.2` reaches host `127.0.0.1`). Token in memory. Routes:
   - `GET /s?t=<token>` — correct token sets `scanned=true` and records `User-Agent`
   - `GET /status` — JSON: `scanned`, `ua`, `token`, `hits`
   - `GET /reset` — new token, `scanned=false`
2. **QR payload** is exactly `http://10.0.2.2:<port>/s?t=<token>` (guest URL, not `localhost` and not the Mac’s LAN IP).
3. **Camera feed image** is **1280×720**. The emulator `-camera-back imagefile:<png>` viewport is a **zoomed TOP band** of the source — a centered single QR is usually **out of frame**. Tile identical QRs across the **top** of the canvas.
4. **Launch emulator** with that file (absolute path):

   ```bash
   emulator -avd "$AVD_NAME" -camera-back "imagefile:$QR_E2E_DIR/camera-feed.png"
   ```

   Do **not** use VirtualScene for this claim (headless dining-room navigation is a blocker). Do not use `webcam*` (that is a host webcam, not the challenge PNG).
5. **Install a FOSS scanner** (ZXing Barcode Scanner preferred; Binary Eye is an alternative). Open `CaptureActivity`, grant camera.
6. **PASS only when** `GET /status` shows `scanned: true` **and** `ua` is the scanner (e.g. `ZXing (Android)`). ZXing fetches the URL itself to read the page title after a camera decode; that is the intended signal.
7. **Evidence** (keep after cleanup): `$QR_E2E_DIR/status.json` and a screenshot of the decode result (`adb exec-out screencap`). Repo `.gitignore` includes `*.png` — do not rely on committing screenshots.

### Edge probe (required for camera PASS)

Do at least one:

- `GET /reset`, confirm `scanned: false`, then a **second** camera scan of the new token flips it again with a scanner UA; or
- `GET /s?t=wrong` (from host or guest) does **not** set `scanned: true`.

A wrong-token hit recorded in `hits` with `ok: false` is good evidence. A host `curl` of the **correct** token that flips `scanned` is **not** a camera PASS (it destroys the claim). Use `/reset` after any accidental host fetch.

## Blockers to report

State **BLOCKED** with the concrete missing prerequisite — do not improvise a VIEW-intent workaround and call it PASS:

| Blocker | Typical signal |
| --- | --- |
| BIOS virt off / Windows AEHD | emulator fails to boot; hypervisor errors |
| Headless VirtualScene nav | living-room scene, no imagefile; cannot WASD to the wall QR |
| Disk space | `sdkmanager` / emulator abort, `No space left` |
| Missing SDK | no `$ANDROID_HOME`, no `adb` / `emulator` on `PATH` |
| `imagefile` rejected | emulator version does not accept `-camera-back imagefile:…` |
| No window + no imagefile | `-no-window` with VirtualScene cannot aim the camera |
| Scanner APK unavailable | cannot sideload ZXing / Binary Eye |

Linux CI / this cloud agent image: package tests can PASS; camera e2e is usually **BLOCKED** (no Apple Silicon, often no AVD). Say so. Do not mark camera FAIL merely because this host cannot run an emulator.

## Evidence and cleanup

Proof artifacts live under `$QR_E2E_DIR` (default `$PWD/tmp/qr-e2e` or a temp dir). They **survive** teardown.

Cleanup kills **only** processes this run started (challenge server, emulator you launched). Never `killall emulator` / `qemu`. Leave `$QR_E2E_DIR/status.json` and the decode screenshot in place.

## Report shape

```text
## /verify
overall: PASS | FAIL | BLOCKED | SKIP

- package:    PASS|FAIL|SKIP     — npm test && npm run build
- adb_mcp:    PASS|FAIL|BLOCKED|SKIP — adb + phone_connect/observe or verify-adb.sh
- qr_camera:  PASS|FAIL|BLOCKED|SKIP — /status scanned:true + scanner UA
- tla_formal: PASS|FAIL|SKIP     — TLC on formal/Spec.tla (required when formal/ exists; missing jar/Java = FAIL)

evidence:
- $QR_E2E_DIR/status.json
- $QR_E2E_DIR/decode-result.png
- formal TLC stdout (No error has been found)

notes: <blockers, ABI, emulator flag, scanner package, TLA2TOOLS_JAR>
```

Quote the `/status` JSON in the report. If `ua` is missing or not a scanner, `qr_camera` is FAIL.
