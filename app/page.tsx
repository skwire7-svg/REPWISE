import { RepwiseLanding } from "@/components/landing/repwise-landing";
import { Footer } from "@/components/ui/large-name-footer";

const MEDICAL_DISCLAIMER =
  "Repwise provides general fitness and nutrition information and is not medical advice. Consult a qualified professional before starting a new exercise or diet programme, particularly if you have an existing health condition or injury.";

export default function LandingPage() {
  return (
    <main className="min-h-dvh">
      <RepwiseLanding />

      <Footer disclaimer={MEDICAL_DISCLAIMER} />
    </main>
  );
}
