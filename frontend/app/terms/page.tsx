import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use | Cutmark",
  description: "Terms for using the Cutmark browser video editor.",
};

export default function TermsPage() {
  return <LegalPage title="Terms of Use" updated="September 25, 2026">
    <p>These terms apply when you use Cutmark at cutmark.dev. By using the service, you agree to these terms. If you do not agree, do not use Cutmark.</p>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Using Cutmark</h2>
      <p>Cutmark is a browser based tool for editing video clips. You are responsible for your use of the service and for complying with laws that apply to you. Do not use Cutmark to break the law, interfere with the service, or violate another person’s rights.</p>
      <p>You must have the rights and permissions needed to use any video, audio, or other material that you edit. You keep your rights to your source files and exports. Cutmark does not claim ownership of your content.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Local processing and saved projects</h2>
      <p>Editing and optional analysis run in your browser. Recent projects are saved in your browser on your device so you can reopen them. You are responsible for keeping your own copy of important source files and exports. Clearing browser data, changing browsers or devices, or browser storage limits may make saved projects unavailable.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Availability and results</h2>
      <p>Cutmark is provided as available and may change, be interrupted, or become unavailable. Video and speech processing depends on your device, browser, and available storage. Automated scene detection and captions can be incomplete or inaccurate, so review results before relying on them. Keep separate backups of important work.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Liability</h2>
      <p>To the extent permitted by applicable law, Cutmark is provided without warranties that it will be uninterrupted, error free, or suitable for a particular purpose. To the extent permitted by law, the operator is not liable for indirect or consequential loss arising from use of the service, including loss of files or work. Nothing in these terms limits rights or remedies that cannot legally be excluded.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Changes and contact</h2>
      <p>These terms may be updated as the service changes. Continued use after updated terms take effect means you accept them. For questions about these terms, contact the Cutmark operator.</p>
    </section>
  </LegalPage>;
}
