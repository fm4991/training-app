// Usage: npm run validate -- plans/heliski.json [more.json ...]
import { readFileSync } from 'node:fs';
import { parseAndValidate } from '../src/engine/validate';

const files = process.argv.slice(2);
if (!files.length) files.push('plans/heliski.json');

let failed = false;
for (const file of files) {
  const { errors, warnings } = parseAndValidate(readFileSync(file, 'utf8'));
  for (const w of warnings) console.warn(`${file}: warning ${w.path}: ${w.message}`);
  for (const e of errors) console.error(`${file}: error ${e.path}: ${e.message}`);
  if (errors.length) failed = true;
  else console.log(`${file}: valid${warnings.length ? ` (${warnings.length} warnings)` : ''}`);
}
process.exit(failed ? 1 : 0);
