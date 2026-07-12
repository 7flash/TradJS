/**
 * tradjs/client — Types
 *
 * Shared type definitions for both client and server rendering.
 * This file has zero runtime code and is fully tree-shakeable.
 */

export type VNode = {
  type: string | Component<any> | typeof Fragment;
  props: Props;
  key: string | number | null;
};

export type Props = Record<string, any> & { children?: Child | Child[] };
export type Child = VNode | string | number | boolean | null | undefined;
export type Component<P = Props> = (props: P) => VNode | null;

export const Fragment = Symbol("Fragment");

// ─── HTML Attribute Types ──────────────────────────────────────────────────────

type EventHandler<E = Event> = (event: E) => void;

export interface HTMLAttributes {
  id?: string;
  className?: string;
  class?: string;
  style?: string | Record<string, string | number>;
  title?: string;
  lang?: string;
  dir?: string;
  tabIndex?: number;
  role?: string;
  hidden?: boolean;
  disabled?: boolean;
  draggable?: boolean;
  spellCheck?: boolean;
  contentEditable?: boolean | "true" | "false" | "inherit";

  "aria-label"?: string;
  "aria-hidden"?: boolean | "true" | "false";

  onClick?: EventHandler<MouseEvent>;
  onContextMenu?: EventHandler<MouseEvent>;
  onDoubleClick?: EventHandler<MouseEvent>;
  onDrag?: EventHandler<DragEvent>;
  onDragEnd?: EventHandler<DragEvent>;
  onDragEnter?: EventHandler<DragEvent>;
  onDragExit?: EventHandler<DragEvent>;
  onDragLeave?: EventHandler<DragEvent>;
  onDragOver?: EventHandler<DragEvent>;
  onDragStart?: EventHandler<DragEvent>;
  onDrop?: EventHandler<DragEvent>;
  onMouseDown?: EventHandler<MouseEvent>;
  onMouseEnter?: EventHandler<MouseEvent>;
  onMouseLeave?: EventHandler<MouseEvent>;
  onMouseMove?: EventHandler<MouseEvent>;
  onMouseOut?: EventHandler<MouseEvent>;
  onMouseOver?: EventHandler<MouseEvent>;
  onMouseUp?: EventHandler<MouseEvent>;

  onChange?: EventHandler<Event>;
  onInput?: EventHandler<Event>;
  onSubmit?: EventHandler<Event>;
  onInvalid?: EventHandler<Event>;
  onReset?: EventHandler<Event>;

  onKeyDown?: EventHandler<KeyboardEvent>;
  onKeyPress?: EventHandler<KeyboardEvent>;
  onKeyUp?: EventHandler<KeyboardEvent>;

  onFocus?: EventHandler<FocusEvent>;
  onBlur?: EventHandler<FocusEvent>;

  onScroll?: EventHandler<Event>;
  onWheel?: EventHandler<WheelEvent>;

  [key: string]: any;
}

export interface AnchorHTMLAttributes extends HTMLAttributes {
  href?: string;
  target?: string;
  download?: any;
  rel?: string;
}

export interface InputHTMLAttributes extends HTMLAttributes {
  accept?: string;
  alt?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  capture?: boolean | string;
  checked?: boolean;
  crossOrigin?: string;
  disabled?: boolean;
  form?: string;
  formAction?: string;
  formEncType?: string;
  formMethod?: string;
  formNoValidate?: boolean;
  formTarget?: string;
  height?: number | string;
  list?: string;
  max?: number | string;
  maxLength?: number;
  min?: number | string;
  minLength?: number;
  multiple?: boolean;
  name?: string;
  pattern?: string;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  size?: number;
  src?: string;
  step?: number | string;
  type?: string;
  value?: string | number | readonly string[];
  width?: number | string;
}

// ─── JSX Namespace ─────────────────────────────────────────────────────────────

export namespace JSX {
  export type Element = VNode;
  export type ElementType = string | Component<any> | typeof Fragment;

  export interface ElementAttributesProperty {
    props: {};
  }
  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {
    a: AnchorHTMLAttributes;
    div: HTMLAttributes;
    span: HTMLAttributes;
    p: HTMLAttributes;
    h1: HTMLAttributes;
    h2: HTMLAttributes;
    h3: HTMLAttributes;
    h4: HTMLAttributes;
    h5: HTMLAttributes;
    h6: HTMLAttributes;
    button: HTMLAttributes;
    input: InputHTMLAttributes;
    label: HTMLAttributes;
    form: HTMLAttributes;
    img: HTMLAttributes & {
      src?: string;
      alt?: string;
      width?: string | number;
      height?: string | number;
    };
    ul: HTMLAttributes;
    ol: HTMLAttributes;
    li: HTMLAttributes;
    table: HTMLAttributes;
    tr: HTMLAttributes;
    td: HTMLAttributes;
    th: HTMLAttributes;
    tbody: HTMLAttributes;
    thead: HTMLAttributes;
    textarea: HTMLAttributes & {
      value?: string;
      name?: string;
      placeholder?: string;
      rows?: number;
    };
    select: HTMLAttributes & {
      value?: string | number | string[];
      multiple?: boolean;
    };
    option: HTMLAttributes & { value?: string | number; selected?: boolean };
    nav: HTMLAttributes;
    main: HTMLAttributes;
    section: HTMLAttributes;
    article: HTMLAttributes;
    aside: HTMLAttributes;
    header: HTMLAttributes;
    footer: HTMLAttributes;
    pre: HTMLAttributes;
    code: HTMLAttributes;
    strong: HTMLAttributes;
    em: HTMLAttributes;
    br: HTMLAttributes;
    hr: HTMLAttributes;
    svg: HTMLAttributes & {
      xmlns?: string;
      viewBox?: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: string | number;
      strokeLinecap?: string;
      strokeLinejoin?: string;
    };
    path: HTMLAttributes & { d?: string; fill?: string; stroke?: string };
    circle: HTMLAttributes & {
      cx?: string | number;
      cy?: string | number;
      r?: string | number;
    };
    ellipse: HTMLAttributes & {
      cx?: string | number;
      cy?: string | number;
      rx?: string | number;
      ry?: string | number;
    };
    line: HTMLAttributes & {
      x1?: string | number;
      y1?: string | number;
      x2?: string | number;
      y2?: string | number;
    };
    polyline: HTMLAttributes & { points?: string };
    rect: HTMLAttributes & {
      x?: string | number;
      y?: string | number;
      width?: string | number;
      height?: string | number;
      rx?: string | number;
    };
    [elem: string]: HTMLAttributes;
  }
}
