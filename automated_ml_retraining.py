"""Sincroniza datos vivos de Supabase y reentrena ML solo cuando hay cambios.

Este proceso está pensado para ejecutarse desde el Programador de tareas de
Windows. Requiere SUPABASE_SERVICE_ROLE_KEY únicamente en .env.local o en el
entorno del proceso; nunca debe llevar el prefijo VITE_ ni llegar al navegador.
"""

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pandas as pd


ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / "ml_models" / ".automation_state.json"
TABLES = {
    "fact_sales": ROOT / "fact_sales.csv",
    "dim_products": ROOT / "dim_products.csv",
    "dim_customers": ROOT / "dim_customers.csv",
}
PAGE_SIZE = 1000


def load_local_env():
    """Carga las variables sencillas de .env.local sin exponerlas en logs."""
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(name, value)


def get_config():
    load_local_env()
    base_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    )
    service_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SECRET_KEY")
    )
    if not base_url or not service_key:
        raise RuntimeError(
            "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. "
            "Es necesaria para que el proceso programado lea las tablas protegidas."
        )
    return base_url.rstrip("/"), service_key


def fetch_table(base_url, service_key, table_name):
    """Lee una tabla REST completa respetando el límite de 1.000 filas."""
    rows = []
    offset = 0
    while True:
        request = Request(
            f"{base_url}/rest/v1/{table_name}?select=*",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Range": f"{offset}-{offset + PAGE_SIZE - 1}",
                "Prefer": "count=exact",
            },
            method="GET",
        )
        try:
            with urlopen(request, timeout=30) as response:
                page = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError) as error:
            detail = getattr(error, "reason", str(error))
            raise RuntimeError(f"No se pudo leer {table_name} desde Supabase: {detail}") from error

        if not isinstance(page, list):
            raise RuntimeError(f"Supabase devolvió un formato inesperado para {table_name}.")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def build_snapshot(tables):
    payload = {
        table_name: rows
        for table_name, rows in tables.items()
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    return {
        "source_hash": hashlib.sha256(encoded).hexdigest(),
        "rows": {table_name: len(rows) for table_name, rows in tables.items()},
    }


def read_previous_state():
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def write_csv_atomically(path, rows):
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    pd.DataFrame(rows).to_csv(temporary_path, index=False)
    os.replace(temporary_path, path)


def persist_ml_insights(base_url, service_key, snapshot):
    """Guarda la última ejecución en Supabase; no depende de archivos locales."""
    insights_path = ROOT / "ml_models" / "ml_insights.json"
    if not insights_path.exists():
        raise RuntimeError("El pipeline no generó ml_models/ml_insights.json.")

    insights = json.loads(insights_path.read_text(encoding="utf-8"))
    body = {
        "id": "latest",
        "source_hash": snapshot["source_hash"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "payload": insights,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    request = Request(
        f"{base_url}/rest/v1/ml_insights?on_conflict=id",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError(f"Supabase devolvió HTTP {response.status} al guardar ML.")
    except (HTTPError, URLError) as error:
        detail = getattr(error, "reason", str(error))
        raise RuntimeError(f"No se pudieron guardar los resultados ML en Supabase: {detail}") from error
    print("[ML AUTO] Resultados ML guardados en Supabase (ml_insights/latest).")


def sync_live_data():
    base_url, service_key = get_config()
    tables = {
        table_name: fetch_table(base_url, service_key, table_name)
        for table_name in TABLES
    }
    snapshot = build_snapshot(tables)
    previous_state = read_previous_state()

    artifacts_ready = all(
        (ROOT / "ml_models" / artifact).exists()
        for artifact in ("forecast_model.pkl", "kmeans_rfm.pkl", "ml_insights.json")
    )
    if artifacts_ready and previous_state.get("source_hash") == snapshot["source_hash"]:
        print(f"[ML AUTO] Sin cambios. Filas: {snapshot['rows']}")
        return False

    for table_name, output_path in TABLES.items():
        write_csv_atomically(output_path, tables[table_name])
    print(f"[ML AUTO] Datos sincronizados desde Supabase. Filas: {snapshot['rows']}")
    return snapshot


def main():
    try:
        base_url, service_key = get_config()
        snapshot = sync_live_data()
        if not snapshot:
            return 0

        # El pipeline usa los CSV recién sincronizados y genera los artefactos
        # consumidos por el endpoint protegido del dashboard.
        from train_ml_pipeline import main as train_pipeline

        train_pipeline()
        persist_ml_insights(base_url, service_key, snapshot)
        STATE_PATH.write_text(
            json.dumps(
                {
                    **snapshot,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print("[ML AUTO] Reentrenamiento completado y artefactos actualizados.")
        return 0
    except Exception as error:
        print(f"[ML AUTO] ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
