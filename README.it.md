<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkable/readme.png" width="500" alt="forkable">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkable/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

> Piano di controllo per l'adozione di repository GitHub. Non è un semplice wrapper per il fork, ma un livello completo che valuta la prontezza all'adozione, sceglie il percorso di duplicazione più appropriato, lo esegue come operazione asincrona monitorata, rende il risultato eseguibile e lo mantiene sincronizzato nel tempo.

## Cosa fa Forkable

Fare il fork di un repository GitHub richiede un solo clic. Adottarlo, invece, scegliendo tra fork e template, gestendo le politiche dell'organizzazione, aspettando la creazione asincrona, configurando la sincronizzazione con il repository originale e rendendo il risultato effettivamente eseguibile, richiede tutto il resto.

Forkable si occupa di "tutto il resto".

| Livello | Cosa fa |
|--------------|-----------------------------------------------------------------------------------------------|
| Valutazione | Calcola il livello di prontezza all'adozione di un repository, raccomanda l'uso di un fork, di un template o dell'importazione, e suggerisce correzioni da apportare al repository originale. |
| Esecuzione | Crea una copia come operazione asincrona monitorata. Evidenzia eventuali blocchi relativi alle politiche di fork dell'organizzazione o dell'azienda. |
| Configurazione iniziale | Configurazione post-creazione guidata da profili: configurazione della sincronizzazione con il repository originale, aggiornamenti del file README, scansione delle modifiche, preparazione per l'utilizzo. |
| Sincronizzazione | Utilizza l'API di GitHub per la sincronizzazione con il repository originale. Segnala onestamente eventuali divergenze. In caso di necessità, ricorre alla creazione di una pull request. |
| Gestione | Elenca, verifica lo stato e sincronizza in batch i tuoi fork. |
| Registrazioni | Record leggibile dalle macchine di ogni operazione. Registro delle attività in formato SQLite locale. |

## Modalità di utilizzo

Forkable è disponibile sia come **server MCP** (trasporto tramite standard input/output, per Claude Code e altri client MCP) sia come **interfaccia a riga di comando (CLI)** con la stessa funzionalità.

### MCP

Aggiungi quanto segue alla configurazione del tuo client MCP:

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
npx @mcptoolshop/forkable create-fork owner/repo --destination my-org
npx @mcptoolshop/forkable sync my-fork
npx @mcptoolshop/forkable fleet-health
```

Tutti i comandi accettano l'opzione `--json` per l'output leggibile dalle macchine.

## I diciannove strumenti

### Valutazione
- `forkable_assess` — punteggio di prontezza all'adozione, blocchi, punti di forza
- `forkable_choose_path` — fork | template | import | clone-detached
- `forkable_make_forkable` — corregge il repository originale (impostazione predefinita: pianificazione; opzionale: pull request)

### Esecuzione
- `forkable_preflight_policy` — rileva eventuali blocchi relativi alle politiche di fork dell'organizzazione, del repository o dell'azienda
- `forkable_create_fork` — crea un fork in modo asincrono, restituisce l'ID dell'operazione
- `forkable_create_from_template` — utilizza l'API GitHub `/generate`
- `forkable_check_operation` — verifica lo stato di qualsiasi operazione in corso

### Configurazione iniziale
- `forkable_bootstrap` — configurazione guidata da profili (contributore / kit di avvio / seed interno / consegna al cliente / esperimento)
- `forkable_configure_upstream` — imposta il repository remoto, configura il flusso di lavoro di sincronizzazione opzionale
- `forkable_scan_drift` — verifica la presenza di percorsi hardcoded, segreti esposti o riferimenti obsoleti al sistema di integrazione continua nella copia
- `forkable_emit_handoff` — fornisce un singolo artefatto completo: URL, comandi, avvertenze, prossima azione

### Sincronizzazione
- `forkable_sync` — API di GitHub per la sincronizzazione con il repository originale
- `forkable_diagnose_divergence` — verifica la presenza di commit non sincronizzati, file a rischio, potenziali conflitti
- `forkable_propose_sync_pr` — crea una pull request per la sincronizzazione in caso di fallimento della sincronizzazione diretta

### Gestione
- `forkable_list_forks` — elenca i tuoi fork e quelli monitorati, con colonna relativa allo stato
- `forkable_fleet_health` — verifica lo stato di fork obsoleti, con conflitti o abbandonati
- `forkable_batch_sync` — sincronizzazione in batch, con limiti di velocità

### Registrazioni
- `forkable_receipt` — record leggibile dalle macchine di qualsiasi operazione
- `forkable_audit_log` — registro storico delle attività

## Profili di configurazione iniziale

| Profilo | Per | Configurazione post-creazione |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Creazione di un fork per inviare pull request al repository originale | Repository remoto, flusso di lavoro di sincronizzazione, blocco nel file README per i contributori, template per le pull request (se non presente) |
| `starter-kit`       | Creazione di un fork da un template per avviare il tuo prodotto | Rimozione dei riferimenti al template, creazione di un nuovo file README, richiesta di inserimento della licenza, file `.env.example` |
| `internal-seed`     | Copia interna di un repository di riferimento condiviso | Sostituzione dei segnaposto, impostazione dei proprietari del codice interni, limitazione della visibilità |
| `client-delivery`   | Fork specifico per un cliente | Creazione di rami con il nome del cliente, verifica della cronologia per rimuovere informazioni sensibili, impostazione del ramo predefinito |
| `experiment`        | Copia temporanea / disconnessa | Disconnettere il ramo principale, contrassegnare come esperimento nel file README, nessuna operazione di sincronizzazione. |

## Configurazione

| Variabile | Obbligatoria | Valore predefinito | Note |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | sì | —                                            | Permessi `repo`, `workflow`, `read:org` |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Per GHES / ghe.com |
| `FORKABLE_STATE_DIR` | no       | Directory per lo stato dell'utente del sistema operativo (tramite `env-paths`) | Dove risiedono le operazioni SQLite e il database di audit. |

## Sicurezza

Consultare il file [SECURITY.md](SECURITY.md) per il modello di minacce e le politiche di segnalazione. Punti chiave:

- Il token `GITHUB_TOKEN` non viene mai registrato.
- Ogni input di strumento viene validato tramite Zod.
- `make_forkable` ha come predefinito la modalità `plan`. La modalità `pr` è attivabile.
- `Forkable` non effettua mai push forzati, non elimina repository né rami.
- Nessuna telemetria. Nessuna chiamata in uscita, ad eccezione dell'API GitHub configurata.

## Stato

v1.0.0 — versione iniziale. Costruito secondo i criteri di [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Consultare il file [SHIP_GATE.md](SHIP_GATE.md) per la valutazione dei criteri di rilascio.

## Licenza

MIT — vedere [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
