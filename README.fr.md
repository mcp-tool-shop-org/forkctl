<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkctl/readme.png" width="500" alt="forkctl">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkctl/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

> Plan d’adoption pour les dépôts GitHub. Il ne s’agit pas d’un simple outil de duplication, mais d’une couche complète qui évalue la préparation à l’adoption, choisit la méthode de duplication appropriée, l’exécute en tant qu’opération asynchrone suivie, laisse le résultat exécutable, le maintient synchronisé au fil du temps et, nouveauté dans v1.1.0, le renomme de manière cohérente lorsque vous êtes prêt à l’utiliser comme le vôtre.

## Nouveautés dans v1.1.0

Couche 7 — **Renommage polyglotte basé sur l’AST**. `forkctl rename plan` génère un diff consultable sur les fichiers d’identité, les symboles de code (26 langages via ast-grep) et les éléments textuels non liés au code. `forkctl rename apply` crée un instantané de l’arborescence, exécute toutes les passes, régénère les fichiers de verrouillage et laisse un manifeste de régénération des ressources pour tout élément binaire. `forkctl rename rollback` restaure le dernier instantané. Pas de chaînes `sed`. Correction des limites de mots. Sensible à la casse.

## Ce que fait forkctl

La duplication d’un dépôt GitHub ne nécessite qu’un seul clic. L’adoption (choix entre une duplication et un modèle, gestion de la politique de l’organisation, attente de la création asynchrone, configuration de la synchronisation avec le dépôt d’origine, et enfin, rendre le résultat réellement exécutable) implique tout le reste.

Forkctl gère tout le reste.

| Couche | Ce qu’elle fait |
|--------------|-----------------------------------------------------------------------------------------------|
| Évaluation | Évalue la préparation à l’adoption d’un dépôt, recommande une duplication, un modèle ou une importation, propose des corrections côté source. |
| Exécution | Crée la copie en tant qu’opération asynchrone suivie. Affiche les obstacles liés à la politique de duplication de l’organisation ou de l’entreprise. |
| Initialisation | Maintenance après l’initialisation basée sur le profil : configuration de la synchronisation avec le dépôt d’origine, mises à jour du fichier README, analyse des dérives, transfert d’une version exécutable. |
| Synchronisation | Appelle l’API GitHub merge-upstream. Signale honnêtement les divergences. En cas de besoin, revient à une demande de fusion (PR). |
| Gestion de parc | Liste, vérifie l’état et synchronise par lots vos duplications. |
| Justificatifs | Enregistrement lisible par machine de chaque opération. Journal d’audit dans le SQLite local. |
| Renommage | Renommage polyglotte basé sur l’AST : fichiers d’identité, symboles de code, éléments textuels, régénération du fichier de verrouillage. |

## Modèles d’utilisation

Forkctl est fourni sous la forme d’un **serveur MCP** (transport stdio, pour Claude Code et d’autres clients MCP) et d’une **CLI** avec la même interface.

### MCP

Ajoutez-le à la configuration de votre client MCP :

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

Toutes les commandes acceptent `--json` pour une sortie lisible par machine.

<!-- FORKABLE_COUNTS_START -->
## Les vingt-deux outils
<!-- FORKABLE_COUNTS_END -->

### Évaluation
- `forkctl_assess` — score de préparation à l’adoption, obstacles, points forts
- `forkctl_choose_path` — duplication | modèle | importation | clonage détaché
- `forkctl_make_forkable` — corrige le dépôt source (par défaut : planification ; option : demande de fusion)

### Exécution
- `forkctl_preflight_policy` — détecte les obstacles liés à la politique de duplication de l’entreprise/de l’organisation/du dépôt
- `forkctl_create_fork` — asynchrone, renvoie l’ID de l’opération
- `forkctl_create_from_template` — utilise GitHub `/generate`
- `forkctl_check_operation` — interroge toute opération en cours

