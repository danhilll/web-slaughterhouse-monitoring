import { auth } from './firebase';

export const WEB_ACCESS_LOST_EVENT = 'web-admin-access-lost';

function reportAccessLost(status: 401 | 403): void {
  window.dispatchEvent(new CustomEvent(WEB_ACCESS_LOST_EVENT, { detail: status }));
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!input.startsWith('/api/')) throw new Error('API requests must use a same-origin /api/ path.');
  const user = auth?.currentUser;
  if (!user) throw new Error('Please sign in to continue.');

  let token: string;
  try {
    token = await user.getIdToken();
  } catch (reason) {
    const code = typeof reason === 'object' && reason !== null && 'code' in reason
      ? String(reason.code)
      : '';
    if (['auth/user-disabled', 'auth/user-not-found', 'auth/invalid-user-token', 'auth/user-token-expired'].includes(code)) {
      reportAccessLost(401);
    }
    throw reason;
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 || response.status === 403) {
    reportAccessLost(response.status);
  }
  return response;
}
