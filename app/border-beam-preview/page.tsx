import BorderBeamDemo from "@/components/border-beam-demo";

/**
 * Local preview for the BorderBeam component. Not linked from anywhere in the
 * app — delete this route once the effect has a real home.
 */
export default function BorderBeamPreviewPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <BorderBeamDemo />
    </main>
  );
}
