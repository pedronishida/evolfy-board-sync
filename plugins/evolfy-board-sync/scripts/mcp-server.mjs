import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  connectionFor,
  gitCheckpoint,
  normalizePairingCode,
  projectIdentity,
  removeConnection,
  sha256,
  storeConnection,
} from "./core.mjs";

const API_ORIGIN = "https://api.evolfy.com.br";
const SESSION_HASH = sha256(randomUUID());
let sequence = 0;

const tools = [
  {
    name: "evolfy_connect",
    description:
      "Pareia o projeto atual a um Board Evolfy usando um código EVF de uso único. O caminho local é apenas fingerprintado e nunca é enviado.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectRoot", "code", "provider"],
      properties: {
        projectRoot: {
          type: "string",
          description: "Raiz absoluta do projeto local.",
        },
        code: {
          type: "string",
          description: "Código de pareamento EVF gerado no Board.",
        },
        provider: { type: "string", enum: ["codex", "claude_code"] },
      },
    },
  },
  {
    name: "evolfy_connection_status",
    description:
      "Verifica se o projeto já possui uma conexão Evolfy local válida.",
    inputSchema: rootSchema(),
  },
  {
    name: "evolfy_get_board",
    description:
      "Lê somente nome, colunas e títulos/IDs dos cards do Board conectado para associar atualizações sem inventar IDs. Cada coluna diz se está liberada para o agente (agentAllowed) e se conclui cards (closesCards); cada card diz se está publicado para o cliente (publishedToClient).",
    inputSchema: rootSchema(),
  },
  {
    name: "evolfy_create_card",
    description:
      "Cria um card numa coluna liberada para o agente. Se já existir card aberto com o mesmo título, devolve esse card em vez de duplicar. Exige a permissão Criar cards no código de conexão.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectRoot", "title", "columnId"],
      properties: {
        projectRoot: {
          type: "string",
          description: "Raiz absoluta do projeto local.",
        },
        title: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description:
            "Título curto da entrega, em linguagem de produto. Sem código, caminho, comando, URL, e-mail ou segredo.",
        },
        columnId: {
          type: "string",
          format: "uuid",
          description:
            "ID de uma coluna com agentAllowed=true em evolfy_get_board.",
        },
      },
    },
  },
  {
    name: "evolfy_move_card",
    description:
      "Move um card entre colunas liberadas. Informe a coluna em que o card está agora: se alguém já o moveu, a Evolfy recusa e nada muda. Card publicado para o cliente ou concluído fica com pessoas. Exige a permissão Mover cards.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectRoot", "cardId", "fromColumnId", "toColumnId"],
      properties: {
        projectRoot: {
          type: "string",
          description: "Raiz absoluta do projeto local.",
        },
        cardId: { type: "string", format: "uuid" },
        fromColumnId: {
          type: "string",
          format: "uuid",
          description:
            "Coluna em que o card está agora, segundo evolfy_get_board.",
        },
        toColumnId: {
          type: "string",
          format: "uuid",
          description: "Coluna de destino, com agentAllowed=true.",
        },
      },
    },
  },
  eventTool(
    "evolfy_report_progress",
    "Registra um marco funcional verificável no feed interno do Board.",
  ),
  eventTool(
    "evolfy_report_tests",
    "Registra um resumo agregado de testes, sem enviar comandos ou outputs.",
    { testResult: true },
  ),
  eventTool(
    "evolfy_report_blocker",
    "Registra um bloqueio que exige decisão ou dependência externa.",
  ),
  eventTool(
    "evolfy_complete_work",
    "Registra a conclusão real de uma entrega no feed interno do Board.",
  ),
  {
    name: "evolfy_disconnect",
    description:
      "Revoga o token deste projeto e remove a credencial local. Use somente a pedido do usuário.",
    inputSchema: rootSchema(),
  },
];

function rootSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["projectRoot"],
    properties: {
      projectRoot: {
        type: "string",
        description: "Raiz absoluta do projeto local.",
      },
    },
  };
}

function eventTool(name, description, options = {}) {
  const properties = {
    projectRoot: {
      type: "string",
      description: "Raiz absoluta do projeto local.",
    },
    summary: {
      type: "string",
      minLength: 1,
      maxLength: 1000,
      description:
        "Uma ou duas frases operacionais, sem código, path, comando, output, e-mail, URL ou segredo.",
    },
    cardId: { type: "string", format: "uuid" },
  };
  const required = ["projectRoot", "summary"];
  if (options.testResult) {
    properties.passed = {
      type: "boolean",
      description:
        "True somente quando a bateria resumida passou integralmente.",
    };
    required.push("passed");
  }
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required,
      properties,
    },
  };
}

class SafeError extends Error {}

async function api(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const safeMessage = body?.error?.message;
    throw new SafeError(
      typeof safeMessage === "string" && safeMessage.length <= 200
        ? safeMessage
        : `A Evolfy recusou a operação (${response.status}).`,
    );
  }
  return body;
}

