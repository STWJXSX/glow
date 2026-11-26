import axios from 'axios';
import { getMainAccountAuthor, type AccountData } from '#helpers/epic/account/avatarHandler.ts';

export interface StwCollectionImageHeader {
  displayName: string;
  avatarSrc: string | null;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 10_000,
    });
    const mime = String(res.headers['content-type'] ?? 'image/png').split(';')[0];
    const b64 = Buffer.from(res.data).toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch {
    return url;
  }
}

export async function resolveStwCollectionImageHeader(
  discordUserId: string,
  account: AccountData,
): Promise<StwCollectionImageHeader> {
  const author = await getMainAccountAuthor(discordUserId, account);
  const displayName = author?.name ?? account.displayName ?? 'Account';

  let avatarSrc: string | null = null;
  if (author?.iconURL) {
    avatarSrc = await fetchImageAsDataUrl(author.iconURL);
  }

  return { displayName, avatarSrc };
}

export function profileHeaderCss(): string {
  return `
    .profile-bar {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-bottom: 22px;
      padding-bottom: 14px;
      border-bottom: 2px solid rgba(255,255,255,.18);
    }
    .avatar {
      width: 72px;
      height: 72px;
      border-radius: 14px;
      object-fit: cover;
      border: 2px solid rgba(255,255,255,.25);
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
      background: rgba(0,0,0,.35);
      flex-shrink: 0;
    }
    .profile-text h1 {
      font-size: 32px;
      font-weight: 800;
      color: #fff;
      letter-spacing: .02em;
      text-shadow: 0 2px 10px rgba(0,0,0,.45);
      line-height: 1.1;
    }
    .meta {
      font-size: 14px;
      color: rgba(255,255,255,.72);
      margin-top: 6px;
    }
  `;
}

export function buildProfileHeaderHtml(header: StwCollectionImageHeader, metaLine: string): string {
  const avatar = header.avatarSrc
    ? `<img class="avatar" src="${header.avatarSrc}" alt="" />`
    : '<div class="avatar"></div>';

  return `
    <div class="profile-bar">
      ${avatar}
      <div class="profile-text">
        <h1>${escapeHtml(header.displayName)}</h1>
        <p class="meta">${escapeHtml(metaLine)}</p>
      </div>
    </div>
  `;
}
