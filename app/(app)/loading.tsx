/**
 * Instant shell for every /(app) route.
 *
 * Next streams this the moment a link is clicked, so navigation feels
 * immediate instead of the tab sitting on the old page while the server
 * fetches. These pages each run several Supabase queries — plus the layout's
 * own auth and profile lookups — and without a loading boundary that whole
 * wait is dead time with no feedback, which reads as the app being slow.
 *
 * A route can override this with its own loading.tsx when a closer match to
 * its real layout is worth the duplication.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-surface-2" />
      <div className="mt-6 space-y-3">
        <div className="h-28 rounded-card bg-surface-2" />
        <div className="h-28 rounded-card bg-surface-2" />
        <div className="h-28 rounded-card bg-surface-2" />
      </div>
    </div>
  );
}
