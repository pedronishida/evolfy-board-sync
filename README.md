# Evolfy Board Sync

Plugin oficial para conectar uma sessão Codex ou Claude Code a um Board Evolfy.
A conexão usa um código de pareamento de uso único, válido por até 10 minutos.
Não é necessário fornecer webhook, URL do Board, chave de API ou credencial da
workspace.

Requisito local: Node.js 20 ou mais recente.

Enquanto a sessão trabalha, o plugin pode registrar progresso, testes,
bloqueios e conclusão no feed interno do Board. Quando um `cardId` válido é
informado, o resumo também entra como comentário interno daquele card. Nada é
publicado automaticamente no portal do cliente.

## Instalar no Codex

```sh
codex plugin marketplace add pedronishida/evolfy-board-sync
codex plugin add evolfy-board-sync@evolfy
```

Reinicie a sessão e use `$evolfy-board-sync` com o código gerado no Board.

## Instalar no Claude Code

```text
/plugin marketplace add pedronishida/evolfy-board-sync
/plugin install evolfy-board-sync@evolfy
```

Recarregue os plugins quando solicitado e use
`/evolfy-board-sync:evolfy-board-sync` com o código gerado no Board.

## Segurança

- o código de pareamento é uso único e expira em até 10 minutos;
- o token é exclusivo por projeto, revogável e salvo fora do repositório em
  arquivo local `0600`;
- o caminho local e a URL do repositório são somente fingerprintados e não são
  enviados à Evolfy;
- payloads aceitam somente resumo, estado, referência curta de commit, branch e
  `cardId` opcional;
- prompt, transcript, código, diff, arquivo, comando, output, e-mail, URL,
  variável de ambiente e segredo são proibidos;
- não existe ferramenta para mover cards ou publicar no portal do cliente.

O sincronismo é próximo de tempo real enquanto a sessão do agente está ativa.
Para acompanhamento contínuo 24 horas por dia, use também o GitHub App do
Portal de Projetos.
