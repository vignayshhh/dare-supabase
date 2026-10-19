import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "src");
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignored = /(?:^|[\\/])(?:__tests__|coverage|node_modules|\.next)(?:[\\/]|$)|\.(?:backup|bak)$/i;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (ignored.test(absolute)) return [];
    if (entry.isDirectory()) return walk(absolute);
    return extensions.has(path.extname(entry.name)) ? [absolute] : [];
  }));
  return nested.flat();
}

const patterns = {
  from: /\.from\s*\(/g,
  rpc: /\.rpc\s*\(/g,
  auth: /\.auth\.(?:getUser|getSession|signInWithPassword|signUp|signOut|resetPasswordForEmail)\s*\(/g,
  storage: /\.storage\.from\s*\(/g,
  channels: /\.channel\s*\(/g,
  postgresChanges: /["']postgres_changes["']/g,
  compatibilityReads: /\b(?:getRow|getRows)\s*\(/g,
  compatibilityWrites: /\b(?:insertRow|putRow|patchRow|deleteRow)\s*\(/g,
  compatibilitySubscriptions: /\bsubscribeRows\s*\(/g,
  intervals: /\b(?:window\.)?setInterval\s*\(/g,
  selectStar: /\.select\s*\(\s*["']\*["']/g,
};

const files = await walk(root);
const totals = Object.fromEntries(Object.keys(patterns).map((name) => [name, 0]));
const byFile = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const counts = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    pattern.lastIndex = 0;
    const count = [...source.matchAll(pattern)].length;
    totals[name] += count;
    if (count) counts[name] = count;
  }
  if (Object.keys(counts).length) {
    byFile.push({ file: path.relative(process.cwd(), file).replaceAll("\\", "/"), ...counts });
  }
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), scannedFiles: files.length, totals, byFile }, null, 2));
