/**
 * The preview screen (F19) — create a test account, adopt one, drive it, remove it.
 *
 * The behaviours worth pinning are the ones a reviewer skimming the component would assume work and
 * that a refactor could quietly break: the load-failure gate (an empty table must never read as "no
 * test accounts"), the password shown exactly once and never re-fetched, that a `fresh` account is
 * created with no email key at all (so the server default applies) while a typed address is sent
 * verbatim, and that each row's three actions call the right server action with the right id.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  listPreviewAccounts,
  createPreviewAccount,
  adoptPreviewAccount,
  fastForwardPreviewAccount,
  resetPreviewAccountPassword,
  removePreviewAccount,
} = vi.hoisted(() => ({
  listPreviewAccounts: vi.fn(),
  createPreviewAccount: vi.fn(),
  adoptPreviewAccount: vi.fn(),
  fastForwardPreviewAccount: vi.fn(),
  resetPreviewAccountPassword: vi.fn(),
  removePreviewAccount: vi.fn(),
}));
vi.mock('@/components/app/admin/actions', () => ({
  listPreviewAccounts,
  createPreviewAccount,
  adoptPreviewAccount,
  fastForwardPreviewAccount,
  resetPreviewAccountPassword,
  removePreviewAccount,
}));

import { PreviewManager } from '@/components/app/admin/preview/preview-manager';

const account = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  name: 'Test Leader',
  email: 'test@example.org',
  label: 'Checking the summary',
  createdAt: '2026-07-30T00:00:00.000Z',
  createdByName: 'Rashmir',
  state: 'none' as const,
  latestRunId: null,
  phaseKey: null,
  phaseLabel: null,
  phaseNumber: null,
  ...over,
});

/** The table row for an address, so assertions cannot accidentally match another row's cell. */
async function rowFor(email: string) {
  const cell = await screen.findByText(email);
  const tr = cell.closest('tr');
  if (tr === null) throw new Error(`no row for ${email}`);
  return within(tr);
}

const CREATED = {
  account: { userId: 'u2', email: 'ada+rywpreview-abc123@example.org', label: 'walkthrough' },
  password: 'Rwqwertyuiop7!',
  signInUrl: 'https://ryw.test/login',
  message: 'Test account created.',
};

/** The stand-in for `window.confirm`, installed in `beforeEach`. */
const confirmed = vi.fn<() => boolean>();

const RESET = {
  account: { userId: 'u1', email: 'test@example.org' },
  password: 'RwZxCvBnMqW9!',
  signInUrl: 'https://ryw.test/login',
  message: 'New password below, shown once.',
};

beforeEach(() => {
  vi.clearAllMocks();
  listPreviewAccounts.mockResolvedValue([]);
  // Both destructive row actions confirm first. The test environment has no `window.confirm` of its
  // own, so it is stubbed rather than left to blow up — and stubbing it is what lets the refusal
  // paths below assert that saying no really does call nothing.
  confirmed.mockReturnValue(true);
  vi.stubGlobal('confirm', confirmed);
});

describe('PreviewManager — loading the list', () => {
  it('says nothing about test accounts when the load fails', async () => {
    listPreviewAccounts.mockRejectedValue(new Error('network'));
    render(<PreviewManager />);

    // "No test accounts yet" after a failed fetch reads as "there is nothing here", which would send
    // an operator off to make a duplicate rather than retrying the load.
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/no test accounts yet/i)).not.toBeInTheDocument()
    );
  });

  it('shows an empty state distinct from a failed load', async () => {
    listPreviewAccounts.mockResolvedValue([]);
    render(<PreviewManager />);

    expect(await screen.findByText(/no test accounts yet/i)).toBeInTheDocument();
  });

  it('renders each account with its email, label and state', async () => {
    listPreviewAccounts.mockResolvedValue([
      account({ email: 'mid@example.org', state: 'in_progress' }),
    ]);
    render(<PreviewManager />);

    const row = await rowFor('mid@example.org');
    expect(row.getByText('Checking the summary')).toBeInTheDocument();
    // The state badge specifically. "In progress" rather than "Mid-audit" because a run filled in to
    // the summary is in progress too, and calling that mid-audit points at the wrong screen — and it
    // keeps the badge from sharing a word with the "Fill in mid-audit" command in the same row.
    expect(row.getByText('In progress', { selector: 'span' })).toBeInTheDocument();
    expect(row.getByText('Rashmir')).toBeInTheDocument();
  });

  it('shows a dash for made-by when nobody is recorded', async () => {
    listPreviewAccounts.mockResolvedValue([account({ createdByName: null })]);
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    expect(row.getByText('—')).toBeInTheDocument();
  });
});

