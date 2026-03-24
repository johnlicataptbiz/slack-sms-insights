import fs from "node:fs";
import path from "node:path";

// Usage: npx tsx frontend/scripts/generate-design-tokens.ts <figma-tokens.json>
const [, , inputFile] = process.argv;
if (!inputFile) {
  console.error("Usage: npx tsx frontend/scripts/generate-design-tokens.ts <figma-tokens.json>");
  process.exit(1);
}

const tokenJson = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
const tokens = tokenJson.tokens || tokenJson;
const cssLines: string[] = ["@theme {"];

for (const [key, value] of Object.entries(tokens)) {
  const variableName = `--${String(key).replace(/\s+/g, "-").toLowerCase()}`;
  cssLines.push(`  ${variableName}: ${value};`);
}

cssLines.push("}");

const outCss = cssLines.join("\n");
fs.writeFileSync(path.join("frontend", "src", "styles", "tokens.generated.css"), outCss, "utf-8");
fs.writeFileSync(path.join("frontend", "src", "styles", "design-system.tokens.json"), JSON.stringify(tokens, null, 2), "utf-8");

console.log("✅ Generated tokens: frontend/src/styles/tokens.generated.css and design-system.tokens.json");
