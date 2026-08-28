/**
 * Coach-specific skeleton: a conversation, not a stack of cards.
 *
 * Matching the real shape matters more here than elsewhere — the generic card
 * skeleton would visibly reflow into chat bubbles on every visit.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-40 rounded-lg bg-surface-2" />
      <div className="mt-6 space-y-3">
        <div className="h-16 rounded-2xl bg-surface-2" />
        <div className="ml-auto h-10 w-2/3 rounded-2xl bg-surface-2" />
        <div className="h-20 w-5/6 rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
