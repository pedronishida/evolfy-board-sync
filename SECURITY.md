# Segurança

Não publique vulnerabilidades, códigos de pareamento, tokens ou dados de Board
em issues. Use o formulário privado de
[Security Advisories](https://github.com/pedronishida/evolfy-board-sync/security/advisories/new)
do repositório.

Inclua somente o necessário para reproduzir o problema. Remova prompt,
transcript, código proprietário, caminhos locais, comandos, outputs, e-mails,
URLs privadas e credenciais antes de enviar o relato.

## Modelo de confiança

- o código `EVF-…` é de uso único e expira em até 10 minutos;
- o token de projeto fica fora do repositório e nunca aparece na resposta da
  ferramenta;
- o servidor aceita somente um catálogo fechado de eventos e metadados;
- nenhuma ferramenta move cards ou publica no Portal do cliente;
- a conexão pode ser revogada no Board ou por `evolfy_disconnect`.
