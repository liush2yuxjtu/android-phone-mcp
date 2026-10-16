# Android emulator quickstart

You do **not** need a physical phone. An Android Virtual Device (AVD) is enough for `phone_connect` and `phone_observe`.

## 1. Install Android SDK platform-tools + emulator

Pick one:

- Android Studio → SDK Manager → SDK Tools: **Android SDK Platform-Tools**, **Android Emulator**, a system image (API 34+).
- Command-line SDK:

```bash
# macOS (Homebrew)
brew install --cask android-commandlinetools
# or linux: download commandlinetools from https://developer.android.com/studio#command-tools

export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

sdkmanager --install \
  "platform-tools" \
  "emulator" \
  "platforms;android-34" \
  "system-images;android-34;google_apis;x86_64"
```

Confirm:

```bash
adb version
emulator -version
```

## 2. Create an AVD

```bash
echo no | avdmanager create avd \
  -n mcp_pixel \
  -k "system-images;android-34;google_apis;x86_64" \
  -d pixel_6
```

List AVDs: `emulator -list-avds`

## 3. Start the emulator

```bash
emulator -avd mcp_pixel -netdelay none -netspeed full
# headless / CI-style:
# emulator -avd mcp_pixel -no-window -gpu swiftshader_indirect -no-audio -no-snapshot
```

Wait until `adb devices -l` shows `emulator-5554 ... device` (not `offline`).

## 4. Verify ADB (exact commands)

```bash
adb devices -l
export ANDROID_SERIAL=emulator-5554
./scripts/verify-adb.sh
```

Expected: `wm size` prints a resolution, and `uiautomator dump` writes XML that `cat` can read.

## 5. Point MCP at that device

Set `ANDROID_SERIAL=emulator-5554` in the MCP client env (see README). Then ask the client to call `phone_connect`.
