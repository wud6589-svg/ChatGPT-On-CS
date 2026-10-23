import { execSync } from 'child_process';

import { findChromeBinary, readChromeVersion } from '../strategy/chromeLaunch';

function readWindowsChromeVersion(): string | null {
  const commands = [
    `(Get-Item -Path "$env:PROGRAMFILES\\Google\\Chrome\\Application\\chrome.exe").VersionInfo.FileVersion`,
    `(Get-Item -Path "'$env:PROGRAMFILES (x86)'\\Google\\Chrome\\Application\\chrome.exe").VersionInfo.FileVersion`,
    `(Get-Item -Path "$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe").VersionInfo.FileVersion`,
    `(Get-ItemProperty -Path Registry::"HKCU\\SOFTWARE\\Google\\Chrome\\BLBeacon").version`,
    `(Get-ItemProperty -Path Registry::"HKLM\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Google Chrome").version`,
  ];
  const pattern = /\d+\.\d+\.\d+/;
  const firstHitTemplate = `$tmp = {expression}; if ($tmp) {echo $tmp; Exit;};`;
  const script = `$ErrorActionPreference='silentlycontinue'; ${commands
    .map((expression) => firstHitTemplate.replace('{expression}', expression))
    .join(' ')}`;

  try {
    const stdout = execSync(script, {
      shell: 'powershell.exe',
      timeout: 8000,
      encoding: 'utf8',
    });
    const match = String(stdout).match(pattern);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/**
 * Synchronous on purpose: the renderer reads this with ipcRenderer.sendSync.
 * An async handler sets `returnValue` after sendSync has already returned.
 */
export function getBrowserVersionFromOS(): string | null {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    const binary = findChromeBinary();
    if (!binary) {
      return null;
    }
    return readChromeVersion(binary);
  }
  return readWindowsChromeVersion();
}