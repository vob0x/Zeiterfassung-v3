/**
 * v3 Type-Definitionen. M1-Scope: Auth + Profile. Erweitert pro
 * Milestone (M3 → TimeEntry, M5 → Team etc.).
 */

export interface Profile {
  id: string;
  codename: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  user: Profile;
  access_token: string;
  refresh_token: string;
}
