import { describe, expect, it } from "vitest";
import { PhoneSession } from "../src/session.js";
import { FakeAdb } from "./helpers/fake-adb.js";

function sessionWith(fake = new FakeAdb()) {
  return { fake, session: new PhoneSession({ executor: fake, env: {} }) };
}

describe("PhoneSession", () => {
  it("auto-connects a single emulator and observes UI", async () => {
    const { session } = sessionWith();
    const result = await session.connect();
    expect(result.selected?.serial).toBe("emulator-5554");
    expect(result.observe?.elements.some((el) => el.text === "Play Store")).toBe(true);
    expect(result.observe?.compact).toContain("emulator-5554");
    expect(result.observe?.compact).toContain("Play Store");
  });

  it("lists devices when several are attached", async () => {
    const fake = new FakeAdb();
    fake.devicesOutput = `List of devices attached
emulator-5554          device
emulator-5556          device
`;
    const { session } = sessionWith(fake);
    const result = await session.connect();
    expect(result.selected).toBeUndefined();
    expect(result.message).toMatch(/Multiple devices/);
  });

  it("honors ANDROID_SERIAL", async () => {
    const fake = new FakeAdb();
    fake.devicesOutput = `List of devices attached
emulator-5554          device
emulator-5556          device
`;
    const session = new PhoneSession({
      executor: fake,
      env: { ANDROID_SERIAL: "emulator-5556" },
    });
    const result = await session.connect();
    expect(result.selected?.serial).toBe("emulator-5556");
  });

  it("taps an observe index at the element center", async () => {
    const { fake, session } = sessionWith();
    await session.connect();
    await session.tap({ index: 1, observe: false, settleMs: 0 });
    const tap = fake.calls.find((args) => args.includes("tap"));
    expect(tap?.slice(-2)).toEqual(["162", "1797"]);
  });

  it("swipes by direction using screen size", async () => {
    const { fake, session } = sessionWith();
    await session.connect();
    await session.swipe({ direction: "up", observe: false, settleMs: 0 });
    const swipe = fake.calls.find((args) => args.includes("swipe"));
    expect(swipe?.slice(-5)).toEqual(["540", "1860", "540", "540", "300"]);
  });

  it("types ASCII via input text", async () => {
    const { fake, session } = sessionWith();
    await session.connect();
    const result = await session.type({ text: "hello world", observe: false, settleMs: 0 });
    expect(result).toMatchObject({ method: "input" });
    expect(fake.calls.some((args) => args.includes("hello%sworld"))).toBe(true);
  });

  it("launches settings by alias", async () => {
    const { fake, session } = sessionWith();
    await session.connect();
    await session.launch({ app: "settings", observe: false, settleMs: 0 });
    const start = fake.calls.find((args) => args.includes("am") && args.includes("start"));
    expect(start).toContain("com.android.settings");
  });

  it("falls back to screenshot when dump fails", async () => {
    const fake = new FakeAdb();
    fake.failDump = true;
    const { session } = sessionWith(fake);
    const result = await session.connect();
    expect(result.observe?.dumpError).toMatch(/dump/i);
    expect(result.observe?.screenshotPng?.length).toBeGreaterThan(10);
  });
});
