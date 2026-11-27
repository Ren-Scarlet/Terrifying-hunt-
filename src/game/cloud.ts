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
    content: encodeBase64Utf8(JSON.stringify(config, null, 2)),
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

/* ==========================================================================
   配件发布：把工坊做的配件写回仓库（commit 到 main，Actions 部署后全员可见）
   ========================================================================== */
const ACCESSORY_PUBLISH_PATH = 'src/game/data/published-accessories.json';
const ACCESSORY_ICON_DIR = 'public/assets/custom';

async function putRepoFile(path: string, contentBase64: string, message: string): Promise<void> {
  if (!githubToken || githubLogin !== REPO_OWNER) throw new Error('请先在平衡调整里验证 GitHub 管理密钥。');
  const url = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + path;
  const headers = { ...apiHeaders(), 'Content-Type': 'application/json' };
  const current = await fetch(url + '?ref=' + BRANCH, { headers });
  let sha: string | undefined;
  if (current.ok) {
    const file = await current.json() as { sha?: string };
    sha = file.sha;
  } else if (current.status !== 404) {
    throw new Error('检查 ' + path + ' 失败（HTTP ' + current.status + '）');
  }
  const body: Record<string, string> = { message, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { message?: string };
    if (response.status === 401 || response.status === 403) throw new Error('GitHub 拒绝写入：请确认密钥有 Contents: Read and write 权限。');
    if (response.status === 409 || response.status === 422) throw new Error('仓库文件冲突，请刷新后重试。');
    throw new Error('上传 ' + path + ' 失败（HTTP ' + response.status + '）：' + (detail.message ?? '未知错误'));
  }
}

export interface PublishResult { count: number; icons: number }

/** 把配件列表发布进仓库：图标单独存成文件，JSON 里只留路径。 */
export async function publishAccessoryPack(defs: Array<Record<string, unknown>>): Promise<PublishResult> {
  const cleaned: Array<Record<string, unknown>> = [];
  let icons = 0;
  for (const def of defs) {
    const copy: Record<string, unknown> = { ...def };
    const iconData = typeof copy.iconData === 'string' ? copy.iconData : '';
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(iconData);
    if (match) {
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const path = ACCESSORY_ICON_DIR + '/' + String(copy.id) + '.' + ext;
      await putRepoFile(path, match[2], 'assets: accessory icon ' + copy.id);
      copy.iconPath = 'assets/custom/' + String(copy.id) + '.' + ext;
      delete copy.iconData;
      icons += 1;
    }
    cleaned.push(copy);
  }
  await putRepoFile(
    ACCESSORY_PUBLISH_PATH,
    encodeBase64Utf8(JSON.stringify(cleaned, null, 2)),
    'data: publish custom accessories (' + cleaned.length + ')',
  );
  return { count: cleaned.length, icons };
}
