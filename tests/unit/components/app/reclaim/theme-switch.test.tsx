/**
 * Light or dark, in the programme's own bar.
 *
 * The one behaviour worth pinning is the toggle direction: dark flips to light and light flips to
 * dark, via the platform's own `useTheme` (never reimplemented locally, per the component's own
 * docstring). Everything else — the crossfade — is done with the `dark:` Tailwind variant rather than
 * from state, so there is no light/dark markup branch to assert on beyond the click handler itself.
 *
 * @see /components/app/reclaim/theme-switch.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSetTheme = vi.hoisted(() => vi.fn());
const mockUseTheme = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-theme', () => ({ useTheme: () => mockUseTheme() }));

import { ThemeSwitch } from '@/components/app/reclaim/theme-switch';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ThemeSwitch', () => {
  it('renders a labelled control, since the icon alone names no theme', () => {
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });
    render(<ThemeSwitch />);

    const button = screen.getByRole('button', { name: 'Switch between light and dark' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Switch between light and dark');
  });

  it('switches to dark when the current theme is light', async () => {
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });
    const user = userEvent.setup();
    render(<ThemeSwitch />);

    await user.click(screen.getByRole('button', { name: 'Switch between light and dark' }));

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('switches back to light when the current theme is dark', async () => {
    mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme });
    const user = userEvent.setup();
    render(<ThemeSwitch />);

    await user.click(screen.getByRole('button', { name: 'Switch between light and dark' }));

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('never asks for a third theme, whatever the toggle starts from', async () => {
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });
    const user = userEvent.setup();
    render(<ThemeSwitch />);

    await user.click(screen.getByRole('button', { name: 'Switch between light and dark' }));

    expect(mockSetTheme).toHaveBeenCalledTimes(1);
    expect(mockSetTheme.mock.calls[0]?.[0]).not.toBe('light');
  });
});
