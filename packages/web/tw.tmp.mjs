import { compile } from "tailwindcss";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("package.json"));
const css = process.argv[2] ?? '@import "tailwindcss";';
const candidates = process.argv.slice(3);
const compiler = await compile(css, {
  base: process.cwd(),
  loadStylesheet: async (id, base) => {
    const file = id === "tailwindcss" ? require.resolve("tailwindcss/index.css") : id.startsWith(".") ? path.resolve(base, id) : require.resolve(id);
    return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") };
  },
});
const out = compiler.build(candidates);
const i = out.indexOf("@layer utilities");
console.log(out.slice(i));
