# Gemelo digital: Node-RED en Render + OpenPLC local

Primera fase del proyecto: Node-RED se publica como un Web Service gratuito en Render y OpenPLC se mantiene en la PC local.

## Arquitectura

```text
OpenPLC local (Modbus TCP :502)
        ^
        | solo localhost/red local
Puente Python local (PyModbus)
        ^  MQTT sobre TLS, conexión saliente
        v
Broker MQTT con autenticación
        ^  MQTT sobre TLS, conexión saliente
        v
Node-RED en Render Free (HMI + API + orquestación)
```

No se intenta que Render abra directamente `192.168.x.x:502`: una PC local normalmente está detrás de NAT y el puerto Modbus no debe quedar expuesto a Internet. El puente local mantiene el acceso a OpenPLC local y solo intercambia mensajes autenticados por MQTT/TLS.

## Qué incluye esta base

- `Dockerfile`, `package.json` y `render.yaml` para desplegar Node-RED en Render.
- Un nodo MQTT/TLS propio que toma usuario, contraseña y URL desde variables de entorno.
- HMI web en `/`.
- Estado del PLC en `GET /api/state`.
- Comandos en `POST /api/command`.
- Health check en `/healthz`.
- `local_bridge.py`, que lee/escribe coils y registros Modbus de OpenPLC y publica JSON retenido en MQTT.
- `.env.example` con las variables iniciales.

## 1. Crear el broker MQTT

Usa un broker que permita MQTT sobre TLS, usuario/contraseña y ACL por tópicos. Para una prueba se puede usar EMQX Cloud Serverless u otro proveedor equivalente. El cliente debe usar una URL `mqtts://...:8883`; no uses `mqtt://...:1883` en Internet.

Crea un usuario MQTT y limita su ACL, idealmente, a:

```text
digital-twin/openplc/#
```

Guarda el host, puerto, usuario y contraseña. No los escribas dentro de `flows.json`, Python ni el repositorio.

## 2. Configurar Render

1. Sube este proyecto a un repositorio Git.
2. En Render selecciona **New → Blueprint** y elige el repositorio.
3. Render detectará `render.yaml` y creará un Web Service con plan `free`.
4. Completa las variables secretas:
   - `MQTT_URL`
   - `MQTT_USERNAME`
   - `MQTT_PASSWORD`
   - `NODE_RED_CREDENTIAL_SECRET`
   - `NODE_RED_ADMIN_PASSWORD_HASH`
   - `API_KEY`
5. Genera el hash de la contraseña del editor antes de publicarlo:

   ```text
   node-red admin hash-pw
   ```

   Copia el hash resultante en `NODE_RED_ADMIN_PASSWORD_HASH`. El editor quedará en `/red`; la HMI queda en `/`.

6. Después del despliegue, comprueba:

   ```text
   https://TU-SERVICIO.onrender.com/healthz
   ```

Render espera que el servicio escuche en la variable `PORT`, y el proyecto ya la usa. El plan Free puede dormir después de un período sin tráfico y su sistema de archivos es efímero; por eso los flujos están dentro de la imagen y el estado se conserva mediante mensajes MQTT retenidos.

## 3. Ejecutar el puente junto a OpenPLC

En la PC donde corre OpenPLC:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edita `.env` con los datos del broker y confirma que `OPENPLC_HOST` y `OPENPLC_PORT` apuntan al servidor Modbus TCP de OpenPLC. Luego ejecuta:

```powershell
python .\local_bridge.py
```

Si OpenPLC usa el puerto 502, Windows puede requerir permisos elevados para iniciar el servidor; el puente es un cliente y normalmente no necesita abrir ningún puerto entrante.

## 4. Formato de mensajes

Estado publicado en `digital-twin/openplc/state`:

```json
{
  "timestamp": "2026-11-05T15:00:00+00:00",
  "connected": true,
  "coils": [false, true],
  "discrete_inputs": [true, false],
  "holding_registers": [0, 123],
  "input_registers": [456]
}
```

Comando publicado en `digital-twin/openplc/command`:

```json
{
  "type": "holding_registers",
  "address": 0,
  "values": [123]
}
```

Para una coil:

```json
{
  "type": "coils",
  "address": 0,
  "values": [true]
}
```

Las direcciones son las direcciones Modbus usadas por la librería, normalmente comenzando en 0. Si tu documentación muestra `40001`, suele corresponder a la dirección `0` en la petición.

## Seguridad y límites de esta fase

- Mantén OpenPLC escuchando en `127.0.0.1` o en la red privada del laboratorio; no abras el puerto 502 al router.
- Usa un broker MQTT con TLS, usuario/contraseña y ACL.
- Configura `API_KEY` para proteger los endpoints de lectura/escritura.
- El plan gratuito de Render sirve para prototipo: puede suspender el servicio por inactividad, reiniciarlo y no ofrece disco persistente. Para una demostración continua habrá que despertar el servicio o pasar a un plan adecuado.
- Esta primera fase no incluye todavía ESP32, sensor virtual, histórico de datos ni agentes ML/LLM. Se dejan como capas siguientes sobre el estado y los comandos MQTT.

## Referencias oficiales

- [Render: Web Services](https://render.com/docs/web-services)
- [Render: Deploy for Free](https://render.com/docs/free)
- [Node-RED: Docker](https://nodered.org/docs/getting-started/docker)
- [PyModbus: Quick Start](https://www.pymodbus.org/docs/quick-start)
- [EMQX Cloud: conexión MQTT sobre TLS](https://docs.emqx.com/en/cloud/latest/deployments/port_guide_serverless.html)

