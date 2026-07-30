import type { Metadata } from 'next';
import { PreviewManager } from '@/components/app/admin/preview/preview-manager';

export const metadata: Metadata = {
  title: 'Preview',
  description: 'Test accounts that walk the product without changing the figures',
};

/**
 * Admin preview page (F19) — a leaf admin surface under `app/admin/programme/**`, reached from the
 * "Reclaim Your Week" sidebar section registered in `lib/app/leaf-admin-nav.ts`.
 *
 * Admin authorisation is enforced where it belongs — on the API routes this component calls
 * (`withAdminAuth`) — plus the edge session gate on `/admin`. The page itself is a shell, matching
 * `app/admin/programme/access/page.tsx`.
 */
export default function ProgrammePreviewPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <PreviewManager />
    </div>
  );
}
