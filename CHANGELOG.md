# Changelog

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
