/**
 * The studio credit that closes every footer.
 *
 * **Why the lockup is broken up.** HCE's supplied wordmark is a 4.87:1 horizontal lockup — gear, then
 * "HUMAN-CENTRIC" stacked over "ENGINEERING" — and the stacking is what makes it unusable here: the
 * lower line is a fraction of whatever height the lockup gets, so at the 17px that sat comfortably in
 * a footer it rendered "ENGINEERING" about two pixels tall. Scaling the lockup until that line reads
 * takes roughly 55–70px, which is not a footer, it is a banner. So the lockup is split: the gear is
 * lifted out as a mark and the name is set in the app's own type. The mark is square (its artwork is
 * 309×309 inside the wordmark's viewBox), and square survives 20px where 4.87:1 does not.
 *
 * **Where the prominence comes from.** Not size — a credit that competes with the page is a worse
 * mistake than one nobody can read. It comes from three cheap things: the orange gear is the only
 * saturated colour in either footer, so the eye finds it without being shouted at; "HCE Studio" is set
 * at full foreground weight against a muted "Built by", so the name is the part that reads; and the
 * whole credit turns HCE orange on hover, which is the one moment it is allowed to be loud.
 *
 * **Why the mark is two files.** `hce-mark-ink.svg` draws the gear teeth in HCE's ink (#26241F) and
 * `hce-mark-paper.svg` in white; the figure inside stays orange in both. Neither is a tint of the
 * other, so a CSS filter would be a guess at the brand's own colour. Both render and one is hidden per
 * theme, driven by the `.dark` class `hooks/use-theme.tsx` puts on `<html>` — no client-side theme
 * read, nothing to hydrate, no flash of the wrong mark on first paint.
 *
 * Both marks are cropped from the wordmarks in `public/brand/`, which are kept as the source artwork.
 *
 * **Why `unoptimized`.** Next's image optimizer refuses SVG unless `dangerouslyAllowSVG` is on
 * globally, and turning that on for one credit would relax the rule for every remote image the app
 * ever renders. These are two static first-party files of about three kilobytes.
 *
 * The accessible name of the link is "Built by HCE Studio" and comes entirely from text: the mark is
 * `alt=""`, because a decorative gear that announced itself would make a screen reader read the
 * studio twice.
 */

import Image from 'next/image';
import Link from 'next/link';

/**
 * `sm` is the programme colophon, a single tight line whose height is taken from the transcript;
 * `md` is the public footer, which is the end of a scrolling document and can afford to breathe.
 */
type CreditSize = 'sm' | 'md';

/** The mark is square, so one number sizes it. Large enough that the figure inside still reads. */
const MARK_PX: Record<CreditSize, number> = { sm: 20, md: 26 };

const TEXT_CLASS: Record<CreditSize, string> = {
  sm: 'text-[0.72rem]',
  md: 'text-sm',
};

export function BuiltByHce({
  size = 'md',
  className = '',
}: {
  size?: CreditSize;
  className?: string;
}) {
  const px = MARK_PX[size];

  return (
    <Link
      href="https://www.hce.studio/"
      target="_blank"
      // `noopener` is the security half and `noreferrer` the courtesy half; both, because this is the
      // only outbound link in either footer and the default for a new tab should not be an exception.
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 ${TEXT_CLASS[size]} ${className}`.trim()}
    >
      {/* The mark lifts a shade on hover rather than moving: the footer is a resting place, and a
          credit that jumps when the cursor crosses it reads as an advert. */}
      <span className="shrink-0 opacity-90 transition-opacity group-hover:opacity-100">
        <Image
          src="/brand/hce-mark-ink.svg"
          alt=""
          aria-hidden="true"
          width={px}
          height={px}
          unoptimized
          className="block dark:hidden"
        />
        <Image
          src="/brand/hce-mark-paper.svg"
          alt=""
          aria-hidden="true"
          width={px}
          height={px}
          unoptimized
          className="hidden dark:block"
        />
      </span>

      {/* The orange is written as a literal arbitrary value rather than a CSS variable: a variable
          would have to be declared somewhere, and every somewhere available here (a `<style>` tag, a
          `:root` rule, the theme file) puts a foreign brand colour into the app's own palette. */}
      <span className="text-muted-foreground transition-colors group-hover:text-[#ED5A24]">
        Built by{' '}
        <span className="text-foreground font-medium tracking-wide group-hover:text-[#ED5A24]">
          HCE Studio
        </span>
      </span>
    </Link>
  );
}
