import { authorizeOwner } from './admin-auth';
import type { User } from './types';

// The pilot follows the existing, pinned owner identity. Browser preferences
// choose a presentation; they never grant access to the pilot.
export async function designPreviewEligible(user: User | null): Promise<boolean> {
  if (user?.username !== 'artem') return false;
  try { await authorizeOwner(user); return true; } catch { return false; }
}
