<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkctl/readme.png" width="500" alt="forkctl">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkctl/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

> Plano de controle de adoção para repositórios GitHub. Não é um wrapper de fork — é uma camada completa que avalia a prontidão para adoção, escolhe o caminho de duplicação correto, executa como uma operação assíncrona rastreada, deixa o resultado pronto para ser executado, mantém a sincronização ao longo do tempo e — novidade na versão v1.1.0 — renomeia-o de forma coerente quando você estiver pronto para considerá-lo seu.

## O que há de novo na versão v1.1.0

Camada 7 — **renomeação poliglot sensível à AST**. `forkctl rename plan` emite um diff revisável em arquivos de identidade, símbolos de código (26 linguagens via ast-grep) e superfícies textuais não relacionadas ao código. `forkctl rename apply` cria um snapshot da árvore, executa todas as etapas, regenera os arquivos de bloqueio e deixa um manifesto de regeneração de ativos para qualquer item binário. `forkctl rename rollback` restaura o snapshot mais recente. Sem cadeias `sed`. Correção de limites de palavras. Sensível ao uso de maiúsculas e minúsculas.

## O que o forkctl faz

Fazer um fork de um repositório GitHub é um clique. Adotá-lo — escolher entre fork e modelo, lidar com a política da organização, aguardar a criação assíncrona, configurar a sincronização upstream, garantir que o resultado seja realmente executável — é tudo o mais.

O forkctl gerencia todo o resto.

| Camada | O que ela faz |
|--------------|-----------------------------------------------------------------------------------------------|
| Avaliação | Avalia a prontidão de um repositório para adoção, recomenda fork, modelo ou importação, propõe correções no código-fonte. |
| Execução | Cria a cópia como uma operação assíncrona rastreada. Apresenta os bloqueios da política de fork da organização/empresa. |
| Inicialização | Acompanhamento orientado por perfil — configuração upstream, atualizações do README, verificação de desvios, entrega de versão executável. |
| Sincronização | Chama a API GitHub merge-upstream. Relata as divergências de forma honesta. Recorre ao PR quando necessário. |
| Frota | Lista, verifica a integridade e sincroniza em lote seus forks. |
| Comprovantes | Registro legível por máquina de cada operação. Log de auditoria no SQLite local. |
| Renomeação | Renomeação poliglot sensível à AST — arquivos de identidade, símbolos de código, superfícies textuais, regeneração do arquivo de bloqueio. |

## Formas de uso

O forkctl é fornecido como um **servidor MCP** (transporte stdio, para Claude Code e outros clientes MCP) e uma **CLI** com a mesma interface.

### MCP

Adicione à configuração do seu cliente MCP:

```json
{
  "mcpServers": {
    "forkctl": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkctl", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

### CLI

```bash
npx @mcptoolshop/forkctl assess owner/repo
npx @mcptoolshop/forkctl choose-path owner/repo --goal contribute_upstream
npx @mcptoolshop/forkctl create-fork owner/repo --destination-org my-org
npx @mcptoolshop/forkctl sync my-fork
npx @mcptoolshop/forkctl fleet-health
```

Todos os comandos aceitam `--json` para saída legível por máquina.

<!-- FORKABLE_COUNTS_START -->
## As vinte e duas ferramentas
<!-- FORKABLE_COUNTS_END -->

### Avaliação
- `forkctl_assess` — pontuação de prontidão para adoção, bloqueios, pontos fortes
- `forkctl_choose_path` — fork | modelo | importação | clone-desanexado
- `forkctl_make_forkable` — corrige o repositório de origem (padrão: plano; opcional: PR)

### Execução
- `forkctl_preflight_policy` — detecta bloqueios da política de fork da empresa/organização/repositório
- `forkctl_create_fork` — assíncrono, retorna operation_id
- `forkctl_create_from_template` — usa GitHub `/generate`
- `forkctl_check_operation` — verifica qualquer operação em andamento

### Inicialização
- `forkctl_bootstrap` — orientado por perfil (colaborador / kit inicial / base interna / entrega ao cliente / experimento)
- `forkctl_configure_upstream` — define o remoto, fluxo de trabalho de sincronização opcional
- `forkctl_scan_drift` — caminhos codificados, segredos vazados, referências CI desatualizadas na cópia
- `forkctl_emit_handoff` — um único artefato verdadeiro: URLs, comandos, ressalvas, próxima ação

### Sincronização
- `forkctl_sync` — API GitHub merge-upstream
- `forkctl_diagnose_divergence` — commits atrasados, arquivos em risco, conflitos previstos
- `forkctl_propose_sync_pr` — sincronização baseada em PR quando o fast-forward falha

### Frota
- `forkctl_list_forks` — seus + monitorados, com coluna de integridade
- `forkctl_fleet_health` — desatualizado / em conflito / abandonado
- `forkctl_batch_sync` — limitado, com reconhecimento do limite de taxa

### Comprovantes
- `forkctl_receipt` — registro legível por máquina de qualquer operação
- `forkctl_audit_log` — histórico de apenas anexação

### Renomeação (Camada 7 — novidade na versão v1.1.0)
- `forkctl_rename_plan` — planejador de renomeação sensível à AST; emite um diff revisável
- `forkctl_rename_apply` — cria snapshots + aplica identidade + símbolos + texto + etapas pós
- `forkctl_rename_rollback` — restaura a partir do snapshot mais recente

## Perfis de inicialização

| Perfil | Para | Acompanhamento |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Fork para enviar PRs para o upstream | Remoto upstream, fluxo de trabalho de sincronização, bloco README para colaboradores, modelo de PR, se ausente |
| `starter-kit`       | Gerado a partir de um modelo para iniciar seu próprio produto | Remove referências de modelo, README novo, prompt LICENSE novo, .env.example |
| `internal-seed`     | Cópia interna de um repositório base compartilhado | Substitui os espaços reservados, define os CODEOWNERS internos, bloqueia a visibilidade |
| `client-delivery`   | Fork por cliente de um produto entregue | Branches com o nome do cliente, verificação de histórico sanitizado, branch padrão bloqueado |
| `experiment`        | Cópia descartável / desanexada | Desanexa o upstream, marca como experimento no README, sem fluxo de trabalho de sincronização |

## Configuração

| Variável | Obrigatório | Padrão | Notas |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | sim | —                                            | Escopos `repo`, `workflow`, `read:org` |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Para GHES / ghe.com |
| `FORKCTL_STATE_DIR` | no       | Diretório de estado do usuário do SO (via `env-paths`) | Onde as operações SQLite + o banco de dados de auditoria estão localizados |

## Segurança

Consulte [SECURITY.md](SECURITY.md) para o modelo de ameaças e a política de relatórios. Pontos-chave:

- `GITHUB_TOKEN` nunca é registrado.
- Cada entrada de ferramenta é validada por meio do Zod.
- `make_forkable` tem como padrão o modo `plan`. O modo `pr` é opcional.
- O forkctl nunca faz push forçado, exclui repositórios ou exclui branches.
- Sem telemetria. Sem chamadas de saída, exceto a API GitHub configurada.

## Status

v2.1.1 — os tempos limite de renomeação agora encerram toda a árvore do processo de comando; atualizações de segurança de dependências. Camada 7 (Renomeação) e modo `--brand`, conforme na versão 2.1.0. Criado para o gate [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Consulte [SHIP_GATE.md](SHIP_GATE.md) para o scorecard do gate.

## Licença

MIT — consulte [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
