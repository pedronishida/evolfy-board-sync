# Changelog

## 0.2.2 — 2026-09-11

- a instrução que o servidor entrega a toda sessão passa a dizer **quando**
  criar e mover card — ao começar a entrega e quando os testes passam — e não
  só onde. Na 0.2.1 esse ciclo morava só na skill, que carrega apenas quando o
  usuário cita o Board: uma sessão inteira de entregas passou com o feed
  preenchido e quase nenhum card;
- a skill também passa a valer, sem pedido, para projeto já conectado que
  começa, testa, bloqueia ou conclui uma entrega, e pede os relatórios no
  momento em que acontecem, não em lote no fim.

## 0.2.1 — 2026-09-10

- quando a rede falha e a repetição devolve o card que a própria chamada
  criou, o resultado passa a dizer `created: true`;
- a skill explica o que fazer com um card reaproveitado que está em coluna
  não liberada ou publicado para o cliente.

## 0.2.0 — 2026-09-10

- `evolfy_create_card` e `evolfy_move_card`, disponíveis quando o código de
  pareamento inclui as permissões Criar cards e Mover cards;
- `evolfy_get_board` passa a informar colunas liberadas, colunas que concluem e
  cards publicados para o cliente;
- escrita de card repete a mesma chave apenas quando a rede falha, para não
  duplicar;
- a skill orienta um card por entrega, reaproveitamento por título e como
  reagir a cada recusa.

## 0.1.0 — 2026-09-08

- primeiro pacote público para Codex e Claude Code;
- pareamento Evolfy de uso único;
- leitura mínima de Board e feed operacional próximo de tempo real;
- comentários internos opcionais por `cardId`;
- armazenamento local de token com permissão `0600`;
- bloqueio de conteúdo sensível e ausência de publicação automática.
