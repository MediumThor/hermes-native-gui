import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

globalThis.loadTsModule = (relativePath) => require(path.resolve(process.cwd(), relativePath));

const explicitFiles = process.argv.slice(2);
const files = explicitFiles.length > 0
  ? explicitFiles
  : readdirSync(path.resolve(process.cwd(), "tests"))
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => path.join("tests", file));

let failed = 0;
for (const file of files) {
  try {
    await import(pathToFileURL(path.resolve(process.cwd(), file)).href);
    console.log(`✓ ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${file}`);
    console.error(error?.stack ?? error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`${files.length} unit test file(s) passed.`);
