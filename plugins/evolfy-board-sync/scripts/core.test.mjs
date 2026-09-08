import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  connectionFor,
  normalizePairingCode,
  projectIdentity,
  removeConnection,
  sha256,
  storeConnection,
} from "./core.mjs";

test("normaliza somente código EVF legível", () => {
  assert.equal(
    normalizePairingCode(" evf-abcd-efgh-jklm-npqr "),
    "EVF-ABCD-EFGH-JKLM-NPQR",
  );
  assert.throws(() => normalizePairingCode("EVF-ABCI-EFGH-JKLM-NPQR"));
});

test("identidade envia somente nome e fingerprint, nunca o path", () => {
  const directory = mkdtempSync(join(tmpdir(), "evolfy-project-"));
  const identity = projectIdentity(directory);
  assert.equal(identity.name, identity.root.split("/").at(-1));
  assert.match(identity.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.ok(!identity.fingerprint.includes(directory));
});

test("token fica fora do repo em arquivo 0600 e pode ser removido", () => {
  const directory = mkdtempSync(join(tmpdir(), "evolfy-config-"));
  const options = { configDirectory: directory };
  const identity = {
    root: "/tmp/projeto",
    name: "projeto",
    fingerprint: sha256("projeto"),
  };
  storeConnection(
    identity,
    {
      token: "a".repeat(43),
      boardId: "00000000-0000-4000-8000-000000000000",
      boardName: "Projeto",
      provider: "codex",
    },
    options,
  );
  assert.equal(connectionFor(identity, options)?.boardName, "Projeto");
  const path = join(directory, "board-sync.json");
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.ok(!readFileSync(path, "utf8").includes("/tmp/projeto"));
  assert.equal(removeConnection(identity, options), true);
  assert.equal(connectionFor(identity, options), null);
});

test("não persiste resposta remota incompleta ou adulterada", () => {
  const directory = mkdtempSync(join(tmpdir(), "evolfy-invalid-config-"));
  const options = { configDirectory: directory };
  const identity = {
    root: "/tmp/projeto",
    name: "projeto",
    fingerprint: sha256("projeto-invalido"),
  };
  assert.throws(() =>
    storeConnection(
      identity,
      {
        token: "a".repeat(43),
        boardId: "não-e-uuid",
        boardName: "Projeto",
        provider: "codex",
      },
      options,
    ),
  );
  assert.equal(connectionFor(identity, options), null);
});

test("exige raiz absoluta e substitui nome local sensível", () => {
  assert.throws(() => projectIdentity("."), /Diretório do projeto inválido/);
  const directory = mkdtempSync(join(tmpdir(), "pedro@example.com-"));
  const identity = projectIdentity(directory);
  assert.equal(identity.name, "projeto-local");
});
