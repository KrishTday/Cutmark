import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Cutmark",
  description: "How Cutmark handles information and video projects.",
};

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" updated="September 25, 2026">
    <p>This policy describes how Cutmark handles information when you use the browser based video editor at cutmark.dev. Cutmark is currently provided as an individual project. The person operating Cutmark is responsible for the practices described here.</p>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Videos and project data</h2>
      <p>Video editing, trimming, scene analysis, and speech recognition run in your browser on your device. Cutmark does not send your source video, exported video, audio, or transcript to its application servers as part of the editor workflow. Speech recognition uses a model that may be downloaded from Hugging Face the first time you use that feature; the model download does not include your video or audio.</p>
      <p>To show recent projects and let you reopen them, Cutmark saves up to five projects in this browser’s local IndexedDB storage. A saved project can include the source clip, exported clip, file name, trim range, scene markers, caption text, and processing status. This data stays in the browser profile on this device. Use the delete control beside a recent project to remove it, or clear this site’s browser storage to remove all saved projects. Browser storage can be cleared or evicted by the browser at any time.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Information received by the website</h2>
      <p>Cutmark does not currently ask you to create an account or provide payment details. When your browser loads the site, the hosting and content delivery providers (Amazon Web Services) may receive standard connection and request information, such as your IP address, browser details, and requested files, to deliver and protect the site. The app may also contact Hugging Face to download the speech model if you choose caption generation. Cutmark does not currently use advertising or analytics cookies.</p>
      <p>These descriptions should be updated if the app adds accounts, analytics, advertising, cloud video processing, payments, or other data collection.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Purpose, retention, and security</h2>
      <p>Browser storage is used to provide recent project history and editing features. Website request information is handled by the hosting providers to serve the site. We do not keep video projects on Cutmark’s application servers as part of the current editor workflow. We use reasonable measures to protect the site, but browser storage is controlled by your device and browser.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Your choices and privacy questions</h2>
      <p>You can delete projects from the Recent projects list or clear Cutmark site data in your browser settings. For questions or privacy requests, contact the Cutmark operator. Do not post sensitive personal information publicly.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Changes</h2>
      <p>This policy may change as Cutmark changes. The date above shows when it was last updated. If a change materially affects how information is handled, the policy will be updated before or when that change takes effect.</p>
    </section>
  </LegalPage>;
}
