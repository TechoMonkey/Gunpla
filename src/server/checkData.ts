// `npm run check-data` — validates the files in /data without starting the server.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRoster } from '../engine/builder';
import { CatalogError, loadCatalog } from './catalog';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
try {
  const c = loadCatalog(path.join(root, 'data'));
  console.log('✔ Game data is valid.');
  console.log(`  Chassis:   ${Object.values(c.chassis).map((x) => `${x.name} ${x.grade} ${x.version} (${x.points} pts)`).join(', ')}`);
  console.log(`  Equipment: ${Object.values(c.equipment).map((x) => `${x.name} (${x.points})`).join(', ')}`);
  for (const r of c.rosters) {
    const v = validateRoster(c, r, Number.MAX_SAFE_INTEGER);
    console.log(`  Roster "${r.name}": ${v.totalPoints} pts${v.errors.length ? ' — ' + v.errors.join('; ') : ''}`);
  }
} catch (e) {
  console.error(e instanceof CatalogError ? e.message : e);
  process.exit(1);
}
