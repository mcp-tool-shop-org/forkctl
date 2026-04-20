<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkable/readme.png" width="500" alt="forkable">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkable/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

Plano de controle de adoção para repositórios do GitHub. Não é um "wrapper" para bifurcações – é uma camada completa que avalia a prontidão para adoção, escolhe o caminho de duplicação correto, executa-o como uma operação assíncrona monitorada, mantém o resultado executável, mantém a sincronização ao longo do tempo e – uma novidade na versão 1.1.0 – renomeia o código de forma coerente quando você estiver pronto para torná-lo seu.

## Novidades na versão 1.1.0

Camada 7 – **Renomeação poliglota com consciência da estrutura da árvore sintática (AST)**. O comando `forkable rename plan` gera uma diferença (diff) que pode ser revisada, abrangendo arquivos de identidade, símbolos de código (26 linguagens via ast-grep) e superfícies textuais não relacionadas ao código. O comando `forkable rename apply` faz um snapshot da árvore, executa todas as etapas, regenera os arquivos de bloqueio e deixa um manifesto para a regeneração de qualquer arquivo binário. O comando `forkable rename rollback` restaura o último snapshot. Não utiliza cadeias de comandos `sed`. Garante a correção dos limites das palavras. Considera a capitalização.

## O que o forkable faz

Fazer um fork de um repositório do GitHub é simples, com um único clique. Adotar esse repositório – escolher entre fork e template, lidar com políticas da organização, esperar a criação assíncrona, configurar a sincronização com o repositório original e garantir que o resultado seja realmente utilizável – é tudo o que vem a seguir.

O forkable cuida de tudo o que vem a seguir.

| Camada | O que ele faz |
|--------------|-----------------------------------------------------------------------------------------------|
| Avaliação | Avalia a prontidão de um repositório para adoção, recomenda fork, template ou importação, e sugere correções no repositório original. |
| Execução | Cria a cópia como uma operação assíncrona monitorada. Identifica bloqueios de políticas de fork da organização/empresa desde o início. |
| Configuração Inicial | Configuração pós-criação orientada por perfil – configuração do repositório original, atualizações no README, verificação de desvios e entrega do resultado pronto para uso. |
| Sincronização | Utiliza a API de sincronização com o repositório original do GitHub. Reporta divergências de forma transparente. Recorre a pull requests (PRs) quando necessário. |
| Gerenciamento em Massa | Lista, verifica o status e sincroniza em lote seus forks. |
| Registros | Registro legível por máquina de cada operação. Log de auditoria em SQLite local. |
| Renomeação | Renomeação poliglota com consciência da estrutura da árvore sintática – arquivos de identidade, símbolos de código, superfícies textuais, regeneração de arquivos de bloqueio. |

## Formas de Uso

O forkable é disponibilizado como um **servidor MCP** (com transporte via stdio, para clientes MCP como Claude Code) e como uma **interface de linha de comando (CLI)** com a mesma funcionalidade.

### MCP

Adicione o seguinte à configuração do seu cliente MCP:

