import type { ComponentType, ReactNode } from 'react';

export interface PickerCtx {
  steps: PickerStep[];
}

export interface PickerStep {
  node: PickerNode;
  /** free-form value captured for this node; null when an optional input is skipped */
  input?: string | null;
}

export interface PickerNodeInput {
  placeholder?: string;
  /** when true, the value may be empty (resolves to null) */
  optional?: boolean;
}

export interface PickerNode {
  id: string;
  label: string;
  /** aligned right of the label (inline) or under it (below) */
  description?: string;
  keywords?: string[];
  icon?: ComponentType<{ className?: string }>;
  /** free-form typing at this node, e.g. a git commit message */
  input?: PickerNodeInput;
  /** CONTINUE the picker; a function enables dynamic children (file lists, branches…) */
  children?: PickerNode[] | ((ctx: PickerCtx) => PickerNode[]);
  /** RUN — terminal action for this node */
  run?: (ctx: PickerCtx) => void;
  /** compact widget shown in the breadcrumb instead of the label/path */
  chip?: (step: PickerStep) => ReactNode;
  /** arbitrary payload for run/chip logic (file info, ids…) */
  meta?: Record<string, unknown>;
}

export interface EnterInfo {
  node: PickerNode;
  steps: PickerStep[];
  awaitingInput: boolean;
}

export type ExitReason = 'escape' | 'run' | 'blur';

export interface PickerProps {
  commands: PickerNode[];
  /** render the option list below (default) or above the input */
  placement?: 'above' | 'below';
  /** description aligned to the right of the label, or on its own line */
  descriptionLayout?: 'inline' | 'below';
  /** steady vim-style block caret (no blink) */
  blockCursor?: boolean;
  /** enable 1–9 quick pick (default true) */
  quickPick?: boolean;
  placeholder?: string;
  className?: string;
  /**
   * Fired when a node is entered/selected. Return a string to prefill the
   * query (pick mode) or the free-form input (input mode) for the user.
   */
  onEnter?: (info: EnterInfo) => string | void;
  /** Fired when the picker exits. Handy for vim-like editors to swap mode. */
  onExit?: (reason: ExitReason) => void;
  /** Fired alongside a node's own run(). */
  onRun?: (ctx: PickerCtx) => void;
}
