import { chmod, copyFile, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parse } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vars = parse(await readFile(join(root, ".dev.vars")));
const token = vars.NOW_PLAYING_TOKEN?.trim();
if (!token || token === "replace-with-the-token-used-by-your-clients") {
  throw new Error("Set NOW_PLAYING_TOKEN in .dev.vars before building the clients.");
}
const apiUrl = process.env.NOW_PLAYING_API_URL ?? vars.NOW_PLAYING_API_URL
  ?? "https://akinkunmi.dev/api/now-playing";
const endpoint = new URL(apiUrl);
if (endpoint.protocol !== "https:") throw new Error("The clients require an HTTPS API URL.");

const extensionSource = join(root, "now-playing/chrome-extension");
const android = join(root, "now-playing/android");
const output = join(root, "data/now-playing");
await mkdir(output, { recursive: true, mode: 0o700 });

// These local credentials and all packaged clients are ignored by Git.
const localConfig = join(extensionSource, "config.local.js");
await writeFile(localConfig, `window.NOW_PLAYING_CONFIG = ${JSON.stringify({
  API_URL: endpoint.href, TOKEN: token,
}, null, 2)};\n`, { mode: 0o600 });
await chmod(localConfig, 0o600);

const localProperties = join(android, "local.properties");
const previous = await readFile(localProperties, "utf8").catch(error => {
  if (error.code === "ENOENT") return "";
  throw error;
});
const escapeProperty = value => value.replaceAll("\\", "\\\\")
  .replaceAll("\n", "\\n").replaceAll("\r", "\\r");
const properties = previous.split(/\r?\n/)
  .filter(line => !/^\s*nowPlaying\.(apiUrl|token)\s*[=:]/.test(line));
if (!properties.some(line => /^\s*sdk\.dir\s*[=:]/.test(line))) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
    ?? (process.platform === "darwin" ? join(process.env.HOME, "Library/Android/sdk") : undefined);
  if (sdk) properties.push(`sdk.dir=${escapeProperty(sdk)}`);
}
properties.push(`nowPlaying.apiUrl=${escapeProperty(endpoint.href)}`,
  `nowPlaying.token=${escapeProperty(token)}`);
await writeFile(localProperties, properties.filter(Boolean).join("\n") + "\n", { mode: 0o600 });
await chmod(localProperties, 0o600);

function run(command, args, cwd, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    // Avoid accidentally displaying credentials in build diagnostics.
    const write = chunk => process.stdout.write(chunk.toString().replaceAll(token, "[redacted]"));
    child.stdout.on("data", write);
    child.stderr.on("data", write);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolveRun()
      : reject(new Error(`Client build command failed (exit ${code})`)));
  });
}

const extensionOutput = join(output, "extension");
await rm(extensionOutput, { recursive: true, force: true });
await cp(extensionSource, extensionOutput, {
  recursive: true, filter: source => !source.endsWith(".DS_Store"),
});
const archive = join(output, "now-playing-extension.zip");
await rm(archive, { force: true });
await run("zip", ["-qr", archive, "."], extensionOutput);
await chmod(archive, 0o600);
console.log(`Extension built for ${endpoint.href}: ${archive}`);

const env = { ...process.env };
const studioJava = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
if (!env.JAVA_HOME && process.platform === "darwin" && await stat(studioJava).catch(() => null)) {
  env.JAVA_HOME = studioJava;
}
await run(process.platform === "win32" ? "gradlew.bat" : "./gradlew",
  ["--no-daemon", ":app:assembleDebug"], android, env);
const apk = join(output, "now-playing.apk");
await copyFile(join(android, "app/build/outputs/apk/debug/app-debug.apk"), apk);
await chmod(apk, 0o600);
console.log(`Android APK built: ${apk}`);
