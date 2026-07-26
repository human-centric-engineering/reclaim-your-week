/**
 * The app's welcome email, and the seam that puts it in front of a leader.
 *
 * **Why this file exists.** The platform default went to every account ever created, telling leaders
 * that Reclaim Your Week "is your production-ready Next.js starter template designed for rapid
 * application development", over a Get Started button to `/dashboard`. It was never noticed because
 * nobody on a build receives their own product's welcome email, and `tests/unit/emails/welcome.test.tsx`
 * asserts the platform default renders correctly, which it does — it is the right test of the wrong
 * template for this app.
 *
 * So the assertions here are split deliberately: the rendering ones cover the copy, and the last
 * describe covers **the wiring**, which is the half that actually failed. A perfect override that
 * nobody registers changes nothing.
 *
 * Voice (I1/I2) is guarded at source by `tests/unit/invariants/product-voice.test.ts`, which now
 * walks `components/app/emails`. What is checked here instead is the *rendered* output, where the
 * interpolated props live.
 *
 * @see components/app/emails/welcome.tsx · lib/app/emails.ts
 */

import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import ReclaimWelcomeEmail from '@/components/app/emails/welcome';
import { emailOverrides } from '@/lib/app/emails';
import { appAuthLandingRoute } from '@/lib/app/auth-landing';

const props = {
  userName: 'Amara Okonjo',
  userEmail: 'amara@example.com',
  baseUrl: 'https://example.com',
};

describe('the app welcome email', () => {
  it('points the leader at the audit, not the account pages', async () => {
    const html = await render(<ReclaimWelcomeEmail {...props} />);

    // The regression. `/dashboard` is where the platform default sent people, and it is the one
    // destination that leaves an invited leader exactly where they started.
    expect(html).toContain(`https://example.com${appAuthLandingRoute}`);
    expect(html).not.toContain('https://example.com/dashboard');
  });

  it('addresses the leader and names the account their audit is kept under', async () => {
    const html = await render(<ReclaimWelcomeEmail {...props} />);

    expect(html).toContain('Amara Okonjo');
    // The address matters: it is how they get back in, and an invited leader may hold several.
    expect(html).toContain('amara@example.com');
  });

  it('carries none of the starter-template copy it replaced', async () => {
    const html = await render(<ReclaimWelcomeEmail {...props} />);

    for (const phrase of ['starter template', 'Next.js', 'rapid application development']) {
      expect(html).not.toContain(phrase);
    }
  });

  it('does not speak as a vendor (I1 rule 2)', async () => {
    const html = await render(<ReclaimWelcomeEmail {...props} />);

    // "We're excited to have you on board" is the platform line, and the exact construction the
    // inclusive-we rule forbids. Vendor-we is a judgement in general; this specific idiom is not.
    expect(html).not.toMatch(/\bwe(&#x27;|')?re\b/i);
    expect(html).not.toMatch(/\bwe are\b/i);
  });

  it('attributes the audit to Rashmir in the third person, never as her (I1)', async () => {
    const html = await render(<ReclaimWelcomeEmail {...props} />);

    expect(html).toContain('Rashmir Balasubramaniam');
    expect(html).not.toMatch(/\bI designed\b/i);
    expect(html).not.toMatch(/\bmy framework\b/i);
  });

  it('says that stopping partway is fine', async () => {
    const html = await render(<ReclaimWelcomeEmail {...props} />);

    // Brief §7's register, and the specific reassurance this moment needs: an hour-long audit gets
    // abandoned at twenty minutes, and a leader who thinks they have blown it does not come back.
    expect(html).toMatch(/no need to finish in one sitting/i);
  });

  it('renders with a name it was not designed around', async () => {
    // The greeting is interpolated, so a single-word name (what `user.name || 'User'` often yields)
    // must not read as broken.
    const html = await render(<ReclaimWelcomeEmail {...props} userName="Sam" />);

    expect(html).toContain('Sam');
    expect(html).toContain('<!DOCTYPE html');
  });
});

describe('the welcome override is actually registered', () => {
  it('is wired into the email seam, so no leader can receive the platform default', () => {
    // The half that failed for ten features: `invitation` was overridden because F8 went looking at
    // it, and `welcome` was not because nothing prompted anyone to.
    expect(emailOverrides.welcome).toBe(ReclaimWelcomeEmail);
  });
});
