import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const PAIRING = /^EVF-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_METADATA = [
  /\bhttps?:\/\/\S+/i,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  /(?:^|\s)(?:\/users\/|\/home\/|[a-z]:\\)[^\s]+/i,
  /(?:^|\s)[A-Z][A-Z0-9_]{3,}\s*=\s*\S+/,
  /\b(?:akia[0-9a-z]{16}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|sk-[a-z0-9_-]{20,})\b/i,
];

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function normalizePairingCode(value) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!PAIRING.test(normalized)) {
    throw new Error("Código Evolfy inválido.");
  }
  return normalized;
}

function git(projectRoot, args) {
  try {
    return execFileSync("git", ["-C", projectRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function projectNameFromRemote(remote, fallback) {
  const normalized = remote.replace(/\\/g, "/").replace(/\.git$/i, "");
  const tail = normalized.split(/[/:]/).filter(Boolean).at(-1);
  const candidate = (tail || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 120);
  return SENSITIVE_METADATA.some((pattern) => pattern.test(candidate))
    ? "projeto-local"
    : candidate;
}

export function projectIdentity(projectRootInput) {
  if (typeof projectRootInput !== "string" || !isAbsolute(projectRootInput)) {
    throw new Error("Diretório do projeto inválido.");
  }
  const requested = resolve(projectRootInput);
  if (!existsSync(requested) || !statSync(requested).isDirectory()) {
    throw new Error("Diretório do projeto inválido.");
  }
  const root = git(requested, ["rev-parse", "--show-toplevel"]) || requested;
  const remote = git(root, ["config", "--get", "remote.origin.url"]);
  const name = projectNameFromRemote(remote, basename(root));
  if (!name) throw new Error("Não foi possível identificar o projeto.");
  return {
    root,
    name,
    fingerprint: sha256(remote ? `git:${remote}` : `local:${root}`),
  };
}

function configDirectory(options = {}) {
  return options.configDirectory
    ? resolve(options.configDirectory)
    : join(homedir(), ".config", "evolfy");
}

function configPath(options = {}) {
  return join(configDirectory(options), "board-sync.json");
}

function emptyConfig() {
  return { version: 1, connections: {} };
}

export function readConfig(options = {}) {
  const path = configPath(options);
  if (!existsSync(path)) return emptyConfig();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("Configuração local do Evolfy inválida.");
  }
  if (
    parsed?.version !== 1 ||
    !parsed.connections ||
    typeof parsed.connections !== "object" ||
    Array.isArray(parsed.connections)
  ) {
    throw new Error("Configuração local do Evolfy inválida.");
  }
  return parsed;
}

export function writeConfig(config, options = {}) {
  const directory = configDirectory(options);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = configPath(options);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

export function storeConnection(identity, value, options = {}) {
  if (
    !TOKEN.test(value?.token ?? "") ||
    !UUID.test(value?.boardId ?? "") ||
    typeof value?.boardName !== "string" ||
    value.boardName.length < 1 ||
    value.boardName.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(value.boardName) ||
    !["codex", "claude_code"].includes(value?.provider)
  ) {
    throw new Error("Token de conexão Evolfy inválido.");
  }
  const config = readConfig(options);
  config.connections[identity.fingerprint] = {
    token: value.token,
    boardId: value.boardId,
    boardName: value.boardName,
    projectName: identity.name,
    provider: value.provider,
    connectedAt: new Date().toISOString(),
  };
  writeConfig(config, options);
}

export function connectionFor(identity, options = {}) {
  const connection = readConfig(options).connections[identity.fingerprint];
  return connection && TOKEN.test(connection.token ?? "") ? connection : null;
}

export function removeConnection(identity, options = {}) {
  const config = readConfig(options);
  const existed = Boolean(config.connections[identity.fingerprint]);
  delete config.connections[identity.fingerprint];
  writeConfig(config, options);
  return existed;
}

export function gitCheckpoint(identity) {
  const rawBranch = git(identity.root, ["branch", "--show-current"]);
  const branch =
    rawBranch &&
    rawBranch.length <= 255 &&
    !/[\u0000-\u001f\u007f]/.test(rawBranch) &&
    !SENSITIVE_METADATA.some((pattern) => pattern.test(rawBranch))
      ? rawBranch
      : null;
  const commitRef = git(identity.root, ["rev-parse", "HEAD"]);
  return {
    branch,
    commitRef: /^[0-9a-f]{7,64}$/i.test(commitRef)
      ? commitRef.toLowerCase()
      : null,
  };
}
