/**
 * The "Test account" badge (F19).
 *
 * One component rather than the pill markup written out on the clients table, the client record and the
 * shared-results inbox. Not for tidiness: this badge is the *only* thing distinguishing a test account
 * from a client on screen, so all three places have to say it the same way. Three copies would drift,
 * and a badge that looks different in one place reads as a different thing.
 *
 * Renders nothing when the account is real, so a caller can drop it in unconditionally.
 */

export function PreviewBadge({ isPreview }: { isPreview: boolean }) {
  if (!isPreview) return null;

  return (
    <span
      className="bg-muted text-muted-foreground rounded-full border border-dashed px-2 py-0.5 text-xs font-medium"
      title="A test account, created from Preview. It is left out of the published figures and the quarterly nudge."
    >
      Test account
    </span>
  );
}