function localConnection(projectRoot) {
  const identity = projectIdentity(projectRoot);
  const connection = connectionFor(identity);
  if (!connection) {
    throw new SafeError(
      "Este projeto ainda não está conectado a um Board Evolfy.",
    );
  }
  return { identity, connection };
}

async function revokeIssuedToken(token) {
  if (typeof token !== "string") return false;
  try {
    await api("/agent-sync/v1/connection", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch {
    return false;
  }
}

async function report(projectRoot, summary, cardId, type, status) {
  const { identity, connection } = localConnection(projectRoot);
  const checkpoint = gitCheckpoint(identity);
  sequence += 1;
  const idempotencyKey = `mcp:${SESSION_HASH.slice(7, 23)}:${String(sequence).padStart(6, "0")}`;
  const result = await api("/agent-sync/v1/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${connection.token}` },
    body: JSON.stringify({
      chaveIdempotencia: idempotencyKey,
      sessaoHash: SESSION_HASH,
      tipo: type,
      cardId: cardId ?? null,
      resumo: summary,
      status,
      branch: checkpoint.branch,
      commitRef: checkpoint.commitRef,
      ocorridoEm: new Date().toISOString(),
    }),
  });
  return {
    recorded: true,
    replayed: result?.event?.replayed === true,
    cardLinked: Boolean(cardId),
    publishedToClient: false,
  };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value, message) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new SafeError(message);
  }
  return value.toLowerCase();
}

/**
 * Escrita de card com uma chave por chamada. Se a rede falhar ou o tempo
 * esgotar, a Evolfy pode ter gravado mesmo assim: a repetição usa a MESMA
 * chave e o MESMO corpo, e o servidor devolve o que já gravou em vez de
 * duplicar. Recusa da Evolfy (resposta HTTP) nunca é repetida.
 */
async function writeCard(projectRoot, path, body) {
  const { identity, connection } = localConnection(projectRoot);
  const checkpoint = gitCheckpoint(identity);
  sequence += 1;
  const idempotencyKey = `mcp:${SESSION_HASH.slice(7, 23)}:${String(sequence).padStart(6, "0")}`;
  const payload = JSON.stringify({
    chaveIdempotencia: idempotencyKey,
    sessaoHash: SESSION_HASH,
    ...body,
    branch: checkpoint.branch,
    commitRef: checkpoint.commitRef,
    ocorridoEm: new Date().toISOString(),
  });
  const request = () =>
    api(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.token}` },
      body: payload,
    });
  try {
    return await request();
  } catch (caught) {
    if (caught instanceof SafeError) throw caught;
    return request();
  }
}

async function callTool(name, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new SafeError("Parâmetros da ferramenta inválidos.");
  }
  if (name === "evolfy_connect") {
    const identity = projectIdentity(args.projectRoot);
    const code = normalizePairingCode(args.code);
    const provider = args.provider;
    if (provider !== "codex" && provider !== "claude_code") {
      throw new SafeError("Provedor do agente inválido.");
    }
    const response = await api("/agent-sync/v1/pairings/exchange", {
      method: "POST",
      body: JSON.stringify({
        codigo: code,
        provedor: provider,
        projetoFingerprint: identity.fingerprint,
        projetoNome: identity.name,
      }),
    });
    const token = response?.token;
    const board = response?.connection?.board;
    if (
      typeof board?.id !== "string" ||
      typeof board?.name !== "string" ||
      typeof token !== "string"
    ) {
      await revokeIssuedToken(token);
      throw new SafeError("A Evolfy devolveu uma conexão inválida.");
    }
    try {
      storeConnection(identity, {
        token,
        boardId: board.id,
        boardName: board.name,
        provider,
      });
    } catch {
      const revoked = await revokeIssuedToken(token);
      throw new SafeError(
        revoked
          ? "A credencial local não pôde ser salva; a conexão foi cancelada."
          : "A credencial local não pôde ser salva. Revogue a conexão no Board antes de tentar novamente.",
      );
    }
    let initialEvent = true;
    try {
      await report(
        identity.root,
        `Sessão do agente conectada ao projeto ${identity.name}.`,
        null,
        "session_started",
        "info",
      );
    } catch {
      initialEvent = false;
    }
    return {
      connected: true,
      board: { id: board?.id, name: board?.name },
      project: identity.name,
      initialEventRecorded: initialEvent,
      tokenStoredOutsideRepository: true,
    };
  }
  if (name === "evolfy_connection_status") {
    const { identity, connection } = localConnection(args.projectRoot);
    return {
      connected: true,
      board: { id: connection.boardId, name: connection.boardName },
      project: identity.name,
      provider: connection.provider,
    };
  }
  if (name === "evolfy_get_board") {
    const { connection } = localConnection(args.projectRoot);
    return api("/agent-sync/v1/context", {
      headers: { Authorization: `Bearer ${connection.token}` },
    });
  }
  if (name === "evolfy_create_card") {
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (title.length < 1 || title.length > 200) {
      throw new SafeError("Informe um título de 1 a 200 caracteres.");
    }
    const columnId = requireUuid(args.columnId, "Coluna inválida.");
    const result = await writeCard(args.projectRoot, "/agent-sync/v1/cards", {
      colunaId: columnId,
      titulo: title,
    });
    // A chave é por chamada: um replay só acontece quando a própria chamada
    // repetiu o pedido depois de falha de rede — o card nasceu desta chamada.
    return {
      created: result?.existing !== true,
      reusedExisting: result?.existing === true,
      card: result?.card ?? null,
      publishedToClient: false,
    };
  }
  if (name === "evolfy_move_card") {
    const cardId = requireUuid(args.cardId, "Card inválido.");
    const fromColumnId = requireUuid(args.fromColumnId, "Coluna de origem inválida.");
    const toColumnId = requireUuid(args.toColumnId, "Coluna de destino inválida.");
    if (fromColumnId === toColumnId) {
      throw new SafeError("A coluna de destino precisa ser diferente da de origem.");
    }
    const result = await writeCard(
      args.projectRoot,
      `/agent-sync/v1/cards/${cardId}/move`,
      { colunaOrigemId: fromColumnId, colunaDestinoId: toColumnId },
    );
    return {
      moved: true,
      replayed: result?.event?.replayed === true,
      card: result?.card ?? null,
      publishedToClient: false,
    };
  }
  if (name === "evolfy_report_progress") {
    return report(
      args.projectRoot,
      args.summary,
      args.cardId,
      "progress",
      "info",
    );
  }
  if (name === "evolfy_report_tests") {
    if (typeof args.passed !== "boolean") {
      throw new SafeError("Informe se os testes passaram.");
    }
    return report(
      args.projectRoot,
      args.summary,
      args.cardId,
      "tests",
      args.passed ? "success" : "error",
    );
  }
  if (name === "evolfy_report_blocker") {
    return report(
      args.projectRoot,
      args.summary,
      args.cardId,
      "blocked",
      "warning",
    );
  }
  if (name === "evolfy_complete_work") {
    return report(
      args.projectRoot,
      args.summary,
      args.cardId,
      "completed",
      "success",
    );
  }
  if (name === "evolfy_disconnect") {
    const { identity, connection } = localConnection(args.projectRoot);
    try {
      await report(
        identity.root,
        `Sessão do agente desconectada do projeto ${identity.name}.`,
        null,
        "session_ended",
        "info",
      );
    } catch {
      // A revogação continua sendo a operação autoritativa.
    }
    await api("/agent-sync/v1/connection", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${connection.token}` },
    });
    removeConnection(identity);
    return { disconnected: true, localCredentialRemoved: true };
  }
  throw new SafeError("Ferramenta Evolfy desconhecida.");
}

