<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkable/readme.png" width="500" alt="forkable">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkable/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

Control de adopción para repositorios de GitHub. No es un envoltorio para bifurcaciones, sino una capa integral que evalúa la preparación para la adopción, elige la ruta de duplicación adecuada, la ejecuta como una operación asíncrona supervisada, mantiene el resultado ejecutable, lo mantiene sincronizado con el tiempo y, novedad en la versión 1.1.0, lo renombra de manera coherente cuando esté listo para considerarlo suyo.

## Novedades en la versión 1.1.0

Capa 7: **Renombramiento políglota con conocimiento de la estructura del árbol sintáctico (AST).** El comando `forkable rename plan` genera una diferencia (diff) que se puede revisar, que abarca archivos de identidad, símbolos de código (26 lenguajes a través de ast-grep) y superficies textuales no relacionadas con el código. El comando `forkable rename apply` crea una instantánea del árbol, ejecuta todas las fases, regenera los archivos de bloqueo y deja un manifiesto de regeneración de activos para cualquier elemento binario. El comando `forkable rename rollback` restaura la última instantánea. No utiliza cadenas de comandos `sed`. Corrige los límites de las palabras. Considera las mayúsculas y minúsculas.

## ¿Qué hace Forkable?

Bifurcar un repositorio de GitHub es un solo clic. Adoptarlo, es decir, elegir entre bifurcar o usar una plantilla, gestionar las políticas de la organización, esperar a que se complete la creación asíncrona, configurar la sincronización con el repositorio original y hacer que el resultado sea realmente utilizable, eso es todo lo demás.

Forkable se encarga de "todo lo demás".

| Capa | ¿Qué hace? |
|--------------|-----------------------------------------------------------------------------------------------|
| Evaluación | Evalúa la preparación de un repositorio para la adopción, recomienda bifurcar, usar una plantilla o importar, y sugiere correcciones en el repositorio original. |
| Ejecución | Crea la copia como una operación asíncrona supervisada. Identifica de antemano posibles bloqueos relacionados con las políticas de bifurcación de la organización o la empresa. |
| Configuración inicial | Configuración posterior basada en perfiles: sincronización con el repositorio original, actualizaciones del archivo README, análisis de desviaciones y entrega del resultado listo para usar. |
| Sincronización | Utiliza la API de GitHub para fusionar los cambios con el repositorio original. Informa de forma transparente sobre cualquier divergencia. Si es necesario, recurre a la creación de una solicitud de extracción (PR). |
| Gestión | Lista, verifica el estado y sincroniza por lotes tus bifurcaciones. |
| Registros | Registro legible por máquina de cada operación. Registro de auditoría en SQLite local. |
| Renombrar | Renombramiento políglota con conocimiento de la estructura del árbol sintáctico: archivos de identidad, símbolos de código, superficies textuales, regeneración de archivos de bloqueo. |

## Formas de uso

Forkable se ofrece tanto como un **servidor MCP** (transporte a través de stdio, para clientes MCP como Claude Code) como una **interfaz de línea de comandos (CLI)** con la misma funcionalidad.

### MCP

Añade lo siguiente a la configuración de tu cliente MCP:

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

Todos los comandos aceptan la opción `--json` para obtener una salida legible por máquina.

<!-- FORKABLE_COUNTS_START -->
## Las veintidós herramientas
<!-- FORKABLE_COUNTS_END -->

### Evaluación
- `forkable_assess`: puntuación de preparación para la adopción, bloqueos, fortalezas.
- `forkable_choose_path`: bifurcar | plantilla | importar | clonar (sin seguimiento).
- `forkable_make_forkable`: corrige el repositorio original (por defecto: plan; opcional: PR).

### Ejecución
- `forkable_preflight_policy`: detecta bloqueos relacionados con las políticas de bifurcación de la empresa/organización/repositorio.
- `forkable_create_fork`: crea una bifurcación de forma asíncrona, devuelve un ID de operación.
- `forkable_create_from_template`: utiliza la función `/generate` de GitHub.
- `forkable_check_operation`: verifica el estado de cualquier operación en curso.

