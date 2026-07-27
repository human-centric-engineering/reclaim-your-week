/**
 * The audit programme (F4 t-4). The end-user surface: begin or resume a run, see where you are across
 * the seven phases, and talk with the coach. A thin Server Component; the interactive shell is a
 * client island that loads the run state and streams the conversation.
 */

import type { Metadata } from 'next';
import { ProgrammeShell } from '@/components/app/reclaim/programme-shell';

export const metadata: Metadata = {
  title: 'Your audit',
  description:
    'An honest look at where your time goes, and what a next level of leadership might ask.',
};

export default function ProgrammePage() {
  return <ProgrammeShell />;
}
