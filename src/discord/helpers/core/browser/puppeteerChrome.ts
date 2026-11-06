import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

function pathCommandExists(name: string): boolean {
  try {
    const lookup = IS_WINDOWS
      ? spawnSync('where', [name], { stdio: 'ignore', shell: true, timeout: 5000 })
      : spawnSync('which', [name], { stdio: 'ignore', timeout: 5000 });
    return lookup.status === 0;
  } catch {
    return false;
  }
}

function whichPath(bin: string): string | null {
  try {
    const lookup = spawnSync('which', [bin], { encoding: 'utf8', timeout: 5000 });
    const resolved = lookup.stdout?.trim().split('\n')[0]?.trim();
    return resolved && existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/** Linux/Docker: install Chromium for Puppeteer image generators (loadouts, shop, STW cards). */
export function ensurePuppeteerChrome(log: {
  yellow: (s: string) => string;
  green: (s: string) => string;
  red: (s: string) => string;
}): void {
  if (!IS_LINUX) return;

  try {
    resolvePuppeteerChromeExecutable();
    return;
  } catch {
    // not found — install below
  }

  console.log(log.yellow('[DEPS] Chromium not found — installing for image generators...'));
  const install = spawnSync(
    'sh',
    [
      '-c',
      'apt-get update -qq && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates',
    ],
    { encoding: 'utf8', timeout: 300_000 },
  );

  if (install.status !== 0) {
    console.log(log.red('[DEPS] Chromium install failed — /loadouts and shop images need Chromium or PUPPETEER_EXECUTABLE_PATH'));
    const tail = `${install.stderr ?? ''}${install.stdout ?? ''}`.trim().split('\n').slice(-5).join('\n');
    if (tail) console.log(log.red(tail));
    return;
  }

  console.log(log.green('[DEPS] Chromium installed OK'));
}

export function resolvePuppeteerChromeExecutable(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  if (IS_WINDOWS) {
    const winCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const candidate of winCandidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  if (IS_LINUX) {
    for (const bin of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
      const resolved = whichPath(bin);
      if (resolved) return resolved;
    }

    const linuxPaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/lib/chromium/chromium',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/snap/bin/chromium',
    ];
    for (const candidate of linuxPaths) {
      if (existsSync(candidate)) return candidate;
    }
  }

  throw new Error(
    'Chrome/Chromium not found. On Linux: apt install chromium, or set PUPPETEER_EXECUTABLE_PATH.',
  );
}

export const PUPPETEER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];
