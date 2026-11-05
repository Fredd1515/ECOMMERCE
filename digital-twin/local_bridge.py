"""OpenPLC Modbus TCP <-> Node-RED HTTPS bridge.

This bridge runs beside OpenPLC, reads/writes its local Modbus TCP server, and
initiates all cloud communication over HTTPS. No inbound port is opened on
the local network.
"""

from __future__ import annotations

import logging
import os
import signal
import threading
from datetime import datetime, timezone

import requests
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


def read_snapshot(client: ModbusTcpClient) -> dict:
    unit_id = env_int("MODBUS_UNIT_ID", 1)
    snapshot: dict = {"timestamp": utc_now(), "connected": True}

    coils_count = env_int("MODBUS_COILS_COUNT", 1)
    if coils_count > 0:
        result = client.read_coils(
            address=env_int("MODBUS_COILS_ADDRESS", 0), count=coils_count, slave=unit_id
        )
        if result.isError():
            raise RuntimeError(f"read_coils: {result}")
        snapshot["coils"] = list(result.bits[:coils_count])

    inputs_count = env_int("MODBUS_DISCRETE_INPUTS_COUNT", 1)
    if inputs_count > 0:
        result = client.read_discrete_inputs(
            address=env_int("MODBUS_DISCRETE_INPUTS_ADDRESS", 0), count=inputs_count, slave=unit_id
        )
        if result.isError():
            raise RuntimeError(f"read_discrete_inputs: {result}")
        snapshot["discrete_inputs"] = list(result.bits[:inputs_count])

    holding_count = env_int("MODBUS_HOLDING_REGISTERS_COUNT", 1)
    if holding_count > 0:
        result = client.read_holding_registers(
            address=env_int("MODBUS_HOLDING_REGISTERS_ADDRESS", 0), count=holding_count, slave=unit_id
        )
        if result.isError():
            raise RuntimeError(f"read_holding_registers: {result}")
        snapshot["holding_registers"] = list(result.registers)

    input_register_count = env_int("MODBUS_INPUT_REGISTERS_COUNT", 1)
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
        if any(not isinstance(value, bool) for value in values):
            raise ValueError("Los valores de coils deben ser true o false")
        if len(values) == 1:
            result = client.write_coil(address=address, value=values[0], slave=unit_id)
        else:
            result = client.write_coils(address=address, values=values, slave=unit_id)
    else:
        if any(not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 65535 for value in values):
            raise ValueError("Los holding registers deben estar entre 0 y 65535")
        if len(values) == 1:
            result = client.write_register(address=address, value=values[0], slave=unit_id)
        else:
            result = client.write_registers(address=address, values=values, slave=unit_id)

    if result.isError():
        raise RuntimeError(f"{command_type}: {result}")


def main() -> None:
    node_red_url = os.getenv("NODE_RED_URL", "").strip().rstrip("/")
    api_key = os.getenv("API_KEY", "").strip()
    if not node_red_url.startswith("https://"):
        raise ValueError("NODE_RED_URL debe ser la dirección HTTPS pública de Node-RED")
    if not api_key:
        raise ValueError("Configura API_KEY con el valor del servicio de Render")

    exchange_url = f"{node_red_url}/api/bridge/exchange"
    openplc_host = os.getenv("OPENPLC_HOST", "127.0.0.1")
    openplc_port = env_int("OPENPLC_PORT", 502)
    poll_seconds = max(0.5, float(os.getenv("POLL_INTERVAL_SECONDS", "1")))
    modbus = ModbusTcpClient(openplc_host, port=openplc_port, timeout=float(os.getenv("MODBUS_TIMEOUT_SECONDS", "3")))
    session = requests.Session()
    session.headers.update({"x-api-key": api_key, "content-type": "application/json"})
    pending_results: dict[str, dict] = {}

    def stop(_signum, _frame):
        STOP.set()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    LOGGER.info("Puente iniciado: OpenPLC %s:%s -> HTTPS %s", openplc_host, openplc_port, node_red_url)
    while not STOP.is_set():
        try:
            try:
                with MODBUS_LOCK:
                    if not modbus.connected and not modbus.connect():
                        raise ConnectionError("OpenPLC no está disponible")
                    snapshot = read_snapshot(modbus)
            except Exception as error:  # noqa: BLE001 - report PLC loss while keeping the bridge alive
                modbus.close()
                snapshot = {
                    "timestamp": utc_now(),
                    "connected": False,
                    "message": str(error),
                }
                LOGGER.warning("OpenPLC: %s", error)

            payload = {"state": snapshot, "commandResults": list(pending_results.values())}
            response = session.post(exchange_url, json=payload, timeout=(5, 10))
            response.raise_for_status()
            exchange = response.json()

            for command_id in exchange.get("acceptedResults", []):
                pending_results.pop(str(command_id), None)

            commands = exchange.get("commands", [])
            if snapshot["connected"]:
                with MODBUS_LOCK:
                    for entry in commands:
                        command_id = str(entry.get("id", ""))
                        if not command_id or command_id in pending_results:
                            continue
                        try:
                            write_command(modbus, entry.get("command"))
                            pending_results[command_id] = {"id": command_id, "success": True}
                            LOGGER.info("Comando aplicado: %s", command_id)
                        except Exception as error:  # noqa: BLE001 - report command failure to Node-RED
                            pending_results[command_id] = {
                                "id": command_id,
                                "success": False,
                                "error": str(error),
                            }
                            LOGGER.error("No se pudo aplicar el comando %s: %s", command_id, error)

        except requests.RequestException as error:
            LOGGER.warning("No se pudo comunicar con Node-RED por HTTPS: %s", error)
        except (ValueError, KeyError) as error:
            LOGGER.warning("Respuesta inválida de Node-RED: %s", error)

        STOP.wait(poll_seconds)

    LOGGER.info("Deteniendo puente")
    session.close()
    modbus.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        LOGGER.error("No se pudo iniciar el puente: %s", error)
        raise SystemExit(1) from error

