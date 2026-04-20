<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkable/readme.png" width="500" alt="forkable">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkable/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

> Couche de contrôle de l'adoption pour les dépôts GitHub. Ce n'est pas un simple wrapper de fork, mais une couche complète qui évalue la préparation à l'adoption, choisit le bon mode de duplication, l'exécute comme une opération asynchrone suivie, rend le résultat exécutable et le maintient synchronisé au fil du temps.

## Ce que fait forkable

Créer un fork d'un dépôt GitHub prend un seul clic. L'adopter, c'est-à-dire choisir entre un fork et un modèle, gérer les politiques de l'organisation, attendre la création asynchrone, configurer la synchronisation avec la branche principale, et rendre le résultat réellement exécutable, c'est tout le reste.

Forkable gère tout ce "reste".

| Couche | Ce que cela fait |
|--------------|-----------------------------------------------------------------------------------------------|
| Évaluation | Évalue la préparation à l'adoption d'un dépôt, recommande un fork, un modèle ou une importation, et propose des corrections à apporter au dépôt source. |
| Exécution | Crée la copie en tant qu'opération asynchrone suivie. Signale les blocages liés aux politiques de l'organisation/de l'entreprise dès le début. |
| Mise en place | Suivi basé sur un profil : configuration de la branche principale, mises à jour du fichier README, analyse des modifications, et transmission du résultat. |
| Synchronisation | Utilise l'API GitHub merge-upstream. Signale honnêtement les divergences. Recourt à une pull request si nécessaire. |
| Gestion centralisée | Listez, vérifiez l'état et synchronisez par lots vos forks. |
| Relevés | Enregistrement lisible par machine de chaque opération. Journal d'audit dans une base de données SQLite locale. |

## Modes d'utilisation

Forkable est disponible en tant que **serveur MCP** (transport via stdin/stdout, pour Claude Code et autres clients MCP) et en tant qu'**interface en ligne de commande (CLI)** avec la même interface.

### MCP

Ajoutez ceci à la configuration de votre client MCP :

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

Toutes les commandes acceptent l'option `--json` pour une sortie lisible par machine.

<!-- FORKABLE_COUNTS_START -->
## Les vingt-deux outils
<!-- FORKABLE_COUNTS_END -->

### Évaluation
- `forkable_assess` — score de préparation à l'adoption, blocages, points forts
- `forkable_choose_path` — fork | modèle | importation | clone-détaché
- `forkable_make_forkable` — corrige le dépôt source (par défaut : plan ; optionnel : pull request)

### Exécution
- `forkable_preflight_policy` — détecte les blocages liés aux politiques de l'entreprise/de l'organisation/du dépôt
- `forkable_create_fork` — asynchrone, renvoie l'ID de l'opération
- `forkable_create_from_template` — utilise GitHub `/generate`
- `forkable_check_operation` — surveille toute opération en cours

### Mise en place
- `forkable_bootstrap` — basé sur un profil (contributeur / kit de démarrage / amorçage interne / livraison client / expérience)
- `forkable_configure_upstream` — définit la branche principale, flux de synchronisation optionnel
- `forkable_scan_drift` — chemins codés en dur, secrets divulgués, références CI obsolètes dans la copie
- `forkable_emit_handoff` — artefact unique et fiable : URL, commandes, avertissements, prochaine action

### Synchronisation
- `forkable_sync` — API GitHub merge-upstream
- `forkable_diagnose_divergence` — commits en retard, fichiers à risque, conflits prévus
- `forkable_propose_sync_pr` — synchronisation basée sur une pull request en cas d'échec de la fusion directe

### Gestion centralisée
- `forkable_list_forks` — les vôtres + surveillés, avec une colonne d'état
- `forkable_fleet_health` — obsolètes / en conflit / abandonnés
- `forkable_batch_sync` — limité, conscient des limites de débit

### Relevés
- `forkable_receipt` — enregistrement lisible par machine de toute opération
- `forkable_audit_log` — historique append-only

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
| `FORKABLE_STATE_DIR` | no       | Répertoire d'état de l'utilisateur du système d'exploitation (via `env-paths`). | Emplacement des opérations SQLite et de la base de données d'audit. |

## Sécurité

Voir [SECURITY.md](SECURITY.md) pour le modèle de menace et la politique de signalement. Points clés :

- Le jeton `GITHUB_TOKEN` n'est jamais enregistré.
- Chaque entrée de l'outil est validée via Zod.
- `make_forkable` est par défaut en mode `plan`. Le mode `pr` est optionnel.
- Les dépôts dérivés ne font jamais de "force-push", ne suppriment jamais de dépôts et ne suppriment jamais de branches.
- Aucune télémétrie. Aucun appel sortant, sauf les appels à l'API GitHub configurée.

## Statut

v1.0.0 — version initiale. Construit selon les critères de [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Voir [SHIP_GATE.md](SHIP_GATE.md) pour le tableau de bord de la validation.

## Licence

MIT — voir [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