describe('PreviewManager — creating an account', () => {
  it('sends no email key at all when the field is left blank', async () => {
    // The server's default (a plus-subaddress of the acting admin) only applies when the key is
    // absent — sending an empty string would be a different, wrong request.
    createPreviewAccount.mockResolvedValue(CREATED);
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'Checking the summary'
    );
    await user.click(screen.getByRole('button', { name: /create test account/i }));

    await waitFor(() => expect(createPreviewAccount).toHaveBeenCalled());
    const call = createPreviewAccount.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('email');
    expect(call).toMatchObject({ label: 'Checking the summary', state: 'fresh' });
  });

  it('sends a typed address verbatim, trimmed', async () => {
    createPreviewAccount.mockResolvedValue(CREATED);
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'walkthrough'
    );
    await user.type(
      screen.getByLabelText(/^email$/i, { selector: '#preview-email' }),
      '  ada+t1@example.org  '
    );
    await user.click(screen.getByRole('button', { name: /create test account/i }));

    await waitFor(() =>
      expect(createPreviewAccount).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ada+t1@example.org' })
      )
    );
  });

  it('sends the last phase as `summary`, not as a phase to stop at', async () => {
    // `summary` is not simply "phase 6": it is the target that writes the analyst reading, so the
    // last phase has to travel under that name rather than as a `toPhase`.
    createPreviewAccount.mockResolvedValue(CREATED);
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'walkthrough'
    );
    await user.selectOptions(screen.getByLabelText(/where it starts/i), 'phase-6-summary');
    await user.click(screen.getByRole('button', { name: /create test account/i }));

    await waitFor(() =>
      expect(createPreviewAccount).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'summary' })
      )
    );
    expect(createPreviewAccount.mock.calls[0]?.[0]).not.toHaveProperty('toPhase');
  });

  it('offers every phase, not the three states it used to', async () => {
    // The control could only ever show an operator two of the seven screens, and its "Mid-audit"
    // always meant phase 4 because nothing on the screen sent the phase the API already accepted.
    render(<PreviewManager />);

    const options = within(screen.getByLabelText(/where it starts/i)).getAllByRole('option');

    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'fresh',
      'phase-0-setup',
      'phase-1-current',
      'phase-2-energy',
      'phase-3-ideal',
      'phase-4-gap',
      'phase-5-action',
      'phase-6-summary',
    ]);
  });

  it('sends a middle phase as a `toPhase`', async () => {
    createPreviewAccount.mockResolvedValue(CREATED);
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'walkthrough'
    );
    await user.selectOptions(screen.getByLabelText(/where it starts/i), 'phase-2-energy');
    await user.click(screen.getByRole('button', { name: /create test account/i }));

    await waitFor(() =>
      expect(createPreviewAccount).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'mid-audit', toPhase: 'phase-2-energy' })
      )
    );
  });

  it('cannot be submitted with no label', () => {
    render(<PreviewManager />);

    expect(screen.getByRole('button', { name: /create test account/i })).toBeDisabled();
  });

  it('shows the password once, and says it cannot be shown again', async () => {
    createPreviewAccount.mockResolvedValue(CREATED);
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'walkthrough'
    );
    await user.click(screen.getByRole('button', { name: /create test account/i }));

    expect(await screen.findByText(CREATED.password)).toBeInTheDocument();
    expect(screen.getByText(/shown once/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be shown again/i)).toBeInTheDocument();
  });

  it('copies the password to the clipboard', async () => {
    createPreviewAccount.mockResolvedValue(CREATED);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'walkthrough'
    );
    await user.click(screen.getByRole('button', { name: /create test account/i }));
    await user.click(await screen.findByRole('button', { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith(CREATED.password);
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('clears the reveal on the next attempt, so a stale password is never shown', async () => {
    createPreviewAccount.mockResolvedValueOnce(CREATED).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'one'
    );
    await user.click(screen.getByRole('button', { name: /create test account/i }));
    expect(await screen.findByText(CREATED.password)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'two'
    );
    await user.click(screen.getByRole('button', { name: /create test account/i }));

    await waitFor(() => expect(screen.queryByText(CREATED.password)).not.toBeInTheDocument());
  });

  it('surfaces the server’s refusal', async () => {
    createPreviewAccount.mockRejectedValue(new Error('An account already exists for this email'));
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(
      screen.getByLabelText(/what it is for/i, { selector: '#preview-label' }),
      'walkthrough'
    );
    await user.click(screen.getByRole('button', { name: /create test account/i }));

    expect(await screen.findByText('An account already exists for this email')).toBeInTheDocument();
  });
});

describe('PreviewManager — adopting an existing account', () => {
  it('explains what the label is for on BOTH forms, not just the create one', async () => {
    // The two "What it is for" fields feed the same badge column, so they carry the same non-obvious
    // consequence: this text is the only thing on Clients and Shared results that says why the
    // account exists. Explaining it on one form and not the other is the inconsistency this pins.
    render(<PreviewManager />);

    for (const id of ['#preview-label', '#adopt-label']) {
      const field = document.querySelector(id)?.closest('div');
      expect(
        within(field as HTMLElement).getByRole('button', { name: /more information/i }),
        `${id} has no FieldHelp`
      ).toBeInTheDocument();
    }
  });

  it('cannot be submitted with an email but no label, or the reverse', async () => {
    const user = userEvent.setup();
    render(<PreviewManager />);

    const button = screen.getByRole('button', { name: /mark as a test account/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/^email$/i, { selector: '#adopt-email' }), 'a@b.co');
    expect(button).toBeDisabled();
  });

  it('normalises the address and clears the fields on success', async () => {
    adoptPreviewAccount.mockResolvedValue('Marked as a test account.');
    const user = userEvent.setup();
    render(<PreviewManager />);

    await user.type(screen.getByPlaceholderText(/you\+test1/i), '  Ada+T1@Example.ORG  ');
    await user.type(screen.getByPlaceholderText(/walked the invitation link/i), 'front door walk');
    await user.click(screen.getByRole('button', { name: /mark as a test account/i }));

    await waitFor(() =>
      expect(adoptPreviewAccount).toHaveBeenCalledWith({
        email: 'ada+t1@example.org',
        label: 'front door walk',
      })
    );
    expect(await screen.findByText('Marked as a test account.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you\+test1/i)).toHaveValue('');
  });
});

describe('PreviewManager — acting on a listed account', () => {
  it('fills in to the phase picked on that row', async () => {
    listPreviewAccounts.mockResolvedValue([account()]);
    fastForwardPreviewAccount.mockResolvedValue('That test account is now sitting at Energy.');
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.selectOptions(row.getByLabelText(/how far to fill in/i), 'phase-2-energy');
    await user.click(row.getByRole('button', { name: /^fill in$/i }));

    expect(fastForwardPreviewAccount).toHaveBeenCalledWith('u1', {
      to: 'mid-audit',
      toPhase: 'phase-2-energy',
    });
  });

  it('starts a row on no phase at all, with Fill in unusable until one is picked', async () => {
    // The old default was the last phase, and it was the whole of the confusion: a row for an account
    // with nothing filled in announced "At the summary (phase 6)", which reads as where the account
    // IS. A command must not be able to masquerade as a state, so nothing is preselected.
    listPreviewAccounts.mockResolvedValue([account()]);
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    expect(row.getByLabelText(/how far to fill in/i)).toHaveValue('');
    expect(row.getByRole('button', { name: /^fill in$/i })).toBeDisabled();

    await user.selectOptions(row.getByLabelText(/how far to fill in/i), 'phase-6-summary');
    expect(row.getByRole('button', { name: /^fill in$/i })).toBeEnabled();
  });

  it('keeps each row’s phase to itself', async () => {
    // An operator working through a list is comparing screens: filling one account in to phase 2 and
    // the next to the summary is the point, and one shared selector would reset between them.
    listPreviewAccounts.mockResolvedValue([
      account(),
      account({ userId: 'u2', email: 'second@example.org' }),
    ]);
    fastForwardPreviewAccount.mockResolvedValue('Done.');
    const user = userEvent.setup();
    render(<PreviewManager />);

    const first = await rowFor('test@example.org');
    await user.selectOptions(first.getByLabelText(/how far to fill in/i), 'phase-1-current');

    const second = await rowFor('second@example.org');
    expect(second.getByLabelText(/how far to fill in/i)).toHaveValue('');
    await user.selectOptions(second.getByLabelText(/how far to fill in/i), 'phase-6-summary');
    await user.click(second.getByRole('button', { name: /^fill in$/i }));

    expect(fastForwardPreviewAccount).toHaveBeenCalledWith('u2', { to: 'summary' });
  });

  it('asks before filling in, and writes nothing when the answer is no', async () => {
    // Filling in spends one of the account's audits and cannot be undone. The confirmation names the
    // account and the phase rather than asking "are you sure".
    confirmed.mockReturnValue(false);
    listPreviewAccounts.mockResolvedValue([account()]);
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.selectOptions(row.getByLabelText(/how far to fill in/i), 'phase-2-energy');
    await user.click(row.getByRole('button', { name: /^fill in$/i }));

    expect(confirmed).toHaveBeenCalledWith(expect.stringContaining('test@example.org'));
    expect(fastForwardPreviewAccount).not.toHaveBeenCalled();
  });

  it('surfaces the engine’s own refusal from a fast-forward, not a generic message', async () => {
    listPreviewAccounts.mockResolvedValue([account()]);
    fastForwardPreviewAccount.mockRejectedValue(
      new Error('preview: the engine refused to leave phase-1-current (reflection required)')
    );
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.selectOptions(row.getByLabelText(/how far to fill in/i), 'phase-6-summary');
    await user.click(row.getByRole('button', { name: /^fill in$/i }));

    expect(await screen.findByText(/refused to leave phase-1-current/i)).toBeInTheDocument();
  });

  it('removes the account and reloads the list', async () => {
    listPreviewAccounts.mockResolvedValueOnce([account()]).mockResolvedValueOnce([]);
    removePreviewAccount.mockResolvedValue('Test account removed.');
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.click(row.getByRole('button', { name: /remove/i }));

    expect(removePreviewAccount).toHaveBeenCalledWith('u1');
    expect(await screen.findByText('Test account removed.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('test@example.org')).not.toBeInTheDocument());
  });
});

describe('PreviewManager — getting back into an account', () => {
  it('mints a new password and shows it', async () => {
    // The reason this exists: the password from creation is stored nowhere, so an operator who closed
    // that panel used to have to remove the account — and the audit on it — to recover the login.
    listPreviewAccounts.mockResolvedValue([account()]);
    resetPreviewAccountPassword.mockResolvedValue(RESET);
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.click(row.getByRole('button', { name: /sign-in details/i }));

    expect(resetPreviewAccountPassword).toHaveBeenCalledWith('u1');
    expect(await screen.findByText(RESET.password)).toBeInTheDocument();
  });

  it('asks first, because the old password stops working', async () => {
    confirmed.mockReturnValue(false);
    listPreviewAccounts.mockResolvedValue([account()]);
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.click(row.getByRole('button', { name: /sign-in details/i }));

    expect(resetPreviewAccountPassword).not.toHaveBeenCalled();
  });

  it('puts the credential away when the operator does something else', async () => {
    // Left up, the panel would sit under the table showing the sign-in details of an account that
    // Remove had just erased.
    listPreviewAccounts.mockResolvedValue([account()]);
    resetPreviewAccountPassword.mockResolvedValue(RESET);
    removePreviewAccount.mockResolvedValue('Test account removed.');
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.click(row.getByRole('button', { name: /sign-in details/i }));
    expect(await screen.findByText(RESET.password)).toBeInTheDocument();

    await user.click(row.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(screen.queryByText(RESET.password)).not.toBeInTheDocument());
  });

  it('surfaces a refusal rather than a blank panel', async () => {
    listPreviewAccounts.mockResolvedValue([account()]);
    resetPreviewAccountPassword.mockRejectedValue(new Error('That is not a test account'));
    const user = userEvent.setup();
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    await user.click(row.getByRole('button', { name: /sign-in details/i }));

    expect(await screen.findByText('That is not a test account')).toBeInTheDocument();
  });
});

describe('PreviewManager — where each account is', () => {
  it('says an unstarted account has nothing filled in', async () => {
    listPreviewAccounts.mockResolvedValue([account()]);
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    expect(row.getByText(/nothing filled in/i)).toBeInTheDocument();
  });

  it('names the phase an open audit is sitting at', async () => {
    // The fix for the reported confusion. Where the account IS now comes from the run, in words,
    // under the badge — not from the phase sitting in a dropdown that writes one.
    listPreviewAccounts.mockResolvedValue([
      account({
        state: 'in_progress',
        phaseKey: 'phase-4-gap',
        phaseLabel: 'Gap analysis',
        phaseNumber: 4,
      }),
    ]);
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    // Scoped to the sentence, not the phrase: the Fill in menu in the same row carries an option
    // worded almost identically, which is precisely the collision this column had to resolve.
    expect(row.getByText(/sitting at gap analysis \(phase 4\)\./i)).toBeInTheDocument();
  });

  it('says the summary stops before ‘finish my audit’', async () => {
    // The distinction that matters most to an operator: the summary, the report and the sharing
    // choices all live on that screen *before* the finish button, and finishing takes them away.
    listPreviewAccounts.mockResolvedValue([
      account({
        state: 'in_progress',
        phaseKey: 'phase-6-summary',
        phaseLabel: 'Summary',
        phaseNumber: 6,
      }),
    ]);
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    expect(row.getByText(/before ‘finish my audit’/i)).toBeInTheDocument();
  });

  it('says a finished audit moved into the history read-back', async () => {
    listPreviewAccounts.mockResolvedValue([account({ state: 'complete', latestRunId: 'run-1' })]);
    render(<PreviewManager />);

    const row = await rowFor('test@example.org');
    expect(row.getByText(/history read-back/i)).toBeInTheDocument();
  });
});
