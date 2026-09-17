"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useDraft<T> — debounced autosave of form state to localStorage.
 *
 * Design goals (frozen-contract safe, presentation-only):
 *  - Never interferes with existing form logic: it only mirrors state to
 *    storage and offers it back via `restoredDraft`.
 *  - Debounced (500ms) so keystrokes don't thrash storage writes.
 *  - Keyed per form AND per day (EOD drafts must not leak across days —
 *    the key suffix is the caller-supplied "bucket", e.g. orgToday()).
 *  - Survives private-browsing failures silently (storage may throw).
 *
 * Lifecycle:
 *  1. On mount: read the stored draft for the bucket. If present and the
 *     initial state is pristine (all values empty), surface it as
 *     `restoredDraft` — the caller decides how to offer it to the user.
 *     The stored snapshot is NOT wiped while the form sits pristine (the
 *     banner may still be offering it) — only a session that has held
 *     content and then emptied drops the draft.
 *  2. While the user edits: write debounced snapshots.
 *  3. `clearDraft()` wipes the bucket (call after successful submit or on
 *     explicit discard).
 */

const DEBOUNCE_MS = 500;

export interface DraftMeta {
  /** When the snapshot was persisted (epoch ms). */
  savedAt: number;
}

/**
 * Same-tab broadcast fired after every successful draft write/removal so
 * shell chrome (e.g. the sidebar nav dots) can mirror draft existence
 * without polling localStorage. Detail shape: DraftChangeEventDetail.
 */
export const DRAFT_CHANGE_EVENT = "weblaze-ems:draft-change";

export interface DraftChangeEventDetail {
  key: string;
  exists: boolean;
}

function broadcastDraftChange(key: string, exists: boolean) {
  try {
    window.dispatchEvent(
      new CustomEvent<DraftChangeEventDetail>(DRAFT_CHANGE_EVENT, {
        detail: { key, exists },
      }),
    );
  } catch {
    // non-fatal (exotic environments)
  }
}

function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function useDraft<T>(
  key: string,
  state: T,
  isEmpty: (s: T) => boolean,
  /** The pristine initial state — captured once by the caller via lazy
   *  useState so the mount-time restore decision compares against the
   *  ORIGINAL form, not the current one. */
  initial?: T,
  /**
   * `enabled: false` suspends ALL storage writes (and wipes). Use it to
   * gate the writer to genuine user edits: after a successful submit (or
   * on a fresh mount before any interaction) server code may load values
   * back into the form — without this gate those loaded values would be
   * persisted as a phantom "draft" that the next reload offers back as a
   * no-op restore. Defaults to always enabled (previous behaviour).
   */
  options?: { enabled?: boolean },
) {
  // The restored snapshot (offered to the caller, never auto-applied).
  // Decided once at mount from the stored blob + pristine initial state.
  const [restoredDraft, setRestoredDraft] = useState(() => {
    if (typeof window === "undefined") return null;
    const snapshot = readDraft<{ state: T; meta: DraftMeta }>(key);
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !("state" in snapshot) ||
      !("meta" in snapshot)
    ) {
      return null;
    }
    const pristine = initial !== undefined ? initial : state;
    if (!isEmpty(pristine)) return null;
    return { state: snapshot.state, meta: snapshot.meta };
  });

  // Whether the form has held content at any point in THIS session. A
  // pristine mount (e.g. page reload with a stored draft still being
  // offered) must never wipe that stored snapshot — otherwise the draft
  // would vanish 500ms after every reload, before the user decides.
  const hasHeldContent = useRef(false);

  // Debounced writer — skips saving when the form is empty. When the form
  // is empty AND previously held content this session, drops any stale
  // snapshot instead of persisting blanks. Runs on every state change;
  // the 500ms timer resets per keystroke.
  useEffect(() => {
    // Suspended (e.g. the form was programmatically reloaded from the
    // server after a submit): neither save nor wipe. Flipping back to
    // enabled re-arms the debounced writer on the next state change.
    if (options?.enabled === false) return;
    if (!isEmpty(state)) hasHeldContent.current = true;
    const timer = window.setTimeout(() => {
      if (isEmpty(state)) {
        if (!hasHeldContent.current) return;
        try {
          window.localStorage.removeItem(key);
          broadcastDraftChange(key, false);
        } catch {
          // storage unavailable — non-fatal
        }
        return;
      }
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({ state, meta: { savedAt: Date.now() } })
        );
        broadcastDraftChange(key, true);
      } catch {
        // Quota / private browsing — non-fatal
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key, state, isEmpty, options?.enabled]);

  /** Wipe the stored draft (after submit / discard). */
  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      broadcastDraftChange(key, false);
    } catch {
      // non-fatal
    }
    setRestoredDraft(null);
  }, [key]);

  /** Stop offering the restore prompt without wiping storage. */
  const dismissDraft = useCallback(() => setRestoredDraft(null), []);

  return { restoredDraft, clearDraft, dismissDraft };
}
