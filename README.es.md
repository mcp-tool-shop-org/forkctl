<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkctl/readme.png" width="500" alt="forkctl">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkctl/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

Plan de control de adopción para repositorios GitHub. No es un simple "fork" — es una capa integral que evalúa la preparación para la adopción, elige la ruta de duplicación adecuada, la ejecuta como una operación asíncrona rastreada, deja el resultado listo para usarse, lo mantiene sincronizado con el tiempo y —nuevo en v1.1.0— lo renombra de forma coherente cuando esté listo para considerarlo suyo.

## Novedades en v1.1.0

Capa 7: **Renombrado poligota con conocimiento del AST**. `forkctl rename plan` genera un "diff" revisable en los archivos de identidad, los símbolos del código (26 idiomas a través de ast-grep) y las superficies textuales que no son código. `forkctl rename apply` crea una instantánea del árbol, ejecuta todas las fases, regenera los archivos de bloqueo y deja un manifiesto de regeneración de activos para cualquier elemento binario. `forkctl rename rollback` restaura la última instantánea. No hay cadenas de `sed`. Corrección de límites de palabras. Con conocimiento de mayúsculas y minúsculas.

## Qué hace forkctl

Crear un "fork" de un repositorio GitHub es un proceso de un solo clic. Adoptarlo (elegir entre "fork" y "plantilla", gestionar la política de la organización, esperar la creación asíncrona, configurar la sincronización con el repositorio original y hacer que el resultado sea realmente utilizable) es todo lo demás.

Forkctl se encarga de todo lo demás.

| Capa | Qué hace |
|--------------|-----------------------------------------------------------------------------------------------|
| Evaluación | Evalúa la preparación de un repositorio para su adopción, recomienda si se debe usar un "fork", una "plantilla" o una "importación", y propone correcciones en el repositorio original. |
| Ejecución | Crea la copia como una operación asíncrona rastreada. Muestra los bloqueos de la política de "fork" de la organización o empresa. |
| Inicialización | Mantenimiento posterior basado en perfiles: configuración de la conexión con el repositorio original, actualizaciones del archivo README, análisis de cambios, entrega de una copia funcional. |
| Sincronización | Llama a la API de fusión con el repositorio original GitHub. Informa de las divergencias de forma honesta. Si es necesario, recurre a una solicitud de incorporación (PR). |
| Gestión de múltiples repositorios | Lista, comprueba el estado y sincroniza por lotes sus "forks". |
| Registros | Registro legible por máquina de cada operación. Registro de auditoría en el SQLite local. |
| Renombrado | Renombrado poligota con conocimiento del AST: archivos de identidad, símbolos del código, superficies textuales, regeneración del archivo de bloqueo. |

## Formas de uso

Forkctl se ofrece tanto como un **servidor MCP** (transporte stdio, para Claude Code y otros clientes MCP) como una **CLI** con la misma interfaz.

### MCP

Añada a la configuración de su cliente MCP:

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

Todos los comandos aceptan `--json` para obtener una salida legible por máquina.

<!-- FORKABLE_COUNTS_START -->
## Las veintidós herramientas
<!-- FORKABLE_COUNTS_END -->

### Evaluación
- `forkctl_assess`: puntuación de preparación para la adopción, bloqueos, fortalezas
- `forkctl_choose_path`: "fork" | "plantilla" | "importación" | "clonado-desconectado"
- `forkctl_make_forkable`: corrige el repositorio original (predeterminado: plan; opcional: solicitud de incorporación)

### Ejecución
- `forkctl_preflight_policy`: detecta los bloqueos de la política de "fork" de la empresa/organización/repositorio
- `forkctl_create_fork`: asíncrono, devuelve el ID de la operación
- `forkctl_create_from_template`: utiliza GitHub `/generate`
- `forkctl_check_operation`: consulta cualquier operación en curso

