// On macOS, npm's `electron` package downloads an unsigned Electron.app
// binary. Newer Gatekeeper/XProtect heuristics sometimes flag unsigned
// Electron shells as malware and quarantine them, even though the binary
// is untampered (verified against Electron's published checksums). An
// ad-hoc local signature avoids that false positive for local development.
// This has no effect on Linux/Windows and is safe to run repeatedly.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'darwin') process.exit(0);

const appPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');

try {
  execFileSync('xattr', ['-cr', appPath]);
  execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath]);
  console.log('[sign-electron] Ad-hoc signed Electron.app for local development.');
} catch (err) {
  console.warn('[sign-electron] Skipped signing Electron.app:', err.message);
}
