import { render, type VNode } from "tradjs/client";

export type Boundary<T extends HTMLElement = HTMLElement> = ((
  element: T | null,
) => void) & {
  current: T | null;
  bind(view: () => VNode | null): Boundary<T>;
  render(): boolean;
  clear(): boolean;
};

export function createBoundary<
  T extends HTMLElement = HTMLElement,
>(): Boundary<T> {
  let view: (() => VNode | null) | null = null;

  const boundary = ((element: T | null) => {
    boundary.current = element;
  }) as Boundary<T>;

  boundary.current = null;

  boundary.bind = (nextView) => {
    view = nextView;
    return boundary;
  };

  boundary.render = () => {
    if (!boundary.current || !view) return false;
    render(view(), boundary.current);
    return true;
  };

  boundary.clear = () => {
    if (!boundary.current) return false;
    render(null, boundary.current);
    return true;
  };

  return boundary;
}
