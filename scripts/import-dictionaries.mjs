import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local environment.");
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const sources = [
  ["vi", "dictionaries/vi.txt"],
  ["en", "dictionaries/en.txt"],
];

for (const [language, path] of sources) {
  const raw = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const words = [...new Set(raw.split(/\r?\n/)
    .map(value => value.normalize("NFC").trim().toLocaleLowerCase(language))
    .filter(Boolean)
    .filter(word => /^[\p{L}]+$/u.test(word))
    .filter(word => {
      const normalized = word.replace(/\s+/g, "");
      return normalized.length >= 2 && normalized.length <= 10;
    }))];

  for (let offset = 0; offset < words.length; offset += 500) {
    const rows = words.slice(offset, offset + 500).map(word => ({
      language,
      word,
      normalized: word.replace(/\s+/g, ""),
    }));
    const { error } = await supabase.from("dictionary_words").upsert(rows, {
      onConflict: "language,normalized",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Import failed for ${language} at ${offset}: ${error.message}`);
  }
  console.log(`Imported ${words.length} ${language} entries`);
}
