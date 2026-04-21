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

Plan de contrôle de l'adoption (du produit) pour les dépôts GitHub. Ce n'est pas un simple wrapper pour les forks, mais une couche complète qui évalue la préparation à l'adoption, choisit le bon chemin de duplication, l'exécute comme une opération asynchrone suivie, conserve le résultat exécutable, le maintient synchronisé au fil du temps, et – nouveauté dans la version 1.1.0 – le renomme de manière cohérente lorsque vous êtes prêt à l'intégrer à votre propre projet.

## Nouveautés de la version 1.1.0

Couche 7 – **Renommage multilingue conscient du contexte syntaxique (AST).** Le `forkctl rename plan` génère un diff consultable qui couvre les fichiers d'identité, les symboles de code (26 langages via ast-grep) et les surfaces textuelles non liées au code. Le `forkctl rename apply` prend une capture de l'arborescence, exécute toutes les étapes, régénère les fichiers de verrouillage et laisse un manifeste de régénération des ressources pour tout ce qui est binaire. Le `forkctl rename rollback` restaure la dernière capture. Pas de chaînes `sed`. Correction des limites des mots. Sensible à la casse.

## Ce que fait forkctl

Créer un fork d'un dépôt GitHub prend un seul clic. L'adopter, c'est-à-dire choisir entre un fork et un modèle, gérer les politiques de l'organisation, attendre la création asynchrone, configurer la synchronisation avec la branche principale, et rendre le résultat réellement exécutable, c'est tout le reste.

Forkctl gère tout ce "reste".

| Couche | Ce que cela fait |
|--------------|-----------------------------------------------------------------------------------------------|
| Évaluation | Évalue la préparation à l'adoption d'un dépôt, recommande un fork, un modèle ou une importation, et propose des corrections à apporter au dépôt source. |
| Exécution | Crée la copie en tant qu'opération asynchrone suivie. Signale les blocages liés aux politiques de l'organisation/de l'entreprise dès le début. |
| Mise en place | Suivi basé sur un profil : configuration de la branche principale, mises à jour du fichier README, analyse des modifications, et transmission du résultat. |
| Synchronisation | Utilise l'API GitHub merge-upstream. Signale honnêtement les divergences. Recourt à une pull request si nécessaire. |
| Gestion centralisée | Listez, vérifiez l'état et synchronisez par lots vos forks. |
| Relevés | Enregistrement lisible par machine de chaque opération. Journal d'audit dans une base de données SQLite locale. |
| Renommage | Renommage multilingue conscient du contexte syntaxique : fichiers d'identité, symboles de code, surfaces textuelles, régénération des fichiers de verrouillage. |

## Modes d'utilisation

Forkctl est disponible en tant que **serveur MCP** (transport via stdin/stdout, pour Claude Code et autres clients MCP) et en tant qu'**interface en ligne de commande (CLI)** avec la même interface.

### MCP

Ajoutez ceci à la configuration de votre client MCP :

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

Toutes les commandes acceptent l'option `--json` pour une sortie lisible par machine.

<!-- FORKABLE_COUNTS_START -->
## Les vingt-deux outils
<!-- FORKABLE_COUNTS_END -->

### Évaluation
- `forkctl_assess` — score de préparation à l'adoption, blocages, points forts
- `forkctl_choose_path` — fork | modèle | importation | clone-détaché
- `forkctl_make_forkable` — corrige le dépôt source (par défaut : plan ; optionnel : pull request)

### Exécution
- `forkctl_preflight_policy` — détecte les blocages liés aux politiques de l'entreprise/de l'organisation/du dépôt
- `forkctl_create_fork` — asynchrone, renvoie l'ID de l'opération
- `forkctl_create_from_template` — utilise GitHub `/generate`
- `forkctl_check_operation` — surveille toute opération en cours

### Mise en place
- `forkctl_bootstrap` — basé sur un profil (contributeur / kit de démarrage / amorçage interne / livraison client / expérience)
- `forkctl_configure_upstream` — définit la branche principale, flux de synchronisation optionnel
- `forkctl_scan_drift` — chemins codés en dur, secrets divulgués, références CI obsolètes dans la copie
- `forkctl_emit_handoff` — artefact unique et fiable : URL, commandes, avertissements, prochaine action

### Synchronisation
- `forkctl_sync` — API GitHub merge-upstream
- `forkctl_diagnose_divergence` — commits en retard, fichiers à risque, conflits prévus
- `forkctl_propose_sync_pr` — synchronisation basée sur une pull request en cas d'échec de la fusion directe

### Gestion centralisée
- `forkctl_list_forks` — les vôtres + surveillés, avec une colonne d'état
- `forkctl_fleet_health` — obsolètes / en conflit / abandonnés
- `forkctl_batch_sync` — limité, conscient des limites de débit

### Relevés
- `forkctl_receipt` — enregistrement lisible par machine de toute opération
- `forkctl_audit_log` — historique append-only

### Renommage (Couche 7 – nouveauté dans la version 1.1.0)
- `forkctl_rename_plan` – planificateur de renommage conscient du contexte syntaxique ; génère un diff consultable.
- `forkctl_rename_apply` – prend une capture et applique les modifications aux fichiers d'identité, aux symboles, aux surfaces textuelles et effectue les étapes de post-traitement.
- `forkctl_rename_rollback` – restaure à partir de la dernière capture.

## Profils de mise en place

| Profil | Pour | Suivi |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Création de forks pour renvoyer des pull requests à la branche principale | Branche principale, flux de synchronisation, bloc de contribution dans le fichier README, modèle de pull request si absent |
| `starter-kit`       | Création d'une copie pour lancer votre propre produit. | Suppression des références aux modèles, nouveau fichier README, nouvelle indication de licence, fichier .env.example. |
| `internal-seed`     | Copie interne pour l'équipe, issue d'un dépôt partagé. | Remplacement des espaces réservés, définition des responsables de code internes (CODEOWNERS), verrouillage de la visibilité. |
| `client-delivery`   | Dérivation spécifique à chaque client pour un livrable. | Branches nommées selon le client, vérification de l'historique nettoyé, branche par défaut verrouillée. |
| `experiment`        | Copie temporaire / isolée. | Déconnexion du dépôt principal, indication "expérimental" dans le fichier README, pas de flux de synchronisation. |

## Configuration

| Variable. | Obligatoire. | Par défaut. | Notes. |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | oui. | —                                            | Scopes : `repo`, `workflow`, `read:org`. |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Pour GHES / ghe.com. |
| `FORKCTL_STATE_DIR` | no       | Répertoire d'état de l'utilisateur du système d'exploitation (via `env-paths`). | Emplacement des opérations SQLite et de la base de données d'audit. |

## Sécurité

Voir [SECURITY.md](SECURITY.md) pour le modèle de menace et la politique de signalement. Points clés :

- Le jeton `GITHUB_TOKEN` n'est jamais enregistré.
- Chaque entrée de l'outil est validée via Zod.
- `make_forkable` est par défaut en mode `plan`. Le mode `pr` est optionnel.
- Les dépôts dérivés ne font jamais de "force-push", ne suppriment jamais de dépôts et ne suppriment jamais de branches.
- Aucune télémétrie. Aucun appel sortant, sauf les appels à l'API GitHub configurée.

## Statut

Version 1.1.0 – ajoute la Couche 7 (Renommage). Construit selon les normes de [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Voir [SHIP_GATE.md](SHIP_GATE.md) pour le tableau de bord de la validation.

## Licence

MIT — voir [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
