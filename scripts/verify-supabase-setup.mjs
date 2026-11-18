import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");
const migrationNames = (await readdir(migrationDir)).filter(name => name.endsWith(".sql")).sort();
if (migrationNames.length < 9) {
  throw new Error("Expected the versioned Supabase schema and security migrations.");
}
const migrationSql = (await Promise.all(
  migrationNames.map(name => readFile(path.join(migrationDir, name), "utf8"))
)).join("\n");

const requiredSql = [
  /create table public\.profiles/i,
  /create table public\.conversations/i,
  /create table public\.messages/i,
  /alter table public\.profiles enable row level security/i,
  /alter table public\.messages enable row level security/i,
  /create policy messages_insert_member_unblocked/i,
  /insert into storage\.buckets/i,
  /create policy chat_images_read_conversation_members/i,
  /create trigger auth_user_profile_created/i,
  /alter publication supabase_realtime add table public\.messages/i,
  /private\.enforce_message_rate_limit/i,
  /private\.enforce_report_rate_limit/i,
];
for (const pattern of requiredSql) {
  if (!pattern.test(migrationSql)) throw new Error(`Missing required Supabase migration invariant: ${pattern}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const sourceFiles = await walk(path.join(root, "src"));
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  if (/from\s*["']firebase(?:\/|["'])|require\(["']firebase/.test(source)) {
    throw new Error(`Firebase SDK import remains in active client code: ${path.relative(root, file)}`);
  }
  if (/SUPABASE_SECRET_KEYS|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/.test(source)) {
    throw new Error(`Server-only Supabase credentials must not appear in client code: ${path.relative(root, file)}`);
  }
}

const client = await readFile(path.join(root, "src", "supabase.js"), "utf8");
if (!client.includes("REACT_APP_SUPABASE_PUBLISHABLE_KEY")) {
  throw new Error("Browser client must use the Supabase publishable key.");
}
if (client.includes("SERVICE_ROLE") || client.includes("SECRET_KEY")) {
  throw new Error("Browser client must not contain a server credential.");
}

const functionNames = [
  "moderation-list-cases",
  "moderation-review-case",
  "moderation-set-role",
  "account-deletion-list",
  "account-deletion-approve",
  "account-deletion-process",
];

const canonicalAuth = await readFile(path.join(root, "supabase", "functions", "_shared", "auth.ts"), "utf8");
const canonicalHttp = await readFile(path.join(root, "supabase", "functions", "_shared", "http.ts"), "utf8");
for (const name of functionNames) {
  const functionDir = path.join(root, "supabase", "functions", name);
  const authHelper = await readFile(path.join(functionDir, "_shared", "auth.ts"), "utf8");
  const httpHelper = await readFile(path.join(functionDir, "_shared", "http.ts"), "utf8");
  if (authHelper !== canonicalAuth || httpHelper !== canonicalHttp) {
    throw new Error(`Edge Function shared helpers drifted from canonical source: ${name}`);
  }
  const source = await readFile(path.join(functionDir, "index.ts"), "utf8");
  if (!source.includes('from "./_shared/auth.ts"') || !source.includes('from "./_shared/http.ts"')) {
    throw new Error(`Edge Function imports do not match its local bundled helper layout: ${name}`);
  }
}

console.log(`Supabase source checks passed: ${migrationNames.length} migrations, ${sourceFiles.length} client files, ${functionNames.length} trusted functions.`);
