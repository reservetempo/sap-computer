import { MAIN_SITE_URL, REPO_URL } from "./config";

// Sits outside the visualizer, so the --sap-* palette variables don't reach it. The colors are
// neutral greys that read on both the Game and Textbook backgrounds (theme.js), which the
// visualizer paints onto <html>.
const label = "text-[11px] font-bold uppercase tracking-[0.18em] text-[#8f8e88]";
const link =
  "text-[#e6e4dc] underline decoration-[#5a606c] underline-offset-4 hover:text-white hover:decoration-current " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6e4dc]";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-10 font-sans text-sm text-[#b9b7ae]">
      <div className="flex flex-col gap-6 border-t border-[#3d4350] pt-6 sm:flex-row sm:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className={label}>About</p>
          <p>
            An interactive SAP-1 computer you can program and step through, one clock pulse at a time.
          </p>
          <p>
            The SAP-1 design is by Albert Paul Malvino and Jerald A. Brown, from{" "}
            <cite className="text-[#e6e4dc]">Digital Computer Electronics</cite> (chapter 10).
          </p>
        </div>
        <nav aria-label="Site links" className="space-y-3 sm:text-right">
          <p className={label}>Links</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
            <li>
              <a className={link} href={REPO_URL} target="_blank" rel="noopener noreferrer">
                Source on GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            {MAIN_SITE_URL && (
              <li>
                <a className={link} href={MAIN_SITE_URL}>
                  <span aria-hidden="true">← </span>Back to main site
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
