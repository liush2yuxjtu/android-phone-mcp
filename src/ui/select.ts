import type { UiElement } from "./hierarchy.js";

export interface ElementSelector {
  index?: number;
  text?: string;
  textContains?: boolean;
  resourceId?: string;
  contentDesc?: string;
  className?: string;
  packageName?: string;
}

export function selectElement(
  elements: UiElement[],
  selector: ElementSelector,
): UiElement {
  if (selector.index !== undefined) {
    const found = elements.find((el) => el.index === selector.index);
    if (!found) {
      throw new Error(
        `No element with index ${selector.index} in the last observe snapshot (${elements.length} elements). Call phone_observe first.`,
      );
    }
    return found;
  }

  const matched = elements.filter((el) => matches(el, selector));
  if (matched.length === 0) {
    throw new Error(`No element matched selector ${JSON.stringify(selector)}`);
  }
  matched.sort(compareSpecificity);
  return matched[0]!;
}

export function selectorFromArgs(args: {
  index?: number;
  text?: string;
  textContains?: boolean;
  resourceId?: string;
  contentDesc?: string;
  className?: string;
  packageName?: string;
}): ElementSelector | undefined {
  if (
    args.index === undefined &&
    !args.text &&
    !args.resourceId &&
    !args.contentDesc &&
    !args.className &&
    !args.packageName
  ) {
    return undefined;
  }
  return {
    index: args.index,
    text: args.text,
    textContains: args.textContains,
    resourceId: args.resourceId,
    contentDesc: args.contentDesc,
    className: args.className,
    packageName: args.packageName,
  };
}

function matches(el: UiElement, selector: ElementSelector): boolean {
  if (selector.text) {
    const hay = `${el.text}\n${el.contentDesc}`;
    if (selector.textContains) {
      if (!hay.toLowerCase().includes(selector.text.toLowerCase())) {
        return false;
      }
    } else if (el.text !== selector.text && el.contentDesc !== selector.text) {
      return false;
    }
  }
  if (selector.resourceId && !idMatches(el.resourceId, selector.resourceId)) {
    return false;
  }
  if (
    selector.contentDesc &&
    el.contentDesc.toLowerCase() !== selector.contentDesc.toLowerCase()
  ) {
    return false;
  }
  if (selector.className && !el.className.toLowerCase().includes(selector.className.toLowerCase())) {
    return false;
  }
  if (
    selector.packageName &&
    el.packageName.toLowerCase() !== selector.packageName.toLowerCase()
  ) {
    return false;
  }
  return true;
}

function idMatches(actual: string, wanted: string): boolean {
  if (actual === wanted) {
    return true;
  }
  if (actual.endsWith(`/${wanted}`) || actual.endsWith(`:id/${wanted}`)) {
    return true;
  }
  return actual.toLowerCase() === wanted.toLowerCase();
}

function compareSpecificity(a: UiElement, b: UiElement): number {
  const score = (el: UiElement) => {
    let s = 0;
    if (el.clickable) s += 8;
    if (el.focused) s += 4;
    if (el.enabled) s += 2;
    const area =
      Math.max(1, el.bounds.right - el.bounds.left) *
      Math.max(1, el.bounds.bottom - el.bounds.top);
    return s * 1_000_000_000 - area;
  };
  return score(b) - score(a);
}
