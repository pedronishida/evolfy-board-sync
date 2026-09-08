---
name: evolfy-board-sync
description: Conecta o projeto atual a um Board Evolfy por código de pareamento e registra progresso, testes, bloqueios e conclusão enquanto a sessão trabalha. Use quando o usuário pedir para conectar, sincronizar, alimentar ou atualizar um Board Evolfy a partir do Codex ou Claude Code, ou fornecer um código EVF de conexão.
---

# Evolfy Board Sync

Use as ferramentas MCP do servidor `evolfy-board-sync`. O Board é um canal de
acompanhamento interno; ele não é um destino para copiar transcript ou código.

## Conectar

1. Confirme o diretório raiz do projeto atual. Passe esse caminho local em
   `projectRoot`; o servidor o usa somente para calcular um fingerprint e nunca
   envia o caminho à Evolfy.
2. Quando o usuário fornecer um código `EVF-…`, chame `evolfy_connect` uma única
   vez com `projectRoot`, `code` e `provider` (`codex` ou `claude_code`).
3. Não repita cegamente uma troca que terminou de forma ambígua. Consulte
   `evolfy_connection_status` primeiro; o pareamento é de uso único.
4. Chame `evolfy_get_board` e use os IDs retornados. Nunca invente Board ou
   `cardId`.

O token fica em um arquivo local com permissão `0600`, fora do repositório. Não
peça webhook, URL do Board, chave de API ou credencial da workspace.

## Atualizar durante o trabalho

Registre marcos que uma pessoa acompanhando o projeto realmente precisa saber:

- `evolfy_report_progress` depois de uma mudança funcional verificável;
- `evolfy_report_tests` depois de executar testes, com contagem resumida;
- `evolfy_report_blocker` quando o trabalho não pode continuar sem decisão ou
  dependência externa;
- `evolfy_complete_work` somente quando a entrega estiver realmente concluída.

Use `cardId` somente quando a associação for explícita ou inequívoca. Sem isso,
publique no feed geral do agente. Um evento com `cardId` também aparece como
comentário interno naquele card.

Envie no máximo uma ou duas frases de linguagem operacional. Nunca envie:

- prompt, transcript ou raciocínio;
- código, diff, patch, conteúdo ou caminho de arquivo;
- comando, argumentos, stdout, stderr ou stack trace;
- e-mail, URL, variável de ambiente, token, segredo ou credencial;
- descrição, comentário ou anexo copiado do Board.

Sintetize localmente resultados técnicos. Exemplo seguro: “Validação concluída:
42 testes passaram e o build terminou sem erros.” Se a API recusar o resumo,
reescreva-o de forma mais abstrata; preserve a mesma chave de idempotência apenas
quando o conteúdo for idêntico.

Nenhuma ferramenta move cards ou publica no portal do cliente. Esses controles
continuam humanos e separados.

## Encerrar

Não desconecte ao terminar uma tarefa comum; a conexão pertence ao projeto e
pode ser reutilizada em outra sessão. Use `evolfy_disconnect` somente quando o
usuário pedir para revogar/remover a conexão deste projeto.
