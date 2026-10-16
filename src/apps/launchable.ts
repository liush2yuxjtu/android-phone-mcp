export interface LaunchableApp {
  packageName: string;
  activity?: string;
  component?: string;
}

const ALIASES: Record<string, string> = {
  settings: "com.android.settings",
  chrome: "com.android.chrome",
  browser: "com.android.chrome",
  camera: "com.android.camera2",
  photos: "com.google.android.apps.photos",
  gallery: "com.google.android.apps.photos",
  gmail: "com.google.android.gm",
  maps: "com.google.android.apps.maps",
  youtube: "com.google.android.youtube",
  play: "com.android.vending",
  "play store": "com.android.vending",
  playstore: "com.android.vending",
  files: "com.google.android.documentsui",
  clock: "com.google.android.deskclock",
  calculator: "com.google.android.calculator",
  contacts: "com.google.android.contacts",
  phone: "com.google.android.dialer",
  dialer: "com.google.android.dialer",
  messages: "com.google.android.apps.messaging",
  sms: "com.google.android.apps.messaging",
  calendar: "com.google.android.calendar",
  drive: "com.google.android.apps.docs",
  keep: "com.google.android.keep",
  launcher: "com.android.launcher3",
  pixel_launcher: "com.google.android.apps.nexuslauncher",
};

export function resolveAlias(name: string): string | undefined {
  const key = name.trim().toLowerCase().replace(/[_-]+/g, " ");
  return ALIASES[key];
}

export function parseLaunchableApps(output: string): LaunchableApp[] {
  const apps = new Map<string, LaunchableApp>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const packageMatch = line.match(/^package:(\S+)/);
    if (packageMatch) {
      const packageName = packageMatch[1]!;
      apps.set(packageName, { packageName });
      continue;
    }
    const componentMatch = line.match(/^(\S+)\/(\S+)$/);
    if (componentMatch) {
      const packageName = componentMatch[1]!;
      let activity = componentMatch[2]!;
      if (activity.startsWith(".")) {
        activity = `${packageName}${activity}`;
      }
      apps.set(`${packageName}/${activity}`, {
        packageName,
        activity,
        component: `${packageName}/${activity}`,
      });
    }
  }
  return [...apps.values()].sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function resolveLaunchTarget(
  name: string,
  apps: LaunchableApp[],
): { packageName?: string; component?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("App name or package is required");
  }
  if (trimmed.includes("/")) {
    return { component: trimmed };
  }
  const aliased = resolveAlias(trimmed);
  if (aliased) {
    return { packageName: aliased };
  }
  if (trimmed.includes(".")) {
    return { packageName: trimmed };
  }
  const lowered = trimmed.toLowerCase();
  const matches = apps.filter(
    (app) =>
      app.packageName.toLowerCase().includes(lowered) ||
      app.activity?.toLowerCase().includes(lowered),
  );
  const uniquePackages = [...new Set(matches.map((app) => app.packageName))];
  if (uniquePackages.length === 1) {
    const first = matches[0]!;
    return { packageName: first.packageName, component: first.component };
  }
  if (uniquePackages.length > 1) {
    throw new Error(
      `Ambiguous app name "${trimmed}". Matches: ${uniquePackages.slice(0, 12).join(", ")}`,
    );
  }
  throw new Error(
    `Could not resolve app "${trimmed}". Use a package name such as com.android.settings, or call phone_apps first.`,
  );
}
