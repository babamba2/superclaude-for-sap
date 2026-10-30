/**
 * Masked password prompt for sap-profile-cli.
 *
 * Opens a window outside the Claude Code chat so the password is typed there
 * and never enters the conversation transcript:
 *   - Windows: a new PowerShell console window (Read-Host -AsSecureString)
 *   - macOS:   osascript `display dialog ... with hidden answer`
 *   - Linux:   zenity --password, then kdialog --password
 *
 * Windows hand-off: the visible console cannot write to our stdout pipe, so it
 * saves the SecureString with ConvertFrom-SecureString (DPAPI, current user)
 * to a temp file. The hidden launcher decrypts it, deletes the file and
 * returns the secret over its stdout pipe. No plaintext is written to disk.
 * Title / message are passed through environment variables, never spliced
 * into script text.
 *
 * promptPassword() returns the password string, or null when the user
 * cancels. It throws PasswordPromptUnavailableError when no window can open
 * (headless session, no GUI tool installed).
 */

import { spawnSync } from 'node:child_process';

const TIMEOUT_MS = 5 * 60 * 1000;

export class PasswordPromptUnavailableError extends Error {
  constructor(detail) {
    super(`password prompt unavailable: ${detail}`);
    this.code = 'ERR_PASSWORD_PROMPT_UNAVAILABLE';
  }
}

// Runs in the visible PowerShell window.
const WINDOWS_CONSOLE_SCRIPT = `
$Host.UI.RawUI.WindowTitle = $env:SC4SAP_PW_TITLE
Write-Host ''
Write-Host $env:SC4SAP_PW_MESSAGE -ForegroundColor Cyan
Write-Host 'Input is hidden. Press Enter when done. Close this window to cancel.'
Write-Host ''
$secure = Read-Host 'Password' -AsSecureString
if ($secure.Length -gt 0) {
  ConvertFrom-SecureString $secure | Set-Content -LiteralPath $env:SC4SAP_PW_FILE -Encoding ASCII
}
`;

// Runs hidden: opens the console window, waits, decrypts the hand-off file.
// Output protocol: "OK:<base64 of UTF-8 bytes>" or "CANCEL".
const WINDOWS_LAUNCHER_SCRIPT = `
$ErrorActionPreference = 'Stop'
$env:SC4SAP_PW_FILE = Join-Path ([IO.Path]::GetTempPath()) ('sc4sap-pw-' + [guid]::NewGuid().ToString('N') + '.txt')
try {
  Start-Process -FilePath 'powershell.exe' -WindowStyle Normal -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $env:SC4SAP_PW_CONSOLE)
  if (Test-Path -LiteralPath $env:SC4SAP_PW_FILE) {
    $secure = Get-Content -LiteralPath $env:SC4SAP_PW_FILE | ConvertTo-SecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
      [Console]::Out.Write('OK:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plain)))
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  } else {
    [Console]::Out.Write('CANCEL')
  }
} finally {
  Remove-Item -LiteralPath $env:SC4SAP_PW_FILE -Force -ErrorAction SilentlyContinue
}
`;

function encodePs(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function run(cmd, args, env) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
}

function promptWindows(env) {
  const r = run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(WINDOWS_LAUNCHER_SCRIPT)],
    { ...env, SC4SAP_PW_CONSOLE: encodePs(WINDOWS_CONSOLE_SCRIPT) },
  );
  if (r.error) throw new PasswordPromptUnavailableError(r.error.message);
  const out = String(r.stdout || '').trim();
  if (out === 'CANCEL') return null;
  if (out.startsWith('OK:')) return Buffer.from(out.slice(3), 'base64').toString('utf8');
  throw new PasswordPromptUnavailableError(
    `powershell exited ${r.status}: ${String(r.stderr || '').trim().split('\n')[0] || 'no output'}`,
  );
}

function promptMac(env) {
  const script =
    'text returned of (display dialog (system attribute "SC4SAP_PW_MESSAGE") ' +
    'with title (system attribute "SC4SAP_PW_TITLE") default answer "" with hidden answer)';
  const r = run('osascript', ['-e', script], env);
  if (r.error) throw new PasswordPromptUnavailableError(r.error.message);
  // -128 = user pressed Cancel.
  if (r.status !== 0) {
    if (/-128/.test(r.stderr || '')) return null;
    throw new PasswordPromptUnavailableError(`osascript exited ${r.status}`);
  }
  const pw = String(r.stdout || '').replace(/\r?\n$/, '');
  return pw || null;
}

function promptLinux(env) {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new PasswordPromptUnavailableError('no graphical display (DISPLAY / WAYLAND_DISPLAY unset)');
  }
  const tools = [
    ['zenity', ['--password', `--title=${env.SC4SAP_PW_TITLE}`]],
    ['kdialog', ['--title', env.SC4SAP_PW_TITLE, '--password', env.SC4SAP_PW_MESSAGE]],
  ];
  for (const [cmd, args] of tools) {
    const r = run(cmd, args, env);
    if (r.error) continue; // not installed
    if (r.status !== 0) return null; // cancelled
    const pw = String(r.stdout || '').replace(/\r?\n$/, '');
    return pw || null;
  }
  throw new PasswordPromptUnavailableError('neither zenity nor kdialog is installed');
}

export function promptPassword({ title = 'sc4sap', message = 'Enter SAP password' } = {}) {
  const env = { SC4SAP_PW_TITLE: title, SC4SAP_PW_MESSAGE: message };
  if (process.platform === 'win32') return promptWindows(env);
  if (process.platform === 'darwin') return promptMac(env);
  return promptLinux(env);
}