### Configuración inicial
- `forkable_bootstrap`: configuración inicial basada en perfiles (contribuidor / kit de inicio / repositorio semilla interno / entrega al cliente / experimento).
- `forkable_configure_upstream`: configura el repositorio remoto y, opcionalmente, el flujo de sincronización.
- `forkable_scan_drift`: busca rutas codificadas, secretos filtrados y referencias obsoletas del sistema de integración continua (CI) en la copia.
- `forkable_emit_handoff`: genera un único artefacto con información precisa: URLs, comandos, advertencias y la siguiente acción a realizar.

### Sincronización
- `forkable_sync`: API de GitHub para fusionar los cambios con el repositorio original.
- `forkable_diagnose_divergence`: muestra los commits pendientes, los archivos en riesgo y los posibles conflictos.
- `forkable_propose_sync_pr`: propone una solicitud de extracción (PR) para la sincronización cuando la fusión rápida falla.

### Gestión
- `forkable_list_forks`: lista tus bifurcaciones y las que estás siguiendo, con una columna de estado.
- `forkable_fleet_health`: verifica el estado de las bifurcaciones (obsoletas, con conflictos o abandonadas).
- `forkable_batch_sync`: sincroniza por lotes, teniendo en cuenta los límites de velocidad.

### Registros
- `forkable_receipt`: registro legible por máquina de cualquier operación.
- `forkable_audit_log`: historial de solo escritura.

### Renombrar (Capa 7: novedad en la versión 1.1.0)
- `forkable_rename_plan`: planificador de renombramiento con conocimiento de la estructura del árbol sintáctico; genera una diferencia que se puede revisar.
- `forkable_rename_apply`: crea instantáneas y aplica cambios a archivos de identidad, símbolos, texto y fases posteriores.
- `forkable_rename_rollback`: restaura a partir de la última instantánea.

## Perfiles de configuración inicial

| Perfil | Para | Configuración posterior |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Bifurcar para enviar solicitudes de extracción al repositorio original | Repositorio remoto, flujo de sincronización, bloque de información para colaboradores en el archivo README, plantilla de solicitud de extracción (si no existe). |
| `starter-kit`       | Generado a partir de una plantilla para iniciar tu propio producto. | Elimina las referencias a la plantilla, crea un nuevo archivo README, muestra una nueva solicitud para el archivo LICENSE y crea un archivo .env.example. |
| `internal-seed`     | Copia interna de un repositorio semilla compartido para un equipo. | Reemplaza los marcadores de posición, configura los propietarios del código internos y restringe la visibilidad. |
| `client-delivery`   | Bifurcación específica para cada cliente de un producto. | Ramas con el nombre del cliente, verificación de historial limpio y rama predeterminada bloqueada. |
| `experiment`        | Copia desechable / sin seguimiento. | Desconectar del repositorio principal, marcar como experimento en el archivo README, sin flujo de trabajo de sincronización. |

## Configuración

| Variable | Requerida | Valor predeterminado | Notas |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | sí | —                                            | `repo`, `workflow`, `read:org` (alcances) |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | Para GHES / ghe.com |
| `FORKABLE_STATE_DIR` | no       | Directorio de estado del usuario del sistema operativo (a través de `env-paths`). | Ubicación de las operaciones de SQLite y la base de datos de auditoría. |

## Seguridad

Consulte [SECURITY.md](SECURITY.md) para obtener información sobre el modelo de amenazas y la política de informes. Puntos clave:

- El token `GITHUB_TOKEN` nunca se registra.
- Cada entrada de herramienta se valida mediante Zod.
- `make_forkable` tiene como valor predeterminado el modo "plan". El modo "pr" es opcional.
- Forkable nunca realiza "push" forzados, elimina repositorios ni elimina ramas.
- No hay telemetría. No hay llamadas salientes excepto las llamadas a la API de GitHub configurada.

## Estado

Versión 1.1.0: añade la Capa 7 (Renombrar). Construido según la puerta [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck).

Consulte [SHIP_GATE.md](SHIP_GATE.md) para obtener la puntuación de la puerta.

## Licencia

MIT — consulte [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
