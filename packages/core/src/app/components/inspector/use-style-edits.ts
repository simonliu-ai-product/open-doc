import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cssName,
  cssValue,
  type StyleChanges,
  type StyleOrigin,
  type StyleProp,
  type StyleValue,
} from '../../lib/inspector/format';
import { PROP_ATTR } from '../../lib/source-loc';
import { useHistory } from '../history-provider';

const LOC_ATTR = 'data-od-loc';

export type StyleTarget = { line: number; column: number; tag: string };

/** A style edit waiting for Save, plus what the panel was shown when it began. */
export type PendingStyle = StyleTarget & {
  changes: StyleChanges;
  expected: Partial<Record<StyleProp, StyleOrigin | null>>;
};

type Original = { value: string; priority: string };

export const styleKey = (target: StyleTarget) => `${target.line}:${target.column}`;

/**
 * Every element printed by one source location — a `.map()` or a flow block
 * split across pages prints the same JSX more than once, and a source edit
 * changes them all, so the preview has to as well.
 */
export function elementsAt(root: ParentNode, target: StyleTarget): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      `[${LOC_ATTR}="${styleKey(target)}"]:not([${PROP_ATTR}])`,
    ),
  ].filter((el) => el.tagName.toLowerCase() === target.tag);
}

/**
 * Style changes from the element panel, shown on the page before they are
 * written. A change is set on the elements' inline style, over whatever React
 * rendered there, and every value it covered is kept so Discard can put it
 * back. The edits themselves live in a ref, keyed by source location, so a
 * hot reload that replaces the elements can lay them on the new ones.
 */
export function useStyleEdits(container: HTMLElement | null) {
  const history = useHistory();
  const editsRef = useRef(new Map<string, PendingStyle>());
  const originalsRef = useRef(new Map<HTMLElement, Map<string, Original>>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const restore = useCallback((el: HTMLElement, names?: Set<string>) => {
    const saved = originalsRef.current.get(el);
    if (!saved) return;
    for (const [name, original] of saved) {
      if (names && !names.has(name)) continue;
      if (original.value === '') el.style.removeProperty(name);
      else el.style.setProperty(name, original.value, original.priority);
      saved.delete(name);
    }
    if (saved.size === 0) originalsRef.current.delete(el);
  }, []);

  const paint = useCallback(
    (edit: PendingStyle) => {
      if (!container) return;
      for (const el of elementsAt(container, edit)) {
        let saved = originalsRef.current.get(el);
        if (!saved) {
          saved = new Map();
          originalsRef.current.set(el, saved);
        }
        const wanted = new Set<string>();
        for (const [prop, value] of Object.entries(edit.changes) as Array<
          [StyleProp, StyleValue]
        >) {
          const name = cssName(prop);
          wanted.add(name);
          if (!saved.has(name)) {
            saved.set(name, {
              value: el.style.getPropertyValue(name),
              priority: el.style.getPropertyPriority(name),
            });
          }
          if (value === null) el.style.removeProperty(name);
          else el.style.setProperty(name, cssValue(prop, value));
        }
        const stale = new Set([...saved.keys()].filter((name) => !wanted.has(name)));
        if (stale.size > 0) restore(el, stale);
      }
    },
    [container, restore],
  );

  /** Replaces a location's pending changes wholesale — the one way in, for edits and undo alike. */
  const put = useCallback(
    (key: string, next: PendingStyle | null) => {
      const prev = editsRef.current.get(key);
      if (next && Object.keys(next.changes).length > 0) {
        editsRef.current.set(key, next);
        paint(next);
      } else {
        editsRef.current.delete(key);
        if (prev && container) for (const el of elementsAt(container, prev)) restore(el);
      }
      bump();
    },
    [paint, restore, container, bump],
  );

  const change = useCallback(
    /** `undefined` takes back an unsaved change; `null` takes the key off in source. */
    (
      target: StyleTarget,
      prop: StyleProp,
      value: StyleValue | undefined,
      shown: StyleOrigin | null,
    ) => {
      const key = styleKey(target);
      const prev = editsRef.current.get(key) ?? null;
      const base: PendingStyle = prev ?? { ...target, changes: {}, expected: {} };
      const changes = { ...base.changes };
      const expected = { ...base.expected };
      if (value === undefined) {
        delete changes[prop];
        delete expected[prop];
      } else {
        changes[prop] = value;
        if (!(prop in expected)) expected[prop] = shown;
      }
      const next: PendingStyle = { ...base, changes, expected };
      put(key, next);
      history.record({
        coalesceKey: `style:${key}:${prop}`,
        undo: () => put(key, prev),
        redo: () => put(key, next),
      });
    },
    [put, history],
  );

  const pendingFor = useCallback(
    (target: StyleTarget | null): StyleChanges =>
      (target && editsRef.current.get(styleKey(target))?.changes) || {},
    [],
  );

  const discard = useCallback(() => {
    for (const key of [...editsRef.current.keys()]) put(key, null);
  }, [put]);

  /** Lets go of saved locations; the reload that follows renders them from source. */
  const forget = useCallback(
    (keys: string[]) => {
      for (const key of keys) {
        editsRef.current.delete(key);
      }
      for (const [el] of originalsRef.current) {
        if (keys.includes(el.getAttribute(LOC_ATTR) ?? '')) originalsRef.current.delete(el);
      }
      bump();
    },
    [bump],
  );

  /** After a reload replaced elements, the unsaved changes go onto the new ones. */
  const repaint = useCallback(() => {
    for (const el of [...originalsRef.current.keys()]) {
      if (!el.isConnected) originalsRef.current.delete(el);
    }
    for (const edit of editsRef.current.values()) paint(edit);
  }, [paint]);

  useEffect(() => {
    const originals = originalsRef.current;
    return () => {
      for (const el of [...originals.keys()]) {
        const saved = originals.get(el);
        if (!saved) continue;
        for (const [name, original] of saved) {
          if (original.value === '') el.style.removeProperty(name);
          else el.style.setProperty(name, original.value, original.priority);
        }
      }
      originals.clear();
    };
  }, []);

  const edits = useCallback(() => [...editsRef.current.values()], []);
  const revert = useCallback(
    (keys: string[]) => {
      for (const key of keys) put(key, null);
    },
    [put],
  );

  return {
    version,
    count: editsRef.current.size,
    edits,
    change,
    pendingFor,
    discard,
    forget,
    revert,
    repaint,
  };
}
