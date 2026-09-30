/**
 * Collaborative editing binding for CodeMirror 6.
 *
 * Written here rather than pulled in as a dependency (§10 allows either). The
 * binding is small, and the parts that matter are exactly the parts a generic
 * package tends to get subtly wrong for a given editor setup: which edits are
 * echoed back, how the cursor is preserved, and what happens when a remote
 * change lands while someone is mid-selection.
 *
 * The contract in one line: a change from the network must never be re-sent as
 * a local change, and a local change must never be applied twice.
 */

import {
  Annotation,
  StateEffect,
  Transaction,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type * as Y from "yjs";
import type { PresenceChannel, RemotePresence } from "@/services/collaboration/presence";
import { diffStrings } from "@/lib/textDiff";

export interface CollaborativeBindingOptions {
  text: Y.Text;
  presence?: PresenceChannel;
  tabId: string;
}

/**
 * Marks a transaction that mirrors shared state into the editor. Anything
 * carrying it is skipped on the way back out, which is what stops an echo.
 */
const remoteChange = Annotation.define<boolean>();

/** Asks the plugin to redraw peers. Presence arrives outside any transaction. */
const peersChanged = StateEffect.define<null>();

const FALLBACK_COLOR = "#888888";
const MAX_NAME_LENGTH = 40;

/**
 * A peer's color, reduced to something safe to put in a style attribute.
 *
 * The value comes off the wire from another browser. Only plain hex passes,
 * so a peer cannot smuggle extra declarations or a `url()` into our styles.
 */
export const safePeerColor = (color: string | undefined): string =>
  color && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : FALLBACK_COLOR;

const hexChannels = (color: string): [number, number, number] => {
  const hex = color.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};

/** Black or white, whichever reads better on the peer's color. */
const readableOn = (color: string): string => {
  const [r, g, b] = hexChannels(color);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "black" : "white";
};

/**
 * The caret: a zero-width bar in the peer's color with the name flag above
 * it, always visible. A colored bar with no name is a puzzle, not presence.
 */
class PeerCaretWidget extends WidgetType {
  constructor(
    private readonly color: string,
    private readonly name: string
  ) {
    super();
  }

  eq(other: PeerCaretWidget): boolean {
    return other.color === this.color && other.name === this.name;
  }

  toDOM(): HTMLElement {
    const caret = document.createElement("span");
    caret.className = "duck-peer-caret";
    caret.setAttribute("aria-hidden", "true");
    // `position: relative` keeps the name flag anchored to the bar as it moves.
    Object.assign(caret.style, {
      position: "relative",
      borderLeft: `2px solid ${this.color}`,
      marginLeft: "-1px",
      marginRight: "-1px",
    });

    const flag = document.createElement("span");
    flag.className = "duck-peer-flag";
    flag.textContent = this.name;
    Object.assign(flag.style, {
      position: "absolute",
      left: "-2px",
      top: "-1.15em",
      background: this.color,
      color: readableOn(this.color),
      fontFamily: "var(--font-sans)",
      fontSize: "10px",
      lineHeight: "1.3",
      padding: "0 4px",
      borderRadius: "3px 3px 3px 0",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      userSelect: "none",
      zIndex: "10",
    });
    caret.appendChild(flag);
    return caret;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class CollaborativePlugin {
  decorations: DecorationSet = Decoration.none;

  private destroyed = false;
  private peers: RemotePresence[] = [];
  private redrawQueued = false;
  private lastPublished: { anchor: number; head: number } | null = null;
  private readonly offPresence: (() => void) | null;

  constructor(
    private readonly view: EditorView,
    private readonly options: CollaborativeBindingOptions
  ) {
    const { text, presence } = options;

    // Reconcile the editor with shared state, WITHOUT destroying anything.
    //
    // Two directions, and picking the wrong one loses work:
    //  - shared text has content  → the document wins; a guest's empty editor
    //    must not blank out what the host has written.
    //  - shared text is empty     → the editor wins; blanking it here erases
    //    whatever the user had already typed in this tab, which is exactly
    //    what "Please enter a query to execute" looks like from the outside.
    const shared = text.toString();
    const local = view.state.doc.toString();
    if (shared && shared !== local) {
      // A plugin is created in the middle of an editor update, where a
      // dispatch is not allowed. Nothing can change either side before the
      // microtask runs, and it reads both again anyway.
      queueMicrotask(() => this.adoptShared());
    } else if (!shared && local) {
      text.doc?.transact(() => text.insert(0, local), "local");
    }

    text.observe(this.onTextChange);

    this.offPresence = presence?.onChange(this.onPeers) ?? null;
    if (presence) {
      this.peers = presence.peers();
      this.decorations = this.buildDecorations();
      // Announce where we are right away: without this, a peer who opens a tab
      // and reads without moving the caret is invisible to everyone else.
      this.publishCursor();
    }
  }

  /** Makes the editor match the shared text with one minimal edit. */
  private adoptShared(): void {
    if (this.destroyed) return;
    const edit = diffStrings(this.view.state.doc.toString(), this.options.text.toString());
    if (!edit) return;
    this.view.dispatch({
      changes: { from: edit.start, to: edit.start + edit.deleteLength, insert: edit.insert },
      annotations: [remoteChange.of(true), Transaction.addToHistory.of(false)],
    });
  }

  /** Shared text changed: apply to the editor as a minimal set of edits. */
  private readonly onTextChange = (event: Y.YTextEvent, transaction: Y.Transaction): void => {
    if (this.destroyed) return;
    // Our own edits already exist in the editor.
    if (transaction.local) return;

    // Every position in a CodeMirror change set refers to the document
    // before the change, which is also how a Yjs delta counts.
    const changes: { from: number; to?: number; insert?: string }[] = [];
    let index = 0;
    for (const delta of event.delta) {
      if (delta.retain !== undefined) {
        index += delta.retain;
      } else if (delta.insert !== undefined) {
        const inserted = typeof delta.insert === "string" ? delta.insert : "";
        if (inserted) changes.push({ from: index, insert: inserted });
      } else if (delta.delete !== undefined) {
        changes.push({ from: index, to: index + delta.delete });
        index += delta.delete;
      }
    }
    if (changes.length === 0) return;

    try {
      // A change set rather than a full replace: it maps the local caret and
      // keeps the undo stack, so someone else typing does not yank the cursor
      // out from under you. Kept out of history, so undo only ever reverts
      // your own edits.
      this.view.dispatch({
        changes,
        annotations: [remoteChange.of(true), Transaction.addToHistory.of(false)],
      });
    } catch (error) {
      // The delta did not fit the editor, so the two sides had drifted.
      // Converge on the shared text instead of leaving them apart.
      console.error("[collaboration] remote edit did not apply, resyncing", error);
      this.adoptShared();
    }
  };

  private readonly onPeers = (peers: RemotePresence[]): void => {
    if (this.destroyed) return;
    this.peers = peers;
    // Presence can change while the editor is mid-update (our own publish
    // raises it too), and a dispatch there throws. Coalesce into a microtask.
    if (this.redrawQueued) return;
    this.redrawQueued = true;
    queueMicrotask(() => {
      this.redrawQueued = false;
      if (this.destroyed) return;
      this.view.dispatch({ effects: peersChanged.of(null) });
    });
  };

  update(update: ViewUpdate): void {
    if (this.destroyed) return;

    if (update.docChanged) {
      this.pushLocalChanges(update);
      // Carets follow the text until their owner publishes a new position.
      this.decorations = this.decorations.map(update.changes);
    }

    const redraw = update.transactions.some((tr) => tr.effects.some((e) => e.is(peersChanged)));
    if (redraw) this.decorations = this.buildDecorations();

    if (update.selectionSet || update.docChanged) this.publishCursor();
  }

  /** Editor changed locally: mirror into shared text. */
  private pushLocalChanges(update: ViewUpdate): void {
    const local = update.transactions.filter((tr) => tr.docChanged && !tr.annotation(remoteChange));
    if (local.length === 0) return;
    const { text } = this.options;

    text.doc?.transact(() => {
      for (const tr of local) {
        // Offsets are reported against the document before this
        // transaction; `shift` carries the effect of the edits already
        // applied, so every offset stays valid.
        let shift = 0;
        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const insert = inserted.sliceString(0, inserted.length, "\n");
          const removed = toA - fromA;
          if (removed > 0) text.delete(fromA + shift, removed);
          if (insert) text.insert(fromA + shift, insert);
          shift += insert.length - removed;
        });
      }
    }, "local");
  }

  /** Publish this caret so others can see where we are. */
  private publishCursor(): void {
    const { presence, tabId } = this.options;
    if (!presence) return;
    const { anchor, head } = this.view.state.selection.main;
    if (this.lastPublished?.anchor === anchor && this.lastPublished.head === head) return;
    this.lastPublished = { anchor, head };
    presence.publish({ ...presence.identity, cursor: { tabId, anchor, head } });
  }

  /**
   * Draw other people's carets and selections.
   *
   * Two decorations per peer, and both matter:
   *  - the SELECTION, when anchor != head.
   *  - the CARET, always: a peer who is just typing has an empty selection,
   *    and would otherwise be invisible.
   */
  private buildDecorations(): DecorationSet {
    const length = this.view.state.doc.length;
    const ranges: Range<Decoration>[] = [];

    for (const peer of this.peers) {
      if (!peer.cursor || peer.cursor.tabId !== this.options.tabId) continue;
      const anchor = clamp(peer.cursor.anchor, length);
      const head = clamp(peer.cursor.head, length);
      const from = Math.min(anchor, head);
      const to = Math.max(anchor, head);
      const color = safePeerColor(peer.color);
      const name = peer.displayName.slice(0, MAX_NAME_LENGTH);

      if (from !== to) {
        ranges.push(
          Decoration.mark({
            class: "duck-peer-selection",
            attributes: {
              style: `background-color: color-mix(in srgb, ${color} 20%, transparent)`,
              title: name,
            },
          }).range(from, to)
        );
      }

      ranges.push(
        Decoration.widget({
          widget: new PeerCaretWidget(color, name),
          // Leans toward the text behind the head, so typing at a line end
          // does not push the peer's caret onto the next insert.
          side: head < anchor ? -1 : 1,
        }).range(head)
      );
    }

    return Decoration.set(ranges, true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.text.unobserve(this.onTextChange);
    this.offPresence?.();
    this.decorations = Decoration.none;
  }
}

const clamp = (offset: number, length: number): number =>
  Number.isFinite(offset) ? Math.max(0, Math.min(Math.trunc(offset), length)) : 0;

/**
 * Binds a Y.Text to a CodeMirror editor, both directions, with presence.
 *
 * Returns an extension: adding it attaches the binding, removing it (or
 * destroying the editor) detaches everything. Closing a tab or ending a
 * session must leave no listener holding a destroyed editor.
 */
export const collaborativeBinding = (options: CollaborativeBindingOptions): Extension =>
  ViewPlugin.define((view) => new CollaborativePlugin(view, options), {
    decorations: (plugin) => plugin.decorations,
  });