function result(id, value) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, result: value })}\n`,
  );
}

function error(id, code, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`,
  );
}

const SAFE_LOCAL_MESSAGES = new Set([
  "Código Evolfy inválido.",
  "Diretório do projeto inválido.",
  "Não foi possível identificar o projeto.",
  "Configuração local do Evolfy inválida.",
  "Token de conexão Evolfy inválido.",
]);

async function receive(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (
    message.method === "notifications/initialized" ||
    message.method === "notifications/cancelled"
  ) {
    return;
  }
  if (message.method === "initialize") {
    result(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evolfy-board-sync", version: "0.2.1" },
      instructions:
        "Conecte por código EVF e envie apenas resumos operacionais seguros. Nunca envie código, diff, arquivo, comando, output, e-mail, URL ou segredo. Crie e mova cards só nas colunas com agentAllowed=true; publicar para o cliente é sempre humano.",
    });
    return;
  }
  if (message.method === "ping") {
    result(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    result(message.id, { tools });
    return;
  }
  if (message.method === "tools/call") {
    try {
      const value = await callTool(
        message.params?.name,
        message.params?.arguments ?? {},
      );
      result(message.id, {
        content: [{ type: "text", text: JSON.stringify(value) }],
      });
    } catch (caught) {
      const messageText =
        caught instanceof SafeError
          ? caught.message
          : caught instanceof Error && SAFE_LOCAL_MESSAGES.has(caught.message)
            ? caught.message
            : "Não foi possível concluir a operação Evolfy.";
      result(message.id, {
        content: [{ type: "text", text: messageText.slice(0, 240) }],
        isError: true,
      });
    }
    return;
  }
  if (message.id !== undefined) error(message.id, -32601, "Method not found");
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline).replace(/\r$/, "");
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      error(null, -32700, "Parse error");
      continue;
    }
    void receive(message).catch(() =>
      error(message.id ?? null, -32603, "Internal error"),
    );
  }
});
