export type DeviceState =
  | "device"
  | "offline"
  | "unauthorized"
  | "authorizing"
  | "connecting"
  | "unknown";

export interface AdbDevice {
  serial: string;
  state: DeviceState;
  usb?: string;
  product?: string;
  model?: string;
  device?: string;
  transportId?: string;
  extra: Record<string, string>;
}

const STATES = new Set<string>([
  "device",
  "offline",
  "unauthorized",
  "authorizing",
  "connecting",
]);

export function parseAdbDevices(output: string): AdbDevice[] {
  const devices: AdbDevice[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("List of devices")) {
      continue;
    }
    const [serial, state, ...rest] = line.split(/\s+/);
    if (!serial || !state) {
      continue;
    }
    const extra: Record<string, string> = {};
    for (const token of rest) {
      const eq = token.indexOf(":");
      if (eq > 0) {
        extra[token.slice(0, eq)] = token.slice(eq + 1);
      }
    }
    devices.push({
      serial,
      state: (STATES.has(state) ? state : "unknown") as DeviceState,
      usb: extra.usb,
      product: extra.product,
      model: extra.model?.replace(/_/g, " "),
      device: extra.device,
      transportId: extra.transport_id,
      extra,
    });
  }
  return devices;
}

export function formatDevice(device: AdbDevice): string {
  const bits = [device.serial, device.state];
  if (device.model) {
    bits.push(device.model);
  }
  if (device.product) {
    bits.push(device.product);
  }
  return bits.join(" · ");
}
