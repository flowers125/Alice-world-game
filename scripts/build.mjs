import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "style.css", "script.js", "backend.js", "supabase-config.js"]) {
  await cp(new URL(file, root), new URL(file, output));
}

await cp(new URL("dictionaries/", root), new URL("dictionaries/", output), { recursive: true });
console.log("Built Alice World Game static site in dist/");
