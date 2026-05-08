#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findTests(dir, out) {
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findTests(full, out);
    else if (/\.test\.(c?js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const root = __dirname;
const subset = process.argv[2] ? path.join(root, process.argv[2]) : root;
const files = fs.existsSync(subset) ? findTests(subset) : [];

if (!files.length) {
  console.log('No *.test.{cjs,js,mjs} files found under ' + (path.relative(process.cwd(), subset) || '.'));
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--test'].concat(files), { stdio: 'inherit' });
process.exit(result.status == null ? 0 : result.status);