---
name: evolfy-board-sync
description: Conecta o projeto atual a um Board Evolfy por código de pareamento, registra progresso, testes, bloqueios e conclusão enquanto a sessão trabalha e, quando permitido, cria e move cards nas colunas liberadas. Use quando o usuário pedir para conectar, sincronizar, alimentar, organizar ou atualizar um Board Evolfy a partir do Codex ou Claude Code, ou fornecer um código EVF de conexão.
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

Nenhuma ferramenta publica no portal do cliente. Esse controle continua humano e
separado.

## Organizar cards

Quando o código de conexão incluiu as permissões **Criar cards** e **Mover
cards**, o agente mantém o Board alinhado ao trabalho. As regras abaixo são
garantidas pelo servidor; siga-as para não gastar chamadas com recusas.

- Consulte `evolfy_get_board` antes. Crie e mova somente em colunas com
  `agentAllowed: true`. Coluna com `closesCards: true` e colunas não liberadas
  são sempre humanas.
- Um card por entrega ou frente de trabalho, nunca por commit, arquivo ou
  tarefa interna. Antes de criar, procure em `cards` um card aberto sobre o
  mesmo assunto e prefira reutilizá-lo. Mesmo título (ignorando maiúsculas e
  espaços) devolve o card existente em vez de criar outro.
- Título curto em linguagem de produto, até 200 caracteres, como “Checkout com
  Pix”. Nunca código, caminho, comando, URL, e-mail ou segredo.
- Mova quando o estado real mudar: ao começar a implementar, para a coluna de
  desenvolvimento; quando os testes passarem, para a coluna de testes internos.
  Informe sempre a coluna atual do card em `fromColumnId`, lida no
  `evolfy_get_board` mais recente.
- Card com `publishedToClient: true` ou concluído fica com pessoas. Não tente
  movê-lo.
- Depois de criar um card, use o `cardId` dele nos `evolfy_report_*` daquela
  entrega.

Como reagir às recusas:

- “O card mudou de coluna”: alguém mexeu antes. Leia o Board de novo e não
  insista no movimento.
- “Esta conexão não tem permissão”: diga ao usuário que é preciso gerar um
  código novo com a permissão. Não repita a chamada.
- “Esta coluna não está liberada”: use outra coluna liberada ou avise o usuário.
- “A cota diária de cards desta conexão acabou”: pare de criar cards e siga só
  com os relatórios.

## Encerrar

Não desconecte ao terminar uma tarefa comum; a conexão pertence ao projeto e
pode ser reutilizada em outra sessão. Use `evolfy_disconnect` somente quando o
usuário pedir para revogar/remover a conexão deste projeto.
