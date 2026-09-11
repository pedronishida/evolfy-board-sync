import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const server = new URL("./mcp-server.mjs", import.meta.url).pathname;
const CARD = "77777777-7777-4777-8777-777777777777";
const COLUNA = "88888888-8888-4888-8888-888888888888";

/**
 * Sobe o servidor MCP de verdade, com HOME descartável (sem conexão salva), e
 * conversa por stdio. Nenhum caso aqui chega à rede: todos param antes, na
 * validação local ou na falta de conexão.
 */
async function conversar(mensagens) {
  const home = mkdtempSync(join(tmpdir(), "evolfy-mcp-home-"));
  const processo = spawn(process.execPath, [server], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const respostas = new Map();
  let buffer = "";
  processo.stdout.setEncoding("utf8");
  processo.stdout.on("data", (chunk) => {
    buffer += chunk;
    let quebra;
    while ((quebra = buffer.indexOf("\n")) >= 0) {
      const linha = buffer.slice(0, quebra);
      buffer = buffer.slice(quebra + 1);
      if (!linha.trim()) continue;
      const mensagem = JSON.parse(linha);
      respostas.set(mensagem.id, mensagem);
    }
  });
  for (const mensagem of mensagens) {
    processo.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...mensagem })}\n`);
  }
  const ids = mensagens.map((mensagem) => mensagem.id);
  const limite = Date.now() + 5_000;
  while (ids.some((id) => !respostas.has(id)) && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
  processo.kill();
  return respostas;
}

function chamada(id, name, args) {
  return { id, method: "tools/call", params: { name, arguments: args } };
}

test("anuncia a versão 0.2.0 e as ferramentas de card com os campos obrigatórios", async () => {
  const respostas = await conversar([
    { id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
    { id: 2, method: "tools/list" },
  ]);
  assert.equal(respostas.get(1).result.serverInfo.version, "0.2.0");
  const tools = new Map(
    respostas.get(2).result.tools.map((tool) => [tool.name, tool]),
  );
  assert.deepEqual(tools.get("evolfy_create_card").inputSchema.required, [
    "projectRoot",
    "title",
    "columnId",
  ]);
  assert.deepEqual(tools.get("evolfy_move_card").inputSchema.required, [
    "projectRoot",
    "cardId",
    "fromColumnId",
    "toColumnId",
  ]);
  assert.equal(
    tools.get("evolfy_create_card").inputSchema.properties.title.maxLength,
    200,
  );
});

test("recusa entrada inválida antes de qualquer rede, com mensagem segura", async () => {
  const projeto = mkdtempSync(join(tmpdir(), "evolfy-projeto-"));
  const respostas = await conversar([
    chamada(1, "evolfy_create_card", {
      projectRoot: projeto,
      title: "   ",
      columnId: COLUNA,
    }),
    chamada(2, "evolfy_create_card", {
      projectRoot: projeto,
      title: "Checkout com Pix",
      columnId: "nao-e-uuid",
    }),
    chamada(3, "evolfy_move_card", {
      projectRoot: projeto,
      cardId: CARD,
      fromColumnId: COLUNA,
      toColumnId: COLUNA,
    }),
    chamada(4, "evolfy_create_card", {
      projectRoot: projeto,
      title: "Checkout com Pix",
      columnId: COLUNA,
    }),
  ]);
  const texto = (id) => respostas.get(id).result.content[0].text;
  assert.equal(respostas.get(1).result.isError, true);
  assert.equal(texto(1), "Informe um título de 1 a 200 caracteres.");
  assert.equal(texto(2), "Coluna inválida.");
  assert.equal(
    texto(3),
    "A coluna de destino precisa ser diferente da de origem.",
  );
  assert.equal(
    texto(4),
    "Este projeto ainda não está conectado a um Board Evolfy.",
  );
});