```json
{
  "mcpServers": {
    "forkable": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkable", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

### CLI

```bash
npx @mcptoolshop/forkable assess owner/repo
npx @mcptoolshop/forkable choose-path owner/repo --goal contribute_upstream
npx @mcptoolshop/forkable create-fork owner/repo --destination-org my-org
npx @mcptoolshop/forkable sync my-fork
npx @mcptoolshop/forkable fleet-health
```

Todos os comandos aceitam a opção `--json` para saída legível por máquina.

<!-- FORKABLE_COUNTS_START -->
## As vinte e duas ferramentas
<!-- FORKABLE_COUNTS_END -->

### Avaliação
- `forkable_assess` — pontuação de prontidão para adoção, bloqueios, pontos fortes
- `forkable_choose_path` — fork | template | importação | clone (sem rastreamento)
- `forkable_make_forkable` — corrige o repositório original (padrão: planejamento; opcional: PR)

### Execução
- `forkable_preflight_policy` — detecta bloqueios de políticas de fork da organização/empresa/repositório
- `forkable_create_fork` — assíncrono, retorna o ID da operação
- `forkable_create_from_template` — utiliza o recurso `/generate` do GitHub
- `forkable_check_operation` — verifica o status de qualquer operação em andamento

### Configuração Inicial
- `forkable_bootstrap` — configuração pós-criação orientada por perfil (colaborador / kit de inicialização / seed interno / entrega para cliente / experimento)
- `forkable_configure_upstream` — define o repositório original e o fluxo de sincronização (opcional)
- `forkable_scan_drift` — verifica caminhos fixos, segredos expostos e referências de CI desatualizadas na cópia
- `forkable_emit_handoff` — gera um único artefato com informações relevantes: URLs, comandos, avisos e próxima ação

### Sincronização
- `forkable_sync` — API de sincronização com o repositório original do GitHub
- `forkable_diagnose_divergence` — commits pendentes, arquivos em risco, conflitos previstos
- `forkable_propose_sync_pr` — propõe uma pull request (PR) para sincronização quando a sincronização direta falha

### Gerenciamento em Massa
- `forkable_list_forks` — lista seus forks e os que você está monitorando, com uma coluna de status
- `forkable_fleet_health` — verifica o status de forks desatualizados, com conflitos ou abandonados
- `forkable_batch_sync` — sincroniza em lote, respeitando limites de taxa

### Registros
- `forkable_receipt` — registro legível por máquina de qualquer operação
- `forkable_audit_log` — histórico de alterações (apenas anexos)

### Renomeação (Camada 7 – novidade na versão 1.1.0)
- `forkable_rename_plan` – planejador de renomeação com consciência da estrutura da árvore sintática; gera uma diferença (diff) que pode ser revisada.
- `forkable_rename_apply` – faz um snapshot e aplica as alterações em arquivos de identidade, símbolos, superfícies textuais e executa etapas adicionais.
- `forkable_rename_rollback` – restaura a partir do último snapshot.

## Perfis de Configuração Inicial

| Perfil | Para | Configuração Pós-Criação |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Fazer um fork para enviar pull requests (PRs) para o repositório original | Repositório original, fluxo de sincronização, bloco no README para colaboradores, modelo de PR (se não existir) |
| `starter-kit`       | Gerado a partir de um modelo para iniciar seu próprio produto. | Remoção de referências a modelos, novo arquivo README, novo aviso de licença, arquivo .env.example. |
| `internal-seed`     | Cópia interna para a equipe de um repositório compartilhado. | Substituição de espaços reservados, definição de proprietários internos do código (CODEOWNERS), bloqueio da visibilidade. |
| `client-delivery`   | Cópia específica para cada cliente de um produto entregável. | Ramos com nomes de clientes, verificação da limpeza do histórico, ramo padrão bloqueado. |
| `experiment`        | Cópia descartável / independente. | Desconexão do repositório principal, marcação como experimento no arquivo README, sem fluxo de sincronização. |

## Configuração

| Variável. | Obrigatório. | Padrão. | Observações. |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | sim. | —                                            | Escopos `repo`, `workflow`, `read:org`. |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Para GHES / ghe.com. |
| `FORKABLE_STATE_DIR` | no       | Diretório de estado do usuário do sistema operacional (via `env-paths`). | Local onde as operações do SQLite e o banco de dados de auditoria são armazenados. |

## Segurança

Consulte [SECURITY.md](SECURITY.md) para o modelo de ameaças e a política de relatórios. Pontos importantes:

- O token `GITHUB_TOKEN` nunca é registrado.
- Cada entrada de ferramenta é validada através do Zod.
- `make_forkable` usa o modo "plan" por padrão. O modo "pr" é opcional.
- O recurso "forkable" nunca faz pushes forçados, exclui repositórios ou exclui ramos.
- Sem telemetria. Sem chamadas de saída, exceto para a API do GitHub configurada.

## Status

Versão 1.1.0 – adiciona a Camada 7 (Renomeação). Construído com base no sistema de verificação [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Consulte [SHIP_GATE.md](SHIP_GATE.md) para a avaliação do padrão.

## Licença

MIT — consulte [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
