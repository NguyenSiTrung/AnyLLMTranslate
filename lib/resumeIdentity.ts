/**
 * Stronger resume identity than bare text (FR-20).
 * Matches snapshot pieces to re-extracted pieces using parent path + text.
 */

/** Build a local identity key: parent path signature + normalized text. */
export function resumeIdentityKey(opts: {
  text: string;
  /** CSS-path-ish parent chain, e.g. "body>main>article>p" */
  parentPath: string;
}): string {
  const text = opts.text.replace(/\s+/g, ' ').trim();
  const path = opts.parentPath.replace(/\s+/g, '');
  return `${path}::${text}`;
}

/**
 * Compute a short parent path from an element (tag chain up to depth).
 * Pure enough for tests with a minimal Element-like shape.
 */
export function parentPathFromElement(
  el: { tagName: string; parentElement: { tagName: string; parentElement: unknown } | null } | null,
  maxDepth = 5,
): string {
  if (!el) return '';
  const parts: string[] = [];
  let cur: typeof el | null = el;
  let depth = 0;
  while (cur && depth < maxDepth) {
    parts.push(cur.tagName.toLowerCase());
    cur = cur.parentElement as typeof el | null;
    depth++;
  }
  return parts.reverse().join('>');
}

/**
 * Match resume snapshot translations onto live pieces.
 * Prefer parentPath+text; fall back to text-only for legacy snapshots.
 */
export function matchResumeTranslations<
  TLive extends { text: string; parentPath: string },
  TSnap extends { text: string; parentPath?: string; translatedText?: string; status: string },
>(
  livePieces: TLive[],
  snapshotPieces: TSnap[],
): Map<number, string> {
  /** live index → translatedText */
  const out = new Map<number, string>();

  const byIdentity = new Map<string, string>();
  const byText = new Map<string, string>();
  for (const snap of snapshotPieces) {
    if (snap.status !== 'translated' || !snap.translatedText) continue;
    if (snap.parentPath) {
      byIdentity.set(
        resumeIdentityKey({ text: snap.text, parentPath: snap.parentPath }),
        snap.translatedText,
      );
    }
    // Text-only fallback: first writer wins (legacy behavior).
    if (!byText.has(snap.text)) {
      byText.set(snap.text, snap.translatedText);
    }
  }

  const usedText = new Set<string>();
  for (let i = 0; i < livePieces.length; i++) {
    const live = livePieces[i];
    if (!live) continue;
    const idKey = resumeIdentityKey({
      text: live.text,
      parentPath: live.parentPath,
    });
    const byId = byIdentity.get(idKey);
    if (byId !== undefined) {
      out.set(i, byId);
      continue;
    }
    // Fallback: bare text if not already claimed by another live piece.
    const byT = byText.get(live.text);
    if (byT !== undefined && !usedText.has(live.text)) {
      out.set(i, byT);
      usedText.add(live.text);
    }
  }

  return out;
}
