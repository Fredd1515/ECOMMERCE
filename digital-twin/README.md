# Gemelo digital: OpenPLC local y Node-RED en Render

## Arquitectura de esta etapa

```text
OpenPLC local <--Modbus TCP--> Puente Python local <--HTTPS saliente--> Node-RED en Render
                                                                         ^
                                                                         |
                                                          Panel del teléfono por HTTPS
```

El puente y OpenPLC se ejecutan en la misma PC. Solo el puente se conecta hacia Node-RED por HTTPS; no se abre el puerto Modbus a Internet. El panel del teléfono usa la página y la API HTTPS de Node-RED. MQTT no participa en esta etapa.

## Preparar la PC donde corre OpenPLC

El programa IEC 61131-3 de prueba está en `openplc/gemelo_digital_demo.st`. Ábrelo desde OpenPLC Editor o copia su contenido a un POU de tipo Structured Text, compílalo y cárgalo en el runtime local. En el mapa del archivo se indican las áreas Modbus que usa el puente. Los menús y el método para cargarlo cambian entre OpenPLC v3 y v4.

Abre PowerShell en esta carpeta y ejecuta:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Si `.env` ya existe, no lo sobrescribas; ejecuta directamente `notepad .env`.

Configura las primeras líneas de `.env`:

```text
NODE_RED_URL=https://digital-twin-node-red-yjfs.onrender.com
API_KEY=PEGA_AQUI_EL_VALOR_DE_API_KEY_DE_RENDER
OPENPLC_HOST=127.0.0.1
OPENPLC_PORT=502
```

En Render, abre el servicio **digital-twin-node-red-yjfs → Environment** y revela/copia el valor de `API_KEY`. Usa ese mismo valor en `.env` y cuando el panel del teléfono lo solicite. No lo publiques ni lo envíes en un chat.

Mantén el runtime de OpenPLC iniciado y confirma que el servidor Modbus TCP esté habilitado en el puerto `502`. Ajusta las direcciones y cantidades `MODBUS_*` del `.env` si tu programa usa otro mapa de memoria.

## Iniciar y comprobar el puente

Con OpenPLC en ejecución y el entorno virtual activo, inicia:

```powershell
python .\local_bridge.py
```

La consola debe indicar que el puente inició. Si aparece un error de conexión Modbus, revisa el estado del runtime, el puerto y el mapa de registros. El puente vuelve a intentar conectarse mientras siga abierto.

Abre el editor de Node-RED en:

```text
https://digital-twin-node-red-yjfs.onrender.com/red
```

Y el panel web, también desde el teléfono, en:

```text
https://digital-twin-node-red-yjfs.onrender.com/
```

En el panel, introduce la `API_KEY` de Render. El panel consulta el estado por HTTPS y envía comandos a la cola de Node-RED; el puente local recoge los comandos por HTTPS y los escribe en OpenPLC por Modbus TCP.

## Endpoints del puente

- `POST /api/bridge/exchange`: el puente publica el estado actual y recoge comandos pendientes/resultados.
- `GET /api/state`: el panel lee el último estado del PLC.
- `POST /api/command`: el panel pone un comando en cola.
- `GET /healthz`: comprobación de salud de Render.

Todas las rutas `/api/` requieren el encabezado `x-api-key`, que el puente lee desde `.env` y el panel solicita al abrirse.

## Límites de Render Free

Render suspende un servicio Free tras 15 minutos sin tráfico entrante. Mientras el puente está ejecutándose, sus solicitudes HTTPS periódicas llegan a Node-RED; si se apaga la PC o el puente, Node-RED puede dormir. Render también puede reiniciar el servicio y su memoria de ejecución no es persistente: al volver, el puente enviará de nuevo el estado actual. La cola de comandos pendientes se pierde si el servicio reinicia.

## Después

Más adelante se puede incorporar MQTT para el ESP32 como una conexión adicional. No hace falta para enlazar OpenPLC local con Node-RED en esta etapa.

