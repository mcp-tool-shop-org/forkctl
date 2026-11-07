<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkctl/readme.png" width="500" alt="forkctl">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkctl/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

> Piano di controllo per l'adozione dei repository GitHub. Non si tratta di un wrapper per fork, ma di un livello completo che valuta la preparazione all'adozione, sceglie il percorso di duplicazione corretto, lo esegue come un'operazione asincrona tracciata, lascia il risultato eseguibile, lo mantiene sincronizzato nel tempo e — novità in v1.1.0 — lo rinomina in modo coerente quando si è pronti a considerarlo di proprietà.

## Cosa c'è di nuovo in v1.1.0

Livello 7: rinomina poliglota consapevole di AST. `forkctl rename plan` genera una diff revisionabile tra i file di identità, i simboli del codice (26 lingue tramite ast-grep) e le superfici testuali non di codice. `forkctl rename apply` crea uno snapshot dell'albero, esegue tutti i passaggi, rigenera i file di blocco e lascia un manifesto di rigenerazione delle risorse per qualsiasi elemento binario. `forkctl rename rollback` ripristina l'ultimo snapshot. Nessuna catena `sed`. Corretto per i confini delle parole. Sensibile alla capitalizzazione.

## Cosa fa forkctl

Effettuare il fork di un repository GitHub richiede un solo clic. Adottarlo, ovvero scegliere tra fork e template, gestire le politiche dell'organizzazione, attendere la creazione asincrona, configurare la sincronizzazione upstream e rendere il risultato effettivamente eseguibile, è tutto il resto.

Forkctl gestisce tutto il resto.

| Livello | Cosa fa |
|--------------|-----------------------------------------------------------------------------------------------|
| Valutazione | Valuta la preparazione all'adozione di un repository, suggerisce se scegliere un fork, un template o un import, propone correzioni lato sorgente. |
| Esecuzione | Crea la copia come un'operazione asincrona tracciata. Evidenzia immediatamente i blocchi relativi alle politiche di fork dell'organizzazione/azienda. |
| Avvio | Assistenza post-avvio basata sul profilo: configurazione upstream, aggiornamenti del file README, scansione delle modifiche, consegna del risultato eseguibile. |
| Sincronizzazione | Chiama l'API GitHub merge-upstream. Segnala onestamente le divergenze. In caso di necessità, passa a una richiesta di pull (PR). |
| Gestione di una serie di fork | Elenca, esegui il controllo dello stato e sincronizza in batch i tuoi fork. |
| Registri | Record leggibile dalla macchina di ogni operazione. Registro di controllo nel SQLite locale. |
| Rinomina | Rinomina poliglota consapevole di AST: file di identità, simboli del codice, superfici testuali, rigenerazione del file di blocco. |

## Modelli di utilizzo

Forkctl è disponibile sia come **server MCP** (trasporto stdio, per Claude Code e altri client MCP) sia come **CLI** con la stessa interfaccia.

### MCP

Aggiungi alla configurazione del tuo client MCP:

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

Tutti i comandi accettano `--json` per l'output leggibile dalla macchina.

<!-- FORKABLE_COUNTS_START -->
## I ventidue strumenti
<!-- FORKABLE_COUNTS_END -->

### Valutazione
- `forkctl_assess`: punteggio di preparazione all'adozione, blocchi, punti di forza
- `forkctl_choose_path`: fork | template | import | clone-detached
- `forkctl_make_forkable`: correggi il repository di origine (predefinito: pianifica; opzionale: PR)

### Esecuzione
- `forkctl_preflight_policy`: rileva i blocchi relativi alle politiche di fork dell'azienda/organizzazione/repository
- `forkctl_create_fork`: asincrono, restituisce operation_id
- `forkctl_create_from_template`: utilizza GitHub `/generate`
- `forkctl_check_operation`: esegui il polling di qualsiasi operazione in corso

### Avvio
- `forkctl_bootstrap`: basato sul profilo (collaboratore / kit di avvio / seed interno / consegna al client / esperimento)
- `forkctl_configure_upstream`: imposta il remote, flusso di lavoro di sincronizzazione opzionale
- `forkctl_scan_drift`: percorsi hardcoded, segreti esposti, riferimenti CI obsoleti nella copia
- `forkctl_emit_handoff`: singolo artefatto veritiero: URL, comandi, avvertenze, azione successiva

### Sincronizzazione
- `forkctl_sync`: API GitHub merge-upstream
- `forkctl_diagnose_divergence`: commit in ritardo, file a rischio, conflitti previsti
- `forkctl_propose_sync_pr`: sincronizzazione basata su PR quando il fast-forward fallisce

### Gestione di una serie di fork
- `forkctl_list_forks`: tuoi + monitorati, con colonna sullo stato
- `forkctl_fleet_health`: obsoleti / in conflitto / abbandonati
- `forkctl_batch_sync`: limitati, consapevoli dei limiti di frequenza

### Registri
- `forkctl_receipt`: record leggibile dalla macchina di qualsiasi operazione
- `forkctl_audit_log`: cronologia in append-only

### Rinomina (Livello 7 — novità in v1.1.0)
- `forkctl_rename_plan`: pianificatore di rinomina consapevole di AST; genera una diff revisionabile
- `forkctl_rename_apply`: crea snapshot + applica identità + simboli + testo + passaggi successivi
- `forkctl_rename_rollback`: ripristina dall'ultimo snapshot

## Profili di avvio

| Profilo | Per | Assistenza post-avvio |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Fork per inviare PR a monte | Remote upstream, flusso di lavoro di sincronizzazione, blocco README per i collaboratori, template PR se assente |
| `starter-kit`       | Generato da un template per avviare il tuo prodotto | Rimuovi i riferimenti al template, crea un nuovo file README, crea un nuovo prompt per la licenza, crea un file .env.example |
| `internal-seed`     | Copia interna del team di un repository seed condiviso | Sostituisci i segnaposto, imposta i CODEOWNER interni, limita la visibilità |
| `client-delivery`   | Fork per singolo client di un elemento distribuibile | Rami con nome del client, controllo della cronologia sanificata, ramo predefinito bloccato |
| `experiment`        | Copia temporanea / distaccata | Disconnetti da upstream, contrassegna come esperimento nel file README, nessun flusso di lavoro di sincronizzazione |

## Configurazione

| Variabile | Obbligatoria | Predefinita | Note |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | sì | —                                            | Ambiti `repo`, `workflow`, `read:org` |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Per GHES / ghe.com |
| `FORKCTL_STATE_DIR` | no       | Directory dello stato utente del sistema operativo (tramite `env-paths`) | Dove si trovano le operazioni SQLite e il database di controllo |

## Sicurezza

Consulta [SECURITY.md](SECURITY.md) per il modello di minaccia e le politiche di segnalazione. Punti chiave:

- `GITHUB_TOKEN` non viene mai registrato.
- Tutti gli input degli strumenti vengono convalidati tramite Zod.
- `make_forkable` utilizza la modalità `plan` per impostazione predefinita. La modalità `pr` è opzionale.
- Forkctl non esegue mai operazioni di forza-push, non elimina i repository e non elimina i rami.
- Nessun telemetria. Nessuna chiamata in uscita tranne l'API GitHub configurata.

## Stato

v2.1.1: i timeout di rinomina ora terminano l'intero albero del processo; aggiornamenti di sicurezza delle dipendenze. Livello 7 (Rinomina) e modalità `--brand` come nella versione 2.1.0. Costruito in base al gate [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Consulta [SHIP_GATE.md](SHIP_GATE.md) per il punteggio del gate.

## Licenza

MIT — consulta [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
