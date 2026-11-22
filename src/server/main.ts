// Starts the Gunpla Wars host. Run with `npm start` (or double-click start-host.bat).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer, lanUrls } from './app';
import { CatalogError, loadCatalog } from './catalog';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT ?? 3000);
const dataDir = path.join(root, 'data');
const savesDir = process.env.GUNPLA_SAVES ? path.resolve(process.env.GUNPLA_SAVES) : path.join(root, 'saves');

try {
  loadCatalog(dataDir);
} catch (e) {
  console.error('\n✖ Gunpla Wars could not start because the game data has errors.\n');
  console.error(e instanceof CatalogError ? e.message : e);
  console.error('\nFix the files listed above (in the data folder) and start again.\n');
  process.exit(1);
}

try {
  const srv = await createGameServer({
    dataDir,
    savesDir,
    clientDir: path.join(root, 'dist', 'client'),
    port,
    host: '0.0.0.0',
  });
  const urls = lanUrls(srv.port);
  const line = '='.repeat(64);
  console.log(`\n${line}\n  GUNPLA WARS HOST is running\n${line}`);
  console.log(`  On this computer:   http://localhost:${srv.port}`);
  if (urls.length) {
    console.log('  Players on your Wi-Fi open one of:');
    for (const u of urls) console.log(`     ${u}`);
  } else {
    console.log('  (No network connection found — only this computer can connect.)');
  }
  console.log(`\n  Saved matches: ${savesDir}`);
  console.log(`  Matches loaded: ${srv.store.matches.size}`);
  for (const w of srv.warnings) console.log(`  ⚠ ${w}`);
  console.log(`\n  Leave this window open while you play. Press Ctrl+C to stop.\n${line}\n`);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✖ Port ${port} is already in use — is the host already running in another window?\n`);
  } else {
    console.error('\n✖ The host failed to start:', e);
  }
  process.exit(1);
}
