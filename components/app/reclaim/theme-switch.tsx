'use client';

/**
 * Light or dark, in the programme's own bar.
 *
 * **The theme logic is the platform's; only the shape is ours.** `useTheme` is imported rather than
 * reimplemented, so a leader's choice is the same choice everywhere in the product and there is one
 * place it is stored. What this does not reuse is `components/theme-toggle.tsx`, which renders an
 * outlined square button: correct in the platform header, where it sits in a row of buttons, and
 * wrong beside a letterspaced wordmark on an otherwise bare bar. A bordered control there is the one
 * element that would make a page built to feel like a conversation look like a control panel.
 *
 * **The crossfade is done with the `dark:` variant rather than from state, deliberately.** The theme
 * is read from `localStorage` on the client, so a state-driven class would differ from the markup the
 * server sent and hydration would complain on every load. Keying off the class the provider puts on
 * `<html>` keeps the markup identical in both places, which is also why the label below is fixed
 * rather than naming the theme being switched to.
 */

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Switch between light and dark"
      title="Switch between light and dark"
      className="text-muted-foreground hover:text-foreground hover:bg-accent/50 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
    >
      <span className="relative flex h-[1.05rem] w-[1.05rem] items-center justify-center">
        <Sun
          aria-hidden
          className="absolute h-full w-full scale-100 rotate-0 transition-transform duration-300 dark:scale-0 dark:-rotate-90"
        />
        <Moon
          aria-hidden
          className="absolute h-full w-full scale-0 rotate-90 transition-transform duration-300 dark:scale-100 dark:rotate-0"
        />
      </span>
    </button>
  );
}
