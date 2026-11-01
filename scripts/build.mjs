import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const outputRoot = resolve(projectRoot, "dist");
const packageInfo = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const entry of ["index.html", "network-test.html", "css", "src", "shared", "assets"]) {
  await cp(resolve(projectRoot, entry), resolve(outputRoot, entry), { recursive: true });
}

await mkdir(resolve(outputRoot, "vendor"), { recursive: true });
await cp(
  resolve(projectRoot, "node_modules", "@colyseus", "sdk", "dist", "colyseus.js"),
  resolve(outputRoot, "vendor", "colyseus.js"),
);
await cp(
  resolve(projectRoot, "node_modules", "@colyseus", "sdk", "dist", "debug.js"),
  resolve(outputRoot, "vendor", "colyseus-debug.js"),
);
await cp(
  resolve(projectRoot, "node_modules", "@colyseus", "sdk", "LICENSE"),
  resolve(outputRoot, "vendor", "colyseus.LICENSE"),
);

const buildInfo = {
  name: packageInfo.name,
  version: packageInfo.version,
  builtAt: new Date().toISOString(),
};

await writeFile(
  resolve(outputRoot, "version.json"),
  `${JSON.stringify(buildInfo, null, 2)}\n`,
  "utf8",
);
await cp(resolve(outputRoot, "index.html"), resolve(outputRoot, "404.html"));

console.log(`Built ${packageInfo.name} v${packageInfo.version} → ${outputRoot}`);
