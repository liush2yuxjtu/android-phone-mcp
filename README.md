# android-phone-mcp

Open-source **MCP (stdio)** server that lets an AI client control an **Android emulator or USB device over ADB**.

This is **not AndroMeld**, is **not affiliated** with Catching Now / AndroMeld, and does **not** implement Continuity, Finder mounting, Meld Mode, Mac widgets, or AndroMeld’s helper app. Tool **names** follow AndroMeld’s [public MCP list](https://andromeld.catchingnow.com/help.md) (`phone_connect`, `phone_observe`, `phone_tap`, `phone_swipe`, `phone_type`, `phone_key`, `phone_launch`, `phone_apps`) so an existing client config is easier to swap. Behavior is ADB-based: an emulator is enough; no physical phone is required for basic verification.

---

## 中文简介

用标准 MCP stdio 把 Android 模拟器或真机交给 Cursor / Claude Desktop 等客户端操作。驱动层只有 `adb`（Android platform-tools），不依赖任何 AndroMeld 二进制或私有 API。

**和 AndroMeld 的差异**

| | android-phone-mcp | AndroMeld |
| --- | --- | --- |
| 连接 | `adb`（模拟器或 USB / 无线调试） | Mac 应用 + 手机助手 |
| 界面树 | `uiautomator dump` | 无障碍树（Phone Screen） |
| 模拟器 | 支持，推荐用来验证 | 面向真机 + Mac |
| Finder / Continuity / 通话 / 小组件 | 无 | 有 |

**安装**

```bash
git clone https://github.com/liush2yuxjtu/android-phone-mcp.git
cd android-phone-mcp
npm install
npm run build
# 需要本机已安装 adb，且 `adb devices` 能看到 device
```

**MCP 配置（Cursor）** — 把路径换成你的克隆目录：

```json
{
  "mcpServers": {
    "android-phone": {
      "command": "node",
      "args": ["/ABS/PATH/android-phone-mcp/dist/index.js"],
      "env": {
        "ANDROID_SERIAL": "emulator-5554"
      }
    }
  }
}
```

开发时也可用：

```json
{
  "mcpServers": {
    "android-phone": {
      "command": "npx",
      "args": ["tsx", "/ABS/PATH/android-phone-mcp/src/index.ts"],
      "env": { "ANDROID_SERIAL": "emulator-5554" }
    }
  }
}
```

先启动 AVD，执行 `adb devices -l` 看到 `device`，再让客户端调用 `phone_connect`。

---

## English

### Requirements

- Node.js 20+
- [`adb`](https://developer.android.com/tools/adb) on `PATH` (or set `ADB_PATH`)
- An emulator **or** a device with USB debugging authorized

### Install

```bash
git clone https://github.com/liush2yuxjtu/android-phone-mcp.git
cd android-phone-mcp
npm install && npm run build && npm test
```

`npm start` runs the stdio MCP server (the client should spawn this; do not type into it yourself).

### Emulator quickstart

See [`scripts/start-emulator.md`](scripts/start-emulator.md). Short version:

```bash
emulator -avd mcp_pixel
adb devices -l          # wait until: emulator-5554    device
export ANDROID_SERIAL=emulator-5554
./scripts/verify-adb.sh
```

### MCP client config

**Cursor** (`~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "android-phone": {
      "command": "node",
      "args": ["/ABS/PATH/android-phone-mcp/dist/index.js"],
      "env": {
        "ANDROID_SERIAL": "emulator-5554"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "android-phone": {
      "command": "node",
      "args": ["/ABS/PATH/android-phone-mcp/dist/index.js"],
      "env": {
        "ANDROID_SERIAL": "emulator-5554"
      }
    }
  }
}
```

From a clone, `npx` + `tsx` also works (see Chinese section). GitHub `npx github:liush2yuxjtu/android-phone-mcp` can work after `prepare` builds `dist/`; the most reliable path is a local `node …/dist/index.js`.

### Device selection

1. Tool argument `device` on `phone_connect`
2. Else env `ANDROID_SERIAL`
3. Else the only online `adb` device
4. Else the tool lists serials and asks you to pick

### Tools

Aligned with AndroMeld’s documented names (intent: phone control via MCP, not protocol/binary compatibility):

| Tool | Role |
| --- | --- |
| `phone_connect` | List/select devices; return current screen summary |
| `phone_observe` | UI hierarchy (`uiautomator dump`); optional screenshot |
| `phone_tap` | Tap `x,y` or last-observe `index` / `text` / `resourceId` / `contentDesc` |
| `phone_swipe` | Coordinates or `direction`: up / down / left / right |
| `phone_type` | Type into the focused field (`input text` or clipboard paste) |
| `phone_key` | `HOME`, `BACK`, `ENTER`, `APP_SWITCH`, … |
| `phone_launch` | Package, component, or alias (`settings`, `chrome`, …) |
| `phone_apps` | Launchable launcher activities |

Extras: `phone_screenshot`, `phone_back`, `phone_home`, `phone_devices`.

Typical loop: `phone_connect` → `phone_observe` → `phone_tap` / `phone_type` using `[n]` indexes. Actions re-observe by default so the model sees the resulting screen.

### Verification commands

With an emulator already `device` in `adb devices`:

```bash
adb devices -l
export ANDROID_SERIAL=emulator-5554
adb -s "$ANDROID_SERIAL" shell wm size
adb -s "$ANDROID_SERIAL" shell uiautomator dump --compressed /data/local/tmp/android-phone-mcp-uidump.xml
adb -s "$ANDROID_SERIAL" exec-out cat /data/local/tmp/android-phone-mcp-uidump.xml | head -c 400
./scripts/verify-adb.sh
```

Then in the MCP client: *“Call phone_connect, then phone_observe, then phone_launch app=settings.”*

### Limitations

- Needs a reachable `adb` device; this server does not start the emulator for you.
- `uiautomator dump` fails on some secure/DRM surfaces, games, and a few OEM skins — use `includeScreenshot` / `phone_screenshot` and tap coordinates.
- Unicode typing depends on `cmd clipboard set-text` + paste; some images lack that command.
- No AndroMeld Continuity, Finder, calls, widgets, or Mac windowing.
- Full device control is powerful: only attach emulators or phones you intend an AI client to operate.
- Android 12+ is the realistic floor for a useful hierarchy dump; older images may still accept `input` events.

### Development

```bash
npm test      # mocked adb
npm run build
npm start     # stdio MCP
```

License: MIT.
