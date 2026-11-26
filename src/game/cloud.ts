const REPO_OWNER = 'Ren-Scarlet';
const REPO_NAME = 'Terrifying-hunt-';
const CONFIG_PATH = 'data/game-config.json';
const BRANCH = 'main';
export type CloudConfig = { cards: Record<string, unknown>; powers: Record<string, unknown> };
let githubToken: string | null = null;
let githubLogin: string | null = null;

export async function initCloudAuth(): Promise<void> {
  // GitHub PAT 只保存在当前页面内存中；刷新页面后需要重新验证。
}
export function isCloudSignedIn(): boolean { return !!githubToken && githubLogin === REPO_OWNER; }
export function clearGitHubToken(): void { githubToken = null; githubLogin = null; }

export async function verifyGitHubToken(token: string): Promise<string> {
  const clean = token.trim();
  if (!clean) throw new Error('请先粘贴 GitHub 密钥。');
  const headers = { Authorization: 'Bearer ' + clean, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const userResponse = await fetch('https://api.github.com/user', { headers });
  if (!userResponse.ok) throw new Error(userResponse.status === 401 ? '密钥无效或已过期。' : 'GitHub 验证失败（HTTP ' + userResponse.status + '）。');
  const user = await userResponse.json() as { login?: string };
  if (user.login !== REPO_OWNER) throw new Error('当前密钥属于 ' + (user.login ?? '未知账号') + '，请使用 Ren-Scarlet 账号创建的密钥。');
  const repoResponse = await fetch('https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/README.md?ref=' + BRANCH, { headers });
  if (!repoResponse.ok) {
    if (repoResponse.status === 404 || repoResponse.status === 403) throw new Error('密钥无法读取游戏仓库。请将 Fine-grained token 限定到 Ren-Scarlet/Terrifying-hunt-，并授予 Contents 读写权限。');
    throw new Error('仓库授权检查失败（HTTP ' + repoResponse.status + '）。');
  }
  githubToken = clean;
  githubLogin = user.login;
  return user.login;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function apiHeaders(): Record<string, string> {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(githubToken ? { Authorization: 'Bearer ' + githubToken } : {}) };
}

export async function loadCloudConfig(): Promise<CloudConfig | null> {
  const url = 'https://raw.githubusercontent.com/' + REPO_OWNER + '/' + REPO_NAME + '/' + BRANCH + '/' + CONFIG_PATH;
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('读取公开配置失败（HTTP ' + response.status + '）。');
  return await response.json() as CloudConfig;
}

export async function saveCloudConfig(config: CloudConfig): Promise<void> {
  if (!githubToken || githubLogin !== REPO_OWNER) throw new Error('请先验证 GitHub 管理密钥。');
  const url = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + CONFIG_PATH;
  const headers = { ...apiHeaders(), 'Content-Type': 'application/json' };
  const current = await fetch(url + '?ref=' + BRANCH, { headers });
  let sha: string | undefined;
  if (current.ok) {
    const file = await current.json() as { sha?: string };
    sha = file.sha;
  } else if (current.status !== 404) {
    throw new Error('检查云端旧配置失败（HTTP ' + current.status + '）。');
  }
  const body: Record<string, string> = {
    message: 'Update game balance configuration',
    content: encodeBase64Utf8(JSON.stringify(config, null, 2) + '\'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { message?: string };
    if (response.status === 401 || response.status === 403) throw new Error('GitHub 拒绝写入：请确认密钥有 Contents: Read and write 权限。');
    if (response.status === 409 || response.status === 422) throw new Error('云端文件发生冲突，请重新读取配置后再上传。');
    throw new Error('上传云端失败（HTTP ' + response.status + '）：' + (detail.message ?? '未知错误'));
  }
}
