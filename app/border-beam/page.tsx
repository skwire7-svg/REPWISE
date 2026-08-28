import BorderBeamDemo from "@/components/border-beam-demo";

/**
 * Preview route for the BorderBeam wrapper.
 *
 * The demo previously sat on "/", which is the marketing landing page. It lives
 * here so the effect stays viewable without occupying the site root.
 */
export default function BorderBeamPreviewPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <BorderBeamDemo />
    </main>
  );
}
