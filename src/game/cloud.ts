const PROJECT_URL = 'https://lbyobelugnlrkwwmnske.supabase.co';
const PUBLIC_KEY = 'sb_publishable_tC_VrNT8t2KkWyfIhVJUkA_kwzygUoK';
const SESSION_KEY = 'night-hunt-supabase-session-v1';
export type CloudConfig = { cards: Record<string, unknown>; powers: Record<string, unknown> };
type Session = { access_token: string; refresh_token: string; expires_at: number };
let session: Session | null = null;
function readSession(): Session | null {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as Session : null; } catch { return null; }
}
function saveSession(value: Session | null): void {
  session = value;
  try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}
export async function initCloudAuth(): Promise<void> {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const access = hash.get('access_token'), refresh = hash.get('refresh_token');
  if (access && refresh) {
    saveSession({ access_token: access, refresh_token: refresh, expires_at: Date.now() + Number(hash.get('expires_in') ?? 3600) * 1000 });
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } else session = readSession();
  if (session) {
    try { await refreshSession(); } catch { saveSession(null); }
  }
}
async function refreshSession(): Promise<void> {
  if (!session || session.expires_at > Date.now() + 60000) return;
  const response = await fetch(PROJECT_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) { saveSession(null); throw new Error('登录已过期，请重新发送登录链接。'); }
  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
}
export function isCloudSignedIn(): boolean { return !!session?.access_token; }
export async function sendCloudLogin(email: string): Promise<void> {
  const response = await fetch(PROJECT_URL + '/auth/v1/otp', {
    method: 'POST', headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false, options: { emailRedirectTo: window.location.origin + window.location.pathname + '?admin=1' } }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (detail.toLowerCase().includes('redirect')) throw new Error('Supabase 尚未允许游戏网址作为登录回跳地址，请在 Auth → URL Configuration 添加 GitHub Pages 地址。');
    throw new Error('登录邮件发送失败（HTTP ' + response.status + '）。请确认管理员邮箱已创建并验证。');
  }
}
export async function loadCloudConfig(): Promise<CloudConfig | null> {
  const response = await fetch(PROJECT_URL + '/rest/v1/game_config?id=eq.main&select=config', {
    headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + (session?.access_token ?? PUBLIC_KEY) },
  });
  if (!response.ok) throw new Error('读取云端配置失败（HTTP ' + response.status + '）。');
  const rows = await response.json() as Array<{ config?: CloudConfig }>;
  return rows[0]?.config ?? null;
}
export async function saveCloudConfig(config: CloudConfig): Promise<void> {
  await refreshSession();
  if (!session?.access_token) throw new Error('请先登录管理员账号。');
  const response = await fetch(PROJECT_URL + '/rest/v1/game_config?on_conflict=id', {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'main', config, updated_at: new Date().toISOString() }),
  });
  if (response.status === 401 || response.status === 403) throw new Error('云端拒绝写入：请确认管理员邮箱登录及 SQL 权限策略。');
  if (!response.ok) throw new Error('上传云端失败（HTTP ' + response.status + '）。');
}
