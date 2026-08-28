import { Footer } from "@/components/ui/large-name-footer";

/**
 * Renders the footer on its own, with every default in place, for previewing
 * the component in isolation. The live site renders <Footer> from app/page.tsx.
 */
function FooterDemo() {
  return (
    <div className="block">
      <Footer />
    </div>
  );
}

export { FooterDemo };
