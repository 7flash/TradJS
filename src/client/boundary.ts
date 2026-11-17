import { render, type RenderOptions } from "./render";
import type { VNode } from "./types";

const states = new WeakMap<object, BoundaryState<Element>>();

type BoundaryRender = (options?: RenderOptions) => boolean;
type BoundaryFallback = (error: unknown, reset: () => boolean) => VNode;

type BoundaryState<T extends Element> = {
  current: T | null;
  render: BoundaryRender | null;
  attachment: object | null;
  lastOptions?: RenderOptions;
};

export interface Boundary<T extends Element = HTMLElement> {
  readonly current: T | null;
  render(options?: RenderOptions): boolean;
  reset(): boolean;
}

export function createBoundary<T extends Element = HTMLElement>(
  { fallback }: { fallback?: BoundaryFallback } = {},
): Boundary<T> {
  const state: BoundaryState<T> = {
    current: null,
    render: null,
    attachment: null,
  };
  const boundary: Boundary<T> = {
    get current() {
      return state.current;
    },
    render(options) {
      if (!state.render) return false;
      state.lastOptions = options;
      try {
        return state.render(options);
      } catch (error) {
        if (!fallback || !state.current) throw error;
        const attachment = state.attachment;
        render(
          fallback(error, () =>
            state.attachment === attachment && boundary.reset(),
          ),
          state.current as unknown as HTMLElement,
        );
        return true;
      }
    },
    reset() {
      return boundary.render(state.lastOptions);
    },
  };
  states.set(boundary, state as BoundaryState<Element>);
  return boundary;
}

export function isBoundary(value: unknown): value is Boundary<Element> {
  return !!value && typeof value === "object" && states.has(value);
}

export function attachBoundary(
  boundary: Boundary<Element>,
  element: Element,
  attachment: object,
  render: BoundaryRender,
): void {
  const state = states.get(boundary);
  if (!state) return;
  if (
    state.attachment &&
    state.attachment !== attachment &&
    state.current !== element
  ) {
    throw new Error(
      "[tradjs] A boundary can be mounted on only one host element at a time.",
    );
  }
  state.current = element;
  state.attachment = attachment;
  state.render = render;
}

export function detachBoundary(
  boundary: Boundary<Element>,
  element: Element,
  attachment: object,
): void {
  const state = states.get(boundary);
  if (!state || state.attachment !== attachment || state.current !== element) {
    return;
  }
  state.current = null;
  state.attachment = null;
  state.render = null;
  state.lastOptions = undefined;
}
