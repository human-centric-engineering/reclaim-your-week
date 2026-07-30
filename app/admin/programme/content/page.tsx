import type { Metadata } from 'next';
import { ContentEditor } from '@/components/app/admin/content/content-editor';

export const metadata: Metadata = {
  title: 'Content · Programme',
  description: 'Bucket wording, benchmark ranges, hour bands, framing and the footnote',
};

/**
 * The content editor (F10 t-4). A shell — the guard is on the API route the component calls, which
 * forwards the save to the framework's module-config service (plan D6).
 *
 * Wider than a form since F18 t-1: the draft is read beside the fields rather than after saving, so
 * the page carries two columns on a large screen and stacks them on a small one.
 */
export default function ProgrammeContentPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Content</h1>
        <p className="text-muted-foreground text-sm">
          The words leaders read. Changes take effect immediately, and every version is kept.
        </p>
      </header>
      <ContentEditor />
    </div>
  );
}
