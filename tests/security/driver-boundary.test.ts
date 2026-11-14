import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  let out: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out = out.concat(walk(p));
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
  } catch {
    // directory absent
  }
  return out;
}

const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts"))].map((f) => ({
  rel: relative(ROOT, f).split(sep).join("/"),
  text: readFileSync(f, "utf8"),
}));

describe("driver boundary", () => {
  it("only src/db and scripts import mongodb", () => {
    const bad = files.filter(
      (f) => /from\s+["']mongodb["']|require\(["']mongodb["']\)/.test(f.text) && !/^(src\/db|scripts)\//.test(f.rel),
    );
    expect(bad.map((f) => f.rel)).toEqual([]);
  });

  it("only clock implementations call Date.now(", () => {
    const bad = files.filter((f) => f.text.includes("Date.now(") && !/clock[^/]*\.ts$/i.test(f.rel));
    expect(bad.map((f) => f.rel)).toEqual([]);
  });
});
