"""Bridge local: OpenPLC Modbus TCP <-> MQTT over TLS.

The bridge keeps OpenPLC private. It makes an outbound MQTT connection, so the
cloud Node-RED service never needs to reach the local Modbus port directly.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import socket
import ssl
import threading
from datetime import datetime, timezone
from urllib.parse import urlparse

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from pymodbus.client import ModbusTcpClient

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOGGER = logging.getLogger("openplc-bridge")
STOP = threading.Event()
MODBUS_LOCK = threading.Lock()


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError as error:
        raise ValueError(f"{name} debe ser un número entero") from error


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def topics() -> tuple[str, str, str]:
    base = os.getenv("MQTT_BASE_TOPIC", "digital-twin/openplc").strip("/")
    return (
        os.getenv("MQTT_STATE_TOPIC", f"{base}/state"),
        os.getenv("MQTT_COMMAND_TOPIC", f"{base}/command"),
        os.getenv("MQTT_STATUS_TOPIC", f"{base}/status"),
    )


def parse_mqtt_url() -> tuple[str, int, bool]:
    raw = os.getenv("MQTT_URL", "").strip()
    if not raw:
        raise ValueError("Configura MQTT_URL, por ejemplo mqtts://broker.example:8883")

    parsed = urlparse(raw)
    if parsed.scheme not in {"mqtt", "mqtts"} or not parsed.hostname:
        raise ValueError("MQTT_URL debe tener formato mqtt://host:1883 o mqtts://host:8883")

    tls = parsed.scheme == "mqtts"
    port = parsed.port or (8883 if tls else 1883)
    return parsed.hostname, port, tls


def publish_json(client: mqtt.Client, topic: str, payload: dict, *, retain: bool = False) -> None:
    info = client.publish(topic, json.dumps(payload, separators=(",", ":")), qos=1, retain=retain)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        LOGGER.warning("No se pudo publicar en %s: rc=%s", topic, info.rc)


def status_payload(connected: bool, message: str) -> dict:
    return {
        "timestamp": utc_now(),
        "connected": connected,
        "message": message,
        "openplc_host": os.getenv("OPENPLC_HOST", "127.0.0.1"),
        "openplc_port": env_int("OPENPLC_PORT", 502),
    }


def read_snapshot(client: ModbusTcpClient) -> dict:
    unit_id = env_int("MODBUS_UNIT_ID", 1)
    snapshot: dict = {"timestamp": utc_now(), "connected": True}

    coils_count = env_int("MODBUS_COILS_COUNT", 8)
    if coils_count > 0:
        result = client.read_coils(address=env_int("MODBUS_COILS_ADDRESS", 0), count=coils_count, slave=unit_id)
        if result.isError():
            raise RuntimeError(f"read_coils: {result}")
        snapshot["coils"] = list(result.bits[:coils_count])

    inputs_count = env_int("MODBUS_DISCRETE_INPUTS_COUNT", 8)
    if inputs_count > 0:
        result = client.read_discrete_inputs(
            address=env_int("MODBUS_DISCRETE_INPUTS_ADDRESS", 0), count=inputs_count, slave=unit_id
        )
        if result.isError():
            raise RuntimeError(f"read_discrete_inputs: {result}")
        snapshot["discrete_inputs"] = list(result.bits[:inputs_count])

    holding_count = env_int("MODBUS_HOLDING_REGISTERS_COUNT", 10)
    if holding_count > 0:
        result = client.read_holding_registers(
            address=env_int("MODBUS_HOLDING_REGISTERS_ADDRESS", 0), count=holding_count, slave=unit_id
        )
        if result.isError():
            raise RuntimeError(f"read_holding_registers: {result}")
        snapshot["holding_registers"] = list(result.registers)

    input_register_count = env_int("MODBUS_INPUT_REGISTERS_COUNT", 10)
    if input_register_count > 0:
        result = client.read_input_registers(
            address=env_int("MODBUS_INPUT_REGISTERS_ADDRESS", 0), count=input_register_count, slave=unit_id
        )
        if result.isError():
            raise RuntimeError(f"read_input_registers: {result}")
        snapshot["input_registers"] = list(result.registers)

    return snapshot


def write_command(client: ModbusTcpClient, command: dict) -> None:
    if not isinstance(command, dict):
        raise ValueError("El comando debe ser un objeto JSON")

    command_type = command.get("type")
    address = command.get("address")
    values = command.get("values")
    if command_type not in {"coils", "holding_registers"}:
        raise ValueError("type debe ser coils o holding_registers")
    if not isinstance(address, int) or address < 0:
        raise ValueError("address debe ser un entero no negativo")
    if not isinstance(values, list) or not values:
        raise ValueError("values debe ser una lista no vacía")

    unit_id = env_int("MODBUS_UNIT_ID", 1)
    if command_type == "coils":
        bools = [bool(value) for value in values]
        if len(bools) == 1:
            result = client.write_coil(address=address, value=bools[0], slave=unit_id)
        else:
            result = client.write_coils(address=address, values=bools, slave=unit_id)
    else:
        registers = []
        for value in values:
            if not isinstance(value, int) or not 0 <= value <= 65535:
                raise ValueError("Los holding registers deben estar entre 0 y 65535")
            registers.append(value)
        if len(registers) == 1:
            result = client.write_register(address=address, value=registers[0], slave=unit_id)
        else:
            result = client.write_registers(address=address, values=registers, slave=unit_id)

    if result.isError():
        raise RuntimeError(f"{command_type}: {result}")


def main() -> None:
    state_topic, command_topic, status_topic = topics()
    mqtt_host, mqtt_port, mqtt_tls = parse_mqtt_url()
    openplc_host = os.getenv("OPENPLC_HOST", "127.0.0.1")
    openplc_port = env_int("OPENPLC_PORT", 502)
    poll_seconds = max(0.2, float(os.getenv("POLL_INTERVAL_SECONDS", "1")))
    client_id = os.getenv(
        "MQTT_CLIENT_ID",
        f"openplc-bridge-{socket.gethostname()}-{os.getpid()}",
    )

    mqtt_client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
        protocol=mqtt.MQTTv5,
    )
    mqtt_username = os.getenv("MQTT_USERNAME")
    if mqtt_username:
        mqtt_client.username_pw_set(mqtt_username, os.getenv("MQTT_PASSWORD", ""))
    if mqtt_tls:
        mqtt_client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
        mqtt_client.tls_insecure_set(os.getenv("MQTT_TLS_INSECURE", "false").lower() == "true")

    modbus = ModbusTcpClient(openplc_host, port=openplc_port, timeout=env_int("MODBUS_TIMEOUT_SECONDS", 3))

    def on_connect(_client, _userdata, _flags, reason_code, _properties):
        LOGGER.info("MQTT conectado: %s", reason_code)
        mqtt_client.subscribe(command_topic, qos=1)
        publish_json(mqtt_client, status_topic, status_payload(False, "MQTT conectado; conectando a OpenPLC"), retain=True)

    def on_message(_client, _userdata, message):
        try:
            command = json.loads(message.payload.decode("utf-8"))
            with MODBUS_LOCK:
                if not modbus.connected and not modbus.connect():
                    raise ConnectionError("OpenPLC no está disponible")
                write_command(modbus, command)
            LOGGER.info("Comando aplicado: %s", command)
        except Exception as error:  # noqa: BLE001 - bridge must keep running
            LOGGER.error("No se pudo aplicar el comando: %s", error)
            publish_json(mqtt_client, status_topic, status_payload(False, f"error de comando: {error}"), retain=True)

    def on_disconnect(_client, _userdata, _disconnect_flags, reason_code, _properties):
        LOGGER.warning("MQTT desconectado: %s", reason_code)

    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    mqtt_client.on_disconnect = on_disconnect
    mqtt_client.will_set(status_topic, json.dumps(status_payload(False, "puente desconectado")), qos=1, retain=True)
    mqtt_client.connect(mqtt_host, mqtt_port, keepalive=60)
    mqtt_client.loop_start()

    def stop(_signum, _frame):
        STOP.set()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    last_openplc_state = None
    while not STOP.is_set():
        try:
            with MODBUS_LOCK:
                if not modbus.connected and not modbus.connect():
                    raise ConnectionError("OpenPLC no está disponible")
                snapshot = read_snapshot(modbus)
            if snapshot != last_openplc_state:
                publish_json(mqtt_client, state_topic, snapshot, retain=True)
                last_openplc_state = snapshot
            publish_json(mqtt_client, status_topic, status_payload(True, "OpenPLC conectado"), retain=True)
        except Exception as error:  # noqa: BLE001 - bridge must recover from PLC/network failures
            LOGGER.warning("OpenPLC: %s", error)
            modbus.close()
            publish_json(mqtt_client, status_topic, status_payload(False, str(error)), retain=True)
        STOP.wait(poll_seconds)

    LOGGER.info("Deteniendo puente")
    mqtt_client.loop_stop()
    mqtt_client.disconnect()
    modbus.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        LOGGER.error("No se pudo iniciar el puente: %s", error)
        raise SystemExit(1) from error

