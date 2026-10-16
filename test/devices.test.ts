import { describe, expect, it } from "vitest";
import { formatDevice, parseAdbDevices } from "../src/adb/devices.js";

describe("parseAdbDevices", () => {
  it("parses emulator and usb rows", () => {
    const devices = parseAdbDevices(`List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1
XYZABC                 device usb:1-1 product:cheetah model:Pixel_7_Pro device:cheetah
DEADBEEF               unauthorized
`);
    expect(devices).toHaveLength(3);
    expect(devices[0]).toMatchObject({
      serial: "emulator-5554",
      state: "device",
      model: "sdk gphone64 arm64",
    });
    expect(devices[1]?.model).toBe("Pixel 7 Pro");
    expect(devices[2]?.state).toBe("unauthorized");
    expect(formatDevice(devices[1]!)).toContain("XYZABC");
  });

  it("ignores empty listings", () => {
    expect(parseAdbDevices("List of devices attached\n\n")).toEqual([]);
  });
});
