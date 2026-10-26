/**
 * Rewrite external CDN references to locally-vendored copies.
 *
 * Why: generated HTML historically pointed at cdn.tailwindcss.com / Google
 * Fonts (issue #152). On offline `file://` opens or restricted networks the
 * CDN is unreachable and the page renders half-blank. Fonts are handled at
 * the prompt layer (system font stacks — see templates/shared.ts); runtime
 * scripts are handled here.
 *
 * - Preview path (`localizeForPreview`): rewrite the CDN URL to `/vendor/…`.
 *   Inside an `about:srcdoc` iframe, relative URLs resolve against the app
 *   origin, and `next/public/vendor/*` is served statically — no network
 *   beyond localhost.
 * - Download path (`inlineVendoredScripts`): fetch the vendored file and
 *   inline it into a `<script>` body so the exported single file stays fully
 *   self-contained on any machine, offline included.
 */

const VENDORED: Array<{ re: RegExp; local: string }> = [
  {
    // Matches the bare CDN URL and pinned variants (e.g. /3.4.16).
    re: /https?:\/\/cdn\.tailwindcss\.com(?:\/[\w.\-]+)?/g,
    local: "/vendor/tailwind.play.js",
  },
];

export function localizeForPreview(html: string): string {
  if (!html) return html;
  let out = html;
  for (const v of VENDORED) out = out.replace(v.re, v.local);
  return out;
}

export async function inlineVendoredScripts(html: string): Promise<string> {
  let out = localizeForPreview(html);
  for (const v of VENDORED) {
    const tagRe = new RegExp(`<script([^>]*?)src="${v.local}"([^>]*?)></script>`, "g");
    if (!tagRe.test(out)) continue;
    tagRe.lastIndex = 0;
    try {
      const res = await fetch(v.local);
      if (!res.ok) continue;
      const js = await res.text();
      out = out.replace(
        tagRe,
        (_m, before: string, after: string) =>
          `<script${before}${after}>/* vendored ${v.local} */\n${js}\n</script>`,
      );
    } catch {
      // Offline app or vendor fetch failed — keep the local path; the file
      // still works when opened from the app origin.
    }
  }
  return out;
}
