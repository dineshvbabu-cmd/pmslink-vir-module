import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
const standaloneStaticRoot = path.join(standaloneRoot, ".next");

if (!existsSync(standaloneRoot)) {
  throw new Error("Expected .next/standalone to exist after next build.");
}

if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standaloneRoot, "public"), { recursive: true });
}

if (existsSync(path.join(root, ".next", "static"))) {
  mkdirSync(standaloneStaticRoot, { recursive: true });
  cpSync(path.join(root, ".next", "static"), path.join(standaloneStaticRoot, "static"), { recursive: true });
}
