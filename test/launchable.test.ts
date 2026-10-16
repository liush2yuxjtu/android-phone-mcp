import { describe, expect, it } from "vitest";
import {
  parseLaunchableApps,
  resolveAlias,
  resolveLaunchTarget,
} from "../src/apps/launchable.js";

describe("launchable apps", () => {
  const apps = parseLaunchableApps(`
priority=0 preferredOrder=0 match=0x108000
com.android.settings/.Settings
com.android.chrome/.Main
package:com.example.other
`);

  it("parses brief query-activities output", () => {
    expect(apps.map((app) => app.packageName).sort()).toEqual([
      "com.android.chrome",
      "com.android.settings",
      "com.example.other",
    ]);
    expect(apps.find((app) => app.packageName === "com.android.settings")?.component).toBe(
      "com.android.settings/com.android.settings.Settings",
    );
  });

  it("resolves aliases and components", () => {
    expect(resolveAlias("settings")).toBe("com.android.settings");
    expect(resolveLaunchTarget("settings", apps)).toEqual({
      packageName: "com.android.settings",
    });
    expect(resolveLaunchTarget("com.android.settings/.Foo", apps)).toEqual({
      component: "com.android.settings/.Foo",
    });
    expect(resolveLaunchTarget("chrome", apps).packageName).toBe("com.android.chrome");
  });
});
