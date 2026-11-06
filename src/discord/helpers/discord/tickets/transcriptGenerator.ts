/**
 * HTML Transcript Generator — Discord replica
 * Generates a pixel-faithful Discord-style HTML transcript for closed tickets.
 * Features: message grouping, full markdown, inline image previews + lightbox,
 * date dividers, sticky topbar, info sidebar.
 */

import type { ITicket, ITicketMessage } from '#models/Ticket.ts';

// ── Helpers ──────────────────────────────────────────────────

function esc(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMeta(date: Date): string {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function fmtDiscord(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday at ${time}`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + time;
}

function fmtDivider(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function avatarUrl(authorAvatar: string, authorId: string): string {
  if (authorAvatar?.startsWith('http')) return esc(authorAvatar);
  if (authorAvatar) return `https://cdn.discordapp.com/avatars/${encodeURIComponent(authorId)}/${encodeURIComponent(authorAvatar)}.png?size=80`;
  const idx = (BigInt(authorId) >> 22n) % 6n;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
function isImage(url: string): boolean {
  try { return IMAGE_RE.test(new URL(url).pathname); } catch { return IMAGE_RE.test(url); }
}

const GROUP_MS = 7 * 60 * 1000;
function sameGroup(a: ITicketMessage, b: ITicketMessage): boolean {
  return a.authorId === b.authorId &&
    Math.abs(new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) < GROUP_MS;
}

// ── Markdown renderer ────────────────────────────────────────

function md(raw: string): string {
  if (!raw) return '';

  // 1. Protect ```code blocks```
  const codeBlocks: string[] = [];
  let s = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = codeBlocks.push(
      `<pre class="cb"><code class="lang-${esc(lang || 'text')}">${esc(code.replace(/^\n/, '').replace(/\n$/, ''))}</code></pre>`
    ) - 1;
    return `\x00CB${i}\x00`;
  });

  // 2. Protect `inline code`
  const ic: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    const i = ic.push(`<code class="ic">${esc(code)}</code>`) - 1;
    return `\x00IC${i}\x00`;
  });

  // 3. Protect > blockquotes (needs raw > before HTML escape)
  const bq: string[] = [];
  s = s.replace(/^> (.+)$/gm, (_, c) => {
    const i = bq.push(`<blockquote class="bq">${esc(c)}</blockquote>`) - 1;
    return `\x00BQ${i}\x00`;
  });

  // 4. Protect # headers
  const headers: string[] = [];
  s = s.replace(/^### (.+)$/gm, (_, c) => { const i = headers.push(`<h3 class="h3">${esc(c)}</h3>`) - 1; return `\x00HD${i}\x00`; });
  s = s.replace(/^## (.+)$/gm,  (_, c) => { const i = headers.push(`<h2 class="h2">${esc(c)}</h2>`) - 1; return `\x00HD${i}\x00`; });
  s = s.replace(/^# (.+)$/gm,   (_, c) => { const i = headers.push(`<h1 class="h1">${esc(c)}</h1>`) - 1; return `\x00HD${i}\x00`; });

  // 5. HTML-escape the remainder
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 6. Discord custom emoji <:name:id> / <a:name:id>
  s = s.replace(/&lt;a?:(\w+):(\d+)&gt;/g,
    '<img class="emoji" src="https://cdn.discordapp.com/emojis/$2.webp?size=32" alt=":$1:" title=":$1:">');

  // 7. Discord mentions
  s = s.replace(/&lt;@!?(\d+)&gt;/g,   '<span class="mn">@$1</span>');
  s = s.replace(/&lt;#(\d+)&gt;/g,     '<span class="ch">#$1</span>');
  s = s.replace(/&lt;@&amp;(\d+)&gt;/g,'<span class="rl">@$1</span>');

  // 8. Bold+italic → bold → italic → underline → strikethrough
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g,     '<em>$1</em>');
  s = s.replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '<em>$1</em>');
  s = s.replace(/__([^_\n]+)__/g,     '<u>$1</u>');
  s = s.replace(/~~([^~\n]+)~~/g,     '<del>$1</del>');

  // 9. Markdown links [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a class="lk" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 10. Raw URLs (not already inside an href)
  s = s.replace(/(?<![="'>])(https?:\/\/[^\s<&"]+)/g,
    '<a class="lk" href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  // 11. Restore protected tokens
  s = s.replace(/\x00HD(\d+)\x00/g, (_, i) => headers[+i]);
  s = s.replace(/\x00BQ(\d+)\x00/g, (_, i) => bq[+i]);
  s = s.replace(/\x00IC(\d+)\x00/g, (_, i) => ic[+i]);
  s = s.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[+i]);

  // 12. Newlines → <br>
  s = s.replace(/\n/g, '<br>');

  return s;
}

// ── Statics ──────────────────────────────────────────────────

const TOPIC_DISPLAY: Record<string, string> = {
  premium: 'Premium',
  bot_support: 'Bot Support',
  server_issues: 'Server Issues',
  other: 'Other',
};

const PLAN_DISPLAY: Record<string, string> = {
  basic_monthly: 'Basic Monthly',
  basic_annual: 'Basic Annual',
  pro_monthly: 'Pro Monthly',
  pro_annual: 'Pro Annual',
  ultimate_monthly: 'Ultimate Monthly',
  ultimate_annual: 'Ultimate Annual',
  ultimate_lifetime: 'Ultimate Lifetime',
  monthly: 'Ultimate Monthly (legacy)',
  yearly: 'Ultimate Annual (legacy)',
  immortal: 'Ultimate Lifetime (legacy)',
};

// ── Main export ──────────────────────────────────────────────

export function generateTranscriptHtml(ticket: ITicket, closerTag: string): string {
  const msgs = ticket.messages;
  const topicLabel = TOPIC_DISPLAY[ticket.topic] || ticket.topic;
  const planLabel  = ticket.premiumPlan ? PLAN_DISPLAY[ticket.premiumPlan] || ticket.premiumPlan : null;
  const channelName = ticket.topic === 'premium'
    ? `premium-${esc(ticket.userTag.split('#')[0])}`
    : `ticket-${esc(ticket.userTag.split('#')[0])}`;

  // Build message HTML with grouping + date dividers
  let lastDate = '';
  const parts: string[] = [];

  msgs.forEach((msg, i) => {
    const d = new Date(msg.timestamp);
    const dateKey = d.toDateString();
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      parts.push(`<div class="date-div"><span>${esc(fmtDivider(d))}</span></div>`);
    }

    const continued = i > 0 && sameGroup(msgs[i - 1], msg);
    const av = avatarUrl(msg.authorAvatar, msg.authorId);
    const content = md(msg.content);
    const timeShort = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

    const attachHtml = (msg.attachments || []).map(url =>
      isImage(url)
        ? `<div class="att-img"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-lightbox><img src="${esc(url)}" alt="attachment" loading="lazy"></a></div>`
        : `<div class="att-file"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">📎 ${esc(url.split('/').pop()?.split('?')[0] || 'file')}</a></div>`
    ).join('');

    if (continued) {
      parts.push(`<div class="msg msg-c"><span class="side-ts">${esc(timeShort)}</span><div class="mbody">${content}${attachHtml}</div></div>`);
    } else {
      parts.push(`<div class="msg"><div class="av-col"><img class="av" src="${av}" alt="${esc(msg.authorTag)}" loading="lazy"></div><div class="mbody"><div class="mhdr"><span class="author">${esc(msg.authorTag)}</span><span class="ts" title="${esc(fmtMeta(d))}">${esc(fmtDiscord(d))}</span></div>${content}${attachHtml}</div></div>`);
    }
  });

  const messagesHtml = parts.join('\n') ||
    '<div class="empty">No messages were recorded in this ticket.</div>';

  const generatedAt = fmtMeta(new Date());

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transcript · ${esc(ticket.userTag)} · ${esc(topicLabel)}</title>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
:root{
  --bg0:#313338;--bg1:#2b2d31;--bg2:#1e1f22;
  --acc:#8a2be2;
  --t0:#f2f3f5;--t1:#dbdee1;--t2:#b5bac1;--t3:#80848e;
  --lk:#00a8fc;
  --div:#3f4147;
  --hov:#35373c;
  --mn-bg:rgba(88,101,242,.1);--mn-t:#c9cdfb;--mn-hov:rgba(88,101,242,.3);
  --ch-bg:rgba(88,101,242,.08);--ch-t:#c9cdfb;
  --rl-bg:rgba(230,166,89,.1);--rl-t:#e6a659;
  --code-t:#f47067;
}
body{background:var(--bg0);color:var(--t1);font-family:'gg sans','Noto Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.375;display:flex;flex-direction:column;min-height:100vh}

/* topbar */
.topbar{background:var(--bg1);border-bottom:1px solid var(--div);height:48px;padding:0 16px;display:flex;align-items:center;gap:8px;flex-shrink:0;position:sticky;top:0;z-index:100}
.tb-icon{color:var(--t3);font-size:18px}
.tb-name{color:var(--t0);font-weight:700}
.tb-sep{color:var(--div);margin:0 4px}
.tb-topic{color:var(--t3);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* layout */
.layout{display:flex;flex:1;overflow:hidden;min-height:0}

/* sidebar */
.sb{width:232px;flex-shrink:0;background:var(--bg1);border-right:1px solid var(--div);overflow-y:auto;padding:16px 0;scrollbar-width:thin;scrollbar-color:var(--bg2) var(--bg1)}
.sb::-webkit-scrollbar{width:6px} .sb::-webkit-scrollbar-thumb{background:var(--bg2);border-radius:3px}
.sb-sect{padding:0 12px 8px}
.sb-lbl{text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--t3);margin-bottom:6px;padding:0 4px}
.sb-row{padding:3px 4px;font-size:13px;color:var(--t2);line-height:1.6}
.sb-row strong{color:var(--t0);font-weight:600}
.sb-badge{display:inline-block;background:var(--acc);color:#fff;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px}
.sb-div{height:1px;background:var(--div);margin:8px 12px}
.sb-closed{color:#f04747;font-weight:600}

/* chat */
.chat{flex:1;overflow-y:auto;padding:16px 0 40px;scrollbar-width:thin;scrollbar-color:var(--bg2) var(--bg0)}
.chat::-webkit-scrollbar{width:8px} .chat::-webkit-scrollbar-track{background:var(--bg0)} .chat::-webkit-scrollbar-thumb{background:var(--bg2);border-radius:4px}

/* messages */
.msg{display:flex;padding:2px 16px;position:relative;border-radius:2px;transition:background .05s}
.msg:hover{background:var(--hov)}
.msg:hover .side-ts{opacity:1}
.msg-c{padding-left:72px}
.av-col{width:40px;flex-shrink:0;margin-right:16px;padding-top:2px}
.av{width:40px;height:40px;border-radius:50%;object-fit:cover;display:block}
.side-ts{position:absolute;left:16px;width:40px;display:flex;align-items:center;justify-content:flex-end;font-size:11px;color:var(--t3);opacity:0;transition:opacity .1s;line-height:1.375;padding-top:4px;white-space:nowrap}
.mbody{min-width:0;flex:1;padding:2px 0}
.mhdr{display:flex;align-items:baseline;gap:8px;margin-bottom:2px}
.author{font-weight:600;font-size:15px;color:var(--t0)}
.ts{font-size:12px;color:var(--t3);cursor:default}
.ts:hover{color:var(--t2)}

/* content */
.mbody > *:not(.mhdr){color:var(--t1);word-wrap:break-word;word-break:break-word}
strong{font-weight:700} em{font-style:italic} u{text-decoration:underline} del{text-decoration:line-through}
.h1{font-size:1.75em;border-bottom:1px solid var(--div);padding-bottom:4px;margin:6px 0;color:var(--t0)}
.h2{font-size:1.375em;border-bottom:1px solid var(--div);padding-bottom:4px;margin:6px 0;color:var(--t0)}
.h3{font-size:1.125em;margin:6px 0;color:var(--t0)}
.bq{border-left:4px solid var(--div);padding:2px 8px;margin:4px 0;color:var(--t2)}
.ic{background:var(--bg2);border-radius:3px;padding:.15em .4em;font-family:Consolas,monospace;font-size:.875em;color:var(--code-t)}
.cb{background:var(--bg2);border:1px solid var(--div);border-radius:4px;padding:12px;margin:6px 0;overflow-x:auto;font-family:Consolas,monospace;font-size:.875em;line-height:1.5;white-space:pre}
.cb code{background:none;color:var(--t1);padding:0}
.lk{color:var(--lk);text-decoration:none} .lk:hover{text-decoration:underline}
.mn{background:var(--mn-bg);color:var(--mn-t);border-radius:3px;padding:0 2px;font-weight:500;cursor:default} .mn:hover{background:var(--mn-hov);color:#fff}
.ch{background:var(--ch-bg);color:var(--ch-t);border-radius:3px;padding:0 2px;font-weight:500}
.rl{background:var(--rl-bg);color:var(--rl-t);border-radius:3px;padding:0 2px;font-weight:500}
.emoji{width:20px;height:20px;vertical-align:middle;object-fit:contain}

/* attachments */
.att-img{margin-top:8px;max-width:520px}
.att-img img{max-width:100%;max-height:320px;border-radius:4px;object-fit:contain;display:block;cursor:zoom-in}
.att-file{display:inline-flex;align-items:center;gap:8px;background:var(--bg1);border:1px solid var(--div);border-radius:4px;padding:8px 14px;margin-top:6px}
.att-file a{color:var(--lk);text-decoration:none;font-size:14px} .att-file a:hover{text-decoration:underline}

/* date divider */
.date-div{display:flex;align-items:center;gap:8px;padding:20px 16px 8px;color:var(--t3);font-size:12px;font-weight:600}
.date-div::before,.date-div::after{content:'';flex:1;height:1px;background:var(--div)}

/* empty */
.empty{text-align:center;color:var(--t3);font-size:14px;padding:80px 16px}

/* lightbox */
#lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:999;align-items:center;justify-content:center;cursor:zoom-out}
#lb.on{display:flex}
#lb img{max-width:90vw;max-height:90vh;object-fit:contain;border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,.8)}

/* footer */
.foot{flex-shrink:0;text-align:center;font-size:11px;color:var(--t3);padding:12px;background:var(--bg1);border-top:1px solid var(--div)}

@media(max-width:640px){.sb{display:none}}
</style>
</head>
<body>

<div class="topbar">
  <span class="tb-icon">#</span>
  <span class="tb-name">${channelName}</span>
  <span class="tb-sep">|</span>
  <span class="tb-topic">Ticket Transcript${planLabel ? ` · ${esc(planLabel)}` : ''}</span>
</div>

<div class="layout">

  <aside class="sb">
    <div class="sb-sect">
      <div class="sb-lbl">Ticket Info</div>
      <div class="sb-row"><strong>Opened by</strong><br>${esc(ticket.userTag)}<br><span style="font-size:12px;color:var(--t3)">${esc(ticket.userId)}</span></div>
    </div>
    <div class="sb-div"></div>
    <div class="sb-sect">
      <div class="sb-row"><strong>Topic</strong><br><span class="sb-badge">${esc(topicLabel)}</span>${planLabel ? `<br><strong>Plan</strong>&nbsp;${esc(planLabel)}` : ''}</div>
    </div>
    <div class="sb-div"></div>
    <div class="sb-sect">
      <div class="sb-row"><strong>Status</strong><br><span class="sb-closed">Closed</span></div>
      <div class="sb-row" style="margin-top:8px"><strong>Closed by</strong><br>${esc(closerTag)}<br><span style="font-size:12px;color:var(--t3)">${esc(ticket.closedBy || '')}</span></div>
    </div>
    <div class="sb-div"></div>
    <div class="sb-sect">
      <div class="sb-row"><strong>Created</strong><br>${esc(fmtMeta(ticket.createdAt))}</div>
      <div class="sb-row" style="margin-top:8px"><strong>Closed</strong><br>${ticket.closedAt ? esc(fmtMeta(ticket.closedAt)) : 'N/A'}</div>
    </div>
    <div class="sb-div"></div>
    <div class="sb-sect">
      <div class="sb-row"><strong>Messages</strong><br>${msgs.length}</div>
    </div>
    <div class="sb-div"></div>
    <div class="sb-sect">
      <div class="sb-row" style="font-size:11px;color:var(--t3)">Ticket ID:<br>${esc(String(ticket._id))}</div>
    </div>
  </aside>

  <main class="chat">
    ${messagesHtml}
  </main>

</div>

<div class="foot">Generated by Glow &mdash; ${esc(generatedAt)}</div>

<div id="lb"><img id="lb-img" src="" alt=""></div>

<script>
document.querySelectorAll('[data-lightbox] img').forEach(img=>{
  img.addEventListener('click',e=>{
    e.stopPropagation();
    document.getElementById('lb-img').src=img.src;
    document.getElementById('lb').classList.add('on');
  });
});
document.getElementById('lb').addEventListener('click',()=>document.getElementById('lb').classList.remove('on'));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('lb').classList.remove('on');});
</script>
</body>
</html>`;
}
