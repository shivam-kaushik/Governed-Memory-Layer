import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const files = ["src", "scripts"].flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
});

describe("driver boundary (G3, G18, G21)", () => {
  it("only src/db and scripts import the mongodb driver", () => {
    const offenders = files.filter((f) => {
      const r = rel(f);
      if (r.startsWith("src/db/") || r.startsWith("scripts/")) return false;
      return /from\s+["']mongodb["']|require\(["']mongodb["']\)/.test(readFileSync(f, "utf8"));
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("only clock implementations call Date.now(", () => {
    const offenders = files.filter((f) => {
      const r = rel(f);
      if (/(^|\/)[^/]*clock[^/]*\.ts$/i.test(r)) return false;
      return /Date\.now\(/.test(readFileSync(f, "utf8"));
    });
    expect(offenders.map(rel)).toEqual([]);
  });
});
