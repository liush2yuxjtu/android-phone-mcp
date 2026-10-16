const ALIASES: Record<string, string> = {
  home: "KEYCODE_HOME",
  back: "KEYCODE_BACK",
  enter: "KEYCODE_ENTER",
  return: "KEYCODE_ENTER",
  tab: "KEYCODE_TAB",
  del: "KEYCODE_DEL",
  delete: "KEYCODE_DEL",
  backspace: "KEYCODE_DEL",
  space: "KEYCODE_SPACE",
  escape: "KEYCODE_ESCAPE",
  esc: "KEYCODE_ESCAPE",
  menu: "KEYCODE_MENU",
  search: "KEYCODE_SEARCH",
  power: "KEYCODE_POWER",
  app_switch: "KEYCODE_APP_SWITCH",
  appswitch: "KEYCODE_APP_SWITCH",
  recents: "KEYCODE_APP_SWITCH",
  overview: "KEYCODE_APP_SWITCH",
  volume_up: "KEYCODE_VOLUME_UP",
  volumeup: "KEYCODE_VOLUME_UP",
  volume_down: "KEYCODE_VOLUME_DOWN",
  volumedown: "KEYCODE_VOLUME_DOWN",
  mute: "KEYCODE_VOLUME_MUTE",
  volume_mute: "KEYCODE_VOLUME_MUTE",
  camera: "KEYCODE_CAMERA",
  wakeup: "KEYCODE_WAKEUP",
  wake: "KEYCODE_WAKEUP",
  sleep: "KEYCODE_SLEEP",
  notification: "KEYCODE_NOTIFICATION",
  notifications: "KEYCODE_NOTIFICATION",
  paste: "KEYCODE_PASTE",
  copy: "KEYCODE_COPY",
  cut: "KEYCODE_CUT",
  dpad_up: "KEYCODE_DPAD_UP",
  up: "KEYCODE_DPAD_UP",
  dpad_down: "KEYCODE_DPAD_DOWN",
  down: "KEYCODE_DPAD_DOWN",
  dpad_left: "KEYCODE_DPAD_LEFT",
  left: "KEYCODE_DPAD_LEFT",
  dpad_right: "KEYCODE_DPAD_RIGHT",
  right: "KEYCODE_DPAD_RIGHT",
  dpad_center: "KEYCODE_DPAD_CENTER",
  center: "KEYCODE_DPAD_CENTER",
  brightness_up: "KEYCODE_BRIGHTNESS_UP",
  brightness_down: "KEYCODE_BRIGHTNESS_DOWN",
  page_up: "KEYCODE_PAGE_UP",
  page_down: "KEYCODE_PAGE_DOWN",
  move_home: "KEYCODE_MOVE_HOME",
  move_end: "KEYCODE_MOVE_END",
};

export function resolveKeyEvent(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("key is required");
  }
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  const upper = trimmed.toUpperCase();
  if (upper.startsWith("KEYCODE_")) {
    return upper;
  }
  const alias = ALIASES[trimmed.toLowerCase().replace(/[\s-]+/g, "_")];
  if (alias) {
    return alias;
  }
  return `KEYCODE_${upper}`;
}