### Inicialización
- `forkctl_bootstrap`: basado en perfiles (colaborador / kit de inicio / semilla interna / entrega al cliente / experimento)
- `forkctl_configure_upstream`: establece el repositorio remoto, flujo de trabajo de sincronización opcional
- `forkctl_scan_drift`: rutas codificadas, secretos filtrados, referencias de CI obsoletas en la copia
- `forkctl_emit_handoff`: un único artefacto veraz: URL, comandos, advertencias, siguiente acción

### Sincronización
- `forkctl_sync`: API de fusión con el repositorio original GitHub
- `forkctl_diagnose_divergence`: confirmaciones atrasadas, archivos en riesgo, conflictos previstos
- `forkctl_propose_sync_pr`: sincronización basada en solicitudes de incorporación cuando falla la fusión rápida

### Gestión de múltiples repositorios
- `forkctl_list_forks`: los suyos + vigilados, con columna de estado
- `forkctl_fleet_health`: obsoletos / en conflicto / abandonados
- `forkctl_batch_sync`: limitados, con conocimiento de los límites de velocidad

### Registros
- `forkctl_receipt`: registro legible por máquina de cualquier operación
- `forkctl_audit_log`: historial de solo anexión

### Renombrado (Capa 7 — nuevo en v1.1.0)
- `forkctl_rename_plan`: planificador de renombrado con conocimiento del AST; genera un "diff" revisable
- `forkctl_rename_apply`: crea instantáneas y aplica la identidad, los símbolos, el texto y las fases posteriores
- `forkctl_rename_rollback`: restaura desde la última instantánea

## Perfiles de inicialización

| Perfil | Para | Mantenimiento posterior |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Creación de "forks" para enviar solicitudes de incorporación al repositorio original | Repositorio remoto original, flujo de trabajo de sincronización, bloque README para colaboradores, plantilla de solicitud de incorporación si no existe |
| `starter-kit`       | Generado a partir de una plantilla para iniciar su propio producto | Elimina las referencias a la plantilla, crea un archivo README nuevo, solicita un archivo LICENSE nuevo, .env.example |
| `internal-seed`     | Copia interna de un repositorio de código base compartido | Reemplaza los marcadores de posición, establece los CODEOWNERS internos, bloquea la visibilidad |
| `client-delivery`   | "Fork" por cliente de un producto entregable | Ramas con el nombre del cliente, comprobación del historial, rama predeterminada bloqueada |
| `experiment`        | Copia temporal / desconectada | Desconecta el repositorio original, marca como experimento en el archivo README, sin flujo de trabajo de sincronización |

## Configuración

| Variable | Obligatorio | Predeterminado | Notas |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | sí | —                                            | Ámbitos `repo`, `workflow`, `read:org` |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Para GHES / ghe.com |
| `FORKCTL_STATE_DIR` | no       | Directorio de estado del usuario del sistema operativo (a través de `env-paths`) | Dónde se encuentran las operaciones de SQLite y la base de datos de auditoría |

## Seguridad

Consulte [SECURITY.md](SECURITY.md) para conocer el modelo de amenazas y la política de informes. Puntos clave:

- `GITHUB_TOKEN` nunca se registra.
- Todas las entradas de las herramientas se validan mediante Zod.
- `make_forkable` tiene `plan` como valor predeterminado. El modo `pr` es opcional.
- Forkctl nunca fuerza la inserción, elimina repositorios ni elimina ramas.
- No hay telemetría. No hay llamadas salientes, excepto la API GitHub configurada.

## Estado

v2.1.1: los tiempos de espera de renombrado ahora terminan todo el árbol de procesos; actualizaciones de seguridad de las dependencias. Capa 7 (Renombrado) y modo `--brand` como en la versión 2.1.0. Creado para cumplir con la puerta de enlace [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Consulte [SHIP_GATE.md](SHIP_GATE.md) para obtener la puntuación de la puerta de enlace.

## Licencia

MIT: consulte [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
