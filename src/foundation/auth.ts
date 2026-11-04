import type { SupabaseClient } from '@supabase/supabase-js';

export async function signInWithMicrosoft(client: SupabaseClient) {
  return client.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email',
      redirectTo: window.location.origin,
    },
  });
}

export async function signOut(client: SupabaseClient) {
  return client.auth.signOut();
}
