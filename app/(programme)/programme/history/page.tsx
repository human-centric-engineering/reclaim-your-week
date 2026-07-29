/**
 * The audit history. Every audit this leader has run: the open one, which continues, and the finished
 * ones, which open for reading. A thin Server Component; the list is a client island because it reads
 * the runs and renders nothing until it knows what is there.
 */

import type { Metadata } from 'next';
import { AuditHistory } from '@/components/app/reclaim/history/audit-history';

export const metadata: Metadata = {
  title: 'Your audits',
  description: 'The audits you have run, and the one you have open.',
};

export default function AuditHistoryPage() {
  return <AuditHistory />;
}