### Initialisation
- `forkctl_bootstrap` — basé sur le profil (contributeur / kit de démarrage / base interne / livraison client / expérimentation)
- `forkctl_configure_upstream` — définit le dépôt distant, flux de travail de synchronisation facultatif
- `forkctl_scan_drift` — chemins codés en dur, secrets divulgués, références CI obsolètes dans la copie
- `forkctl_emit_handoff` — un seul artefact véridique : URL, commandes, avertissements, prochaine action

### Synchronisation
- `forkctl_sync` — API GitHub merge-upstream
- `forkctl_diagnose_divergence` — nombre de commits en retard, fichiers à risque, conflits prévus
- `forkctl_propose_sync_pr` — synchronisation basée sur une demande de fusion lorsque le fast-forward échoue

### Gestion de parc
- `forkctl_list_forks` — les vôtres + surveillés, avec une colonne d’état
- `forkctl_fleet_health` — obsolètes / en conflit / abandonnés
- `forkctl_batch_sync` — limité, tenant compte des limites de débit

### Justificatifs
- `forkctl_receipt` — enregistrement lisible par machine de toute opération
- `forkctl_audit_log` — historique en append-only

### Renommage (Couche 7 — nouveauté dans v1.1.0)
- `forkctl_rename_plan` — planificateur de renommage basé sur l’AST ; génère un diff consultable
- `forkctl_rename_apply` — crée des instantanés et applique l’identité, les symboles, les éléments textuels et les passes post-traitement
- `forkctl_rename_rollback` — restaure à partir du dernier instantané

## Profils d’initialisation

| Profil | Pour | Maintenance après l’initialisation |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Duplication pour envoyer des demandes de fusion au dépôt d’origine | Dépôt distant, flux de travail de synchronisation, bloc README pour les contributeurs, modèle de demande de fusion s’il est absent |
| `starter-kit`       | Généré à partir d’un modèle pour lancer votre propre produit | Supprime les références au modèle, crée un nouveau fichier README, invite à créer un nouveau fichier LICENSE, .env.example |
| `internal-seed`     | Copie interne d’un dépôt de base partagé | Remplace les espaces réservés, définit les CODEOWNERS internes, verrouille la visibilité |
| `client-delivery`   | Duplication par client d’une version livrable | Branches nommées par le client, vérification de l’historique, branche par défaut verrouillée |
| `experiment`        | Copie temporaire / détachée | Détache le dépôt d’origine, indique qu’il s’agit d’une expérience dans le fichier README, pas de flux de travail de synchronisation |

## Configuration

| Variable | Obligatoire | Valeur par défaut | Notes |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | oui | —                                            | Portées `repo`, `workflow`, `read:org` |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Pour GHES / ghe.com |
| `FORKCTL_STATE_DIR` | no       | Répertoire d’état de l’utilisateur du système d’exploitation (via `env-paths`) | Emplacement des opérations SQLite et de la base de données d’audit |

## Sécurité

Consultez le fichier [SECURITY.md](SECURITY.md) pour connaître le modèle de menace et la politique de signalement. Points clés :

- `GITHUB_TOKEN` n’est jamais enregistré.
- Chaque entrée est validée via Zod.
- `make_forkable` utilise par défaut le mode `plan`. Le mode `pr` est facultatif.
- Forkctl ne force jamais les envois, ne supprime jamais les dépôts ou les branches.
- Pas de télémétrie. Pas d’appels sortants, à l’exception de l’API GitHub configurée.

## État

v2.1.1 — les délais d’attente de renommage mettent désormais fin à l’ensemble de l’arborescence du processus ; mises à jour de sécurité des dépendances. Couche 7 (Renommage) et mode `--brand` comme dans la version 2.1.0. Construit selon la grille [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Consultez le fichier [SHIP_GATE.md](SHIP_GATE.md) pour connaître le tableau de bord.

## Licence

MIT — voir [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
