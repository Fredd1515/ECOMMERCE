"""
=============================================================================
PIPELINE DE MACHINE LEARNING PARA E-COMMERCE FARMACÉUTICO
=============================================================================
Este script ejecuta:
  1. Modelo 1: Pronóstico de Demanda y Ventas Futuras
     - Compara Random Forest, Gradient Boosting, Extra Trees,
       HistGradientBoosting y Ridge Regression.
     - Proyecta demanda e ingresos por producto a 7, 15 y 30 días.
     - Selecciona el mejor por MAE/RMSE y evalúa con MAE, RMSE y R².
  2. Modelo 2: Segmentación y Detección de Fuga de Clientes (RFM con K-Means)
     - Clasifica a los clientes en VIP, Leales, Ocasionales y En Riesgo.
  3. Exportación de Artefactos:
     - Modelos entrenados (.pkl)
     - Resumen ejecutivo estructurado en JSON (ml_insights.json) para el Chatbot.
=============================================================================
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sklearn.ensemble import (
    ExtraTreesRegressor,
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
    RandomForestRegressor,
)
from sklearn.cluster import KMeans
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Asegurar carpeta de salida para modelos y métricas
MODELS_DIR = "ml_models"
os.makedirs(MODELS_DIR, exist_ok=True)


def regression_metrics(y_true, y_pred):
    """Calcula métricas comparables para el modelo y la línea base."""
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
        "r2": round(float(r2_score(y_true, y_pred)), 3),
    }


def explain_feature_name(feature_name):
    """Convierte nombres técnicos del modelo en etiquetas comprensibles."""
    labels = {
        "product_key": "Producto",
        "day_of_week": "Día de la semana",
        "day_of_month": "Día del mes",
        "month": "Mes",
        "is_weekend": "Fin de semana",
        "lag_1": "Ventas del día anterior",
        "lag_7": "Ventas de hace 7 días",
        "rolling_mean_7": "Promedio móvil de 7 días",
        "prescription_required": "Requiere receta",
    }
    if feature_name in labels:
        return labels[feature_name]
    if feature_name.startswith("category_name_"):
        return f"Categoría: {feature_name.removeprefix('category_name_')}"
    return feature_name.replace("_", " ").capitalize()

def load_data():
    """Carga y valida los datasets CSV generados previamente."""
    print("\n[1/5] Cargando datasets...")
    sales_df = pd.read_csv("fact_sales.csv")
    products_df = pd.read_csv("dim_products.csv")
    customers_df = pd.read_csv("dim_customers.csv")
    
    # Conversión de tipos
    sales_df["order_date"] = pd.to_datetime(sales_df["order_date"])
    sales_df["delivery_date"] = pd.to_datetime(sales_df["delivery_date"])
    for col in ["quantity_sold", "unit_price", "final_price", "profit_amount", "unit_cost"]:
        sales_df[col] = pd.to_numeric(sales_df[col], errors="coerce")
        
    print(f" -> {len(sales_df)} ventas cargadas.")
    print(f" -> {len(products_df)} productos en catálogo.")
    print(f" -> {len(customers_df)} clientes registrados.")
    return sales_df, products_df, customers_df

# ---------------------------------------------------------------------------
# MODELO 1: FORECASTING DE DEMANDA Y VENTAS
# ---------------------------------------------------------------------------
def train_demand_forecast(sales_df, products_df):
    """Entrena y compara cinco algoritmos para predecir demanda diaria por producto."""
    print("\n[2/5] Procesando ingeniería de características (Feature Engineering)...")
    
    # Agrupar ventas diarias por producto
    sales_df["date"] = sales_df["order_date"].dt.date
    daily_sales = sales_df.groupby(["date", "product_key"]).agg(
        units_sold=("quantity_sold", "sum"),
        revenue=("final_price", "sum")
    ).reset_index()
    daily_sales["date"] = pd.to_datetime(daily_sales["date"])
    
    # Completar cuadrícula completa de fechas x productos para capturar días con 0 ventas
    all_dates = pd.date_range(daily_sales["date"].min(), daily_sales["date"].max(), freq="D")
    all_products = products_df["product_key"].unique()
    grid = pd.MultiIndex.from_product([all_dates, all_products], names=["date", "product_key"]).to_frame().reset_index(drop=True)
    
    full_df = pd.merge(grid, daily_sales, on=["date", "product_key"], how="left")
    full_df["units_sold"] = full_df["units_sold"].fillna(0)
    full_df["revenue"] = full_df["revenue"].fillna(0)
    
    # Ordenar cronológicamente
    full_df = full_df.sort_values(by=["product_key", "date"]).reset_index(drop=True)
    
    # Features temporales
    full_df["day_of_week"] = full_df["date"].dt.dayofweek
    full_df["day_of_month"] = full_df["date"].dt.day
    full_df["month"] = full_df["date"].dt.month
    full_df["is_weekend"] = full_df["day_of_week"].isin([5, 6]).astype(int)
    
    # Lags y medias móviles por producto
    full_df["lag_1"] = full_df.groupby("product_key")["units_sold"].shift(1).fillna(0)
    full_df["lag_7"] = full_df.groupby("product_key")["units_sold"].shift(7).fillna(0)
    # La media móvil debe calcularse dentro de cada producto. La versión
    # global mezcla los últimos registros de un producto con el siguiente.
    full_df["rolling_mean_7"] = (
        full_df.groupby("product_key")["units_sold"]
        .transform(lambda series: series.shift(1).rolling(window=7, min_periods=1).mean())
        .fillna(0)
    )
    
    # Enlazar atributos del producto
    full_df = full_df.merge(products_df[["product_key", "category_name", "prescription_required"]], on="product_key", how="left")
    full_df = pd.get_dummies(full_df, columns=["category_name"], drop_first=True)
    
    feature_cols = [c for c in full_df.columns if c not in ["date", "units_sold", "revenue"]]
    
    # División temporal Train (80%) y Test (20%)
    unique_dates = np.sort(full_df["date"].unique())
    split_index = max(1, min(len(unique_dates) - 1, int(len(unique_dates) * 0.80)))
    split_date = unique_dates[split_index]
    train = full_df[full_df["date"] <= split_date]
    test = full_df[full_df["date"] > split_date]
    
    X_train, y_train = train[feature_cols], train["units_sold"]
    X_test, y_test = test[feature_cols], test["units_sold"]
    
    print("\n[3/5] Entrenando y comparando 5 algoritmos de pronóstico...")
    algorithm_specs = [
        {
            "key": "random_forest",
            "name": "Random Forest",
            "family": "Ensemble de árboles",
            "reason": "Captura relaciones no lineales y efectos combinados entre producto, calendario y lags; además ofrece importancia de variables.",
            "model": RandomForestRegressor(n_estimators=120, max_depth=10, random_state=42, n_jobs=-1),
        },
        {
            "key": "gradient_boosting",
            "name": "Gradient Boosting",
            "family": "Boosting secuencial",
            "reason": "Corrige los errores de modelos anteriores y suele detectar cambios sutiles de demanda con buen nivel de precisión.",
            "model": GradientBoostingRegressor(n_estimators=120, max_depth=3, learning_rate=0.05, random_state=42),
        },
        {
            "key": "extra_trees",
            "name": "Extra Trees",
            "family": "Ensemble aleatorio",
            "reason": "Aporta una segunda perspectiva basada en árboles muy aleatorizados, reduce varianza y es resistente a valores atípicos.",
            "model": ExtraTreesRegressor(n_estimators=120, max_depth=12, random_state=42, n_jobs=-1),
        },
        {
            "key": "hist_gradient_boosting",
            "name": "HistGradientBoosting",
            "family": "Boosting por histogramas",
            "reason": "Modela patrones no lineales de forma eficiente y es una alternativa escalable para crecer con más ventas históricas.",
            "model": HistGradientBoostingRegressor(max_iter=120, max_leaf_nodes=15, learning_rate=0.05, random_state=42),
        },
        {
            "key": "ridge",
            "name": "Ridge Regression",
            "family": "Regresión lineal regularizada",
            "reason": "Funciona como referencia interpretable y estable; la regularización controla la multicolinealidad de lags y variables calendario.",
            "model": Pipeline([
                ("scaler", StandardScaler()),
                ("ridge", Ridge(alpha=1.0)),
            ]),
        },
    ]

    trained_models = {}
    algorithm_comparison = []
    for spec in algorithm_specs:
        model_candidate = spec["model"]
        model_candidate.fit(X_train, y_train)
        y_pred_candidate = model_candidate.predict(X_test)
        metrics_candidate = regression_metrics(y_test, y_pred_candidate)
        trained_models[spec["key"]] = model_candidate
        algorithm_comparison.append({
            "key": spec["key"],
            "name": spec["name"],
            "family": spec["family"],
            "reason": spec["reason"],
            **metrics_candidate,
        })
        print(
            f"    • {spec['name']}: MAE={metrics_candidate['mae']:.3f}, "
            f"RMSE={metrics_candidate['rmse']:.3f}, R²={metrics_candidate['r2']:.3f}"
        )

    # El criterio prioriza el error absoluto (más fácil de interpretar en
    # unidades vendidas) y usa RMSE como desempate.
    selected_result = min(algorithm_comparison, key=lambda item: (item["mae"], item["rmse"]))
    selected_key = selected_result["key"]
    model = trained_models[selected_key]
    for result in algorithm_comparison:
        result["selected"] = result["key"] == selected_key

    # Explicabilidad global del modelo seleccionado. En árboles son
    # importancias; en Ridge son coeficientes absolutos normalizados.
    if hasattr(model, "feature_importances_"):
        raw_importance = model.feature_importances_
        explainability_method = f"Importancia global de variables de {selected_result['name']}"
    elif hasattr(model, "named_steps") and hasattr(model.named_steps.get("ridge"), "coef_"):
        raw_importance = np.abs(model.named_steps["ridge"].coef_)
        total_importance = float(np.sum(raw_importance)) or 1.0
        raw_importance = raw_importance / total_importance
        explainability_method = "Coeficientes absolutos normalizados de Ridge Regression"
    else:
        raw_importance = np.zeros(len(feature_cols))
        explainability_method = f"Importancia no disponible para {selected_result['name']}"

    feature_importance = sorted(
        zip(feature_cols, raw_importance),
        key=lambda item: item[1],
        reverse=True,
    )
    explainability = {
        "method": explainability_method,
        "warning": "La importancia o el peso muestra asociación predictiva, no causalidad.",
        "variables_principales": [
            {
                "feature": feature,
                "label": explain_feature_name(feature),
                "importance": round(float(importance), 4),
                "importance_pct": round(float(importance) * 100, 2),
            }
            for feature, importance in feature_importance[:8]
        ],
    }
    
    # Evaluación
    metrics = {
        "mae": selected_result["mae"],
        "rmse": selected_result["rmse"],
        "r2": selected_result["r2"],
        "algorithm": selected_result["name"],
    }
    # Comparar contra una línea base estacional (demanda de hace 7 días).
    # Sin esta comparación, un R² aislado no indica si el modelo aporta valor.
    baseline_pred = test["lag_7"].to_numpy()
    baseline_metrics = regression_metrics(y_test, baseline_pred)
    
    print(f" -> Evaluación del Modelo:")
    print(f"    • MAE (Error Absoluto Medio):   {metrics['mae']:.3f} unidades")
    print(f"    • RMSE (Raíz Error Cuadrático): {metrics['rmse']:.3f} unidades")
    print(f"    • R² Score (Precisión Global):  {metrics['r2']:.3f}")
    print(f"    • Algoritmo seleccionado:        {selected_result['name']}")
    print(f"    • MAE línea base (lag-7):       {baseline_metrics['mae']:.3f} unidades")
    
    # Guardar modelo
    joblib.dump({"model": model, "feature_cols": feature_cols}, os.path.join(MODELS_DIR, "forecast_model.pkl"))
    
    # Generar proyección futura para los próximos 30 días
    last_date = full_df["date"].max()
    future_dates = [last_date + timedelta(days=d) for d in range(1, 31)]
    future_predictions = {}
    
    # Predecir demanda acumulada por producto a 7, 15 y 30 días
    for _, prod in products_df.iterrows():
        p_key = prod["product_key"]
        p_name = prod["name"]
        
        # Historial observado usado para actualizar los lags con cada
        # predicción futura (forecast recursivo).
        product_history = full_df.loc[
            full_df["product_key"] == p_key, "units_sold"
        ].astype(float).tolist()
        prod_data = full_df[full_df["product_key"] == p_key].iloc[-1]
        
        # Simular los 30 días
        preds = []
        for f_date in future_dates:
            row_dict = {
                "product_key": p_key,
                "day_of_week": f_date.dayofweek,
                "day_of_month": f_date.day,
                "month": f_date.month,
                "is_weekend": 1 if f_date.dayofweek in [5, 6] else 0,
                "lag_1": product_history[-1] if product_history else 0,
                "lag_7": product_history[-7] if len(product_history) >= 7 else 0,
                "rolling_mean_7": float(np.mean(product_history[-7:])) if product_history else 0,
                "prescription_required": prod["prescription_required"]
            }
            # Completar dummies
            for col in feature_cols:
                if col not in row_dict:
                    row_dict[col] = prod_data[col] if col in prod_data.index else 0
            
            x_row = pd.DataFrame([row_dict])[feature_cols]
            pred_val = max(0, float(model.predict(x_row)[0]))
            preds.append(pred_val)
            product_history.append(pred_val)
            
        units_7 = round(sum(preds[:7]), 1)
        units_15 = round(sum(preds[:15]), 1)
        units_30 = round(sum(preds[:30]), 1)
        
        product_prices = sales_df.loc[sales_df["product_key"] == p_key, "unit_price"]
        unit_price = float(product_prices.median()) if not product_prices.empty else 0.0
        rev_30 = round(units_30 * unit_price, 2)
        
        future_predictions[p_name] = {
            "product_key": int(p_key),
            "category": prod["category_name"],
            "unit_price": unit_price,
            "projected_units_7d": units_7,
            "projected_units_15d": units_15,
            "projected_units_30d": units_30,
            "projected_revenue_30d": rev_30
        }
        
    return {
        "metrics": {
            **metrics,
            "baseline_lag_7": baseline_metrics,
            "validation": "holdout temporal 80/20",
        },
        "algorithm_comparison": algorithm_comparison,
        "selected_algorithm": selected_result["name"],
        "explainability": explainability,
        "forecast_by_product": future_predictions
    }

# ---------------------------------------------------------------------------
# MODELO 2: SEGMENTACIÓN DE CLIENTES (RFM + K-MEANS)
# ---------------------------------------------------------------------------
def train_customer_rfm(sales_df, customers_df):
    """Calcula el modelo RFM y segmenta a los clientes mediante K-Means."""
    print("\n[4/5] Entrenando Segmentación de Clientes y Riesgo de Fuga (RFM + K-Means)...")
    
    now = sales_df["order_date"].max()
    
    # Calcular métricas RFM
    rfm = sales_df.groupby("customer_key").agg(
        recency=("order_date", lambda x: (now - x.max()).days),
        frequency=("order_id", "nunique"),
        monetary=("final_price", "sum")
    ).reset_index()
    
    # Normalización para K-Means
    scaler = StandardScaler()
    rfm_scaled = scaler.fit_transform(rfm[["recency", "frequency", "monetary"]])
    
    kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
    rfm["cluster"] = kmeans.fit_predict(rfm_scaled)
    
    # Identificar nombres de los clusters analizando los promedios
    cluster_means = rfm.groupby("cluster")[["recency", "frequency", "monetary"]].mean()
    
    cluster_labels = {}
    for c_id, row in cluster_means.iterrows():
        if row["monetary"] >= cluster_means["monetary"].quantile(0.70) and row["recency"] <= cluster_means["recency"].median():
            cluster_labels[c_id] = "Cliente VIP / Champion"
        elif row["frequency"] >= cluster_means["frequency"].median() and row["recency"] <= cluster_means["recency"].median():
            cluster_labels[c_id] = "Cliente Leal / Frecuente"
        elif row["recency"] > cluster_means["recency"].quantile(0.60):
            cluster_labels[c_id] = "En Riesgo de Abandono (Churn)"
        else:
            cluster_labels[c_id] = "Cliente Ocasional / Reciente"
            
    rfm["segment"] = rfm["cluster"].map(cluster_labels)
    
    # Cruzar con datos de dim_customers
    rfm_full = rfm.merge(customers_df[["customer_key", "full_name", "email", "phone", "city"]], on="customer_key", how="left")
    
    # Guardar modelo
    joblib.dump({"kmeans": kmeans, "scaler": scaler, "cluster_labels": cluster_labels}, os.path.join(MODELS_DIR, "kmeans_rfm.pkl"))
    
    # Conteo por segmento
    segment_summary = rfm_full["segment"].value_counts().to_dict()
    
    churn_risk_list = rfm_full[rfm_full["segment"] == "En Riesgo de Abandono (Churn)"][
        ["customer_key", "full_name", "email", "city", "recency", "frequency", "monetary"]
    ].to_dict(orient="records")
    
    vip_list = rfm_full[rfm_full["segment"] == "Cliente VIP / Champion"][
        ["customer_key", "full_name", "email", "city", "frequency", "monetary"]
    ].to_dict(orient="records")
    
    print(f" -> Segmentación completada:")
    for seg, count in segment_summary.items():
        print(f"    • {seg}: {count} clientes")
        
    return {
        "segment_counts": segment_summary,
        "churn_risk_customers": churn_risk_list,
        "vip_customers": vip_list
    }

# ---------------------------------------------------------------------------
# EXPORTACIÓN ESTRUCTURADA PARA EL CHATBOT MULTIAGENTE
# ---------------------------------------------------------------------------
def export_chatbot_insights(sales_df, forecast_results, rfm_results):
    """Guarda un reporte estructurado en JSON con las respuestas analíticas para el Chatbot."""
    print("\n[5/5] Consolidando insights para el Chatbot Multiagente...")
    
    total_revenue = float(sales_df["final_price"].sum())
    total_orders = int(sales_df["order_id"].nunique())
    avg_ticket = round(total_revenue / total_orders, 2)
    top_selling = sales_df.groupby("product_key")["quantity_sold"].sum().sort_values(ascending=False).head(3).to_dict()
    
    insights = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "kpis_generales": {
            "total_ventas_historicas": len(sales_df),
            "ingresos_totales_soles": round(total_revenue, 2),
            "ticket_promedio_soles": avg_ticket,
            "periodo_analizado": f"{sales_df['order_date'].min().strftime('%Y-%m-%d')} a {sales_df['order_date'].max().strftime('%Y-%m-%d')}"
        },
        "metricas_modelo_ml": forecast_results["metrics"],
        "algoritmo_seleccionado": forecast_results["selected_algorithm"],
        "algoritmos_comparacion": forecast_results["algorithm_comparison"],
        "explicabilidad_modelo": forecast_results["explainability"],
        "pronostico_demanda_30_dias": forecast_results["forecast_by_product"],
        "segmentacion_clientes": {
            "resumen": rfm_results["segment_counts"],
            "clientes_en_riesgo_abandono": rfm_results["churn_risk_customers"],
            "clientes_vip": rfm_results["vip_customers"]
        }
    }
    
    output_path = os.path.join(MODELS_DIR, "ml_insights.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(insights, f, ensure_ascii=False, indent=2)

    # La copia para React es pública: conserva KPIs, pronósticos y conteos,
    # pero nunca nombres, correos, teléfonos ni identificadores de clientes.
    public_insights = {
        "generated_at": insights["generated_at"],
        "kpis_generales": insights["kpis_generales"],
        "metricas_modelo_ml": insights["metricas_modelo_ml"],
        "algoritmo_seleccionado": insights["algoritmo_seleccionado"],
        "algoritmos_comparacion": insights["algoritmos_comparacion"],
        "pronostico_demanda_30_dias": insights["pronostico_demanda_30_dias"],
        "segmentacion_clientes": {
            "resumen": rfm_results["segment_counts"],
        },
    }

    # También guardar una copia segura para el frontend de React.
    frontend_path = os.path.join("src", "data", "ml_insights.json")
    os.makedirs(os.path.dirname(frontend_path), exist_ok=True)
    with open(frontend_path, "w", encoding="utf-8") as f:
        json.dump(public_insights, f, ensure_ascii=False, indent=2)
        
    print(f" -> [OK] Insights guardados en: {output_path} y {frontend_path}")

def main():
    print("=" * 65)
    print("  INICIANDO ENTRENAMIENTO DEL PIPELINE DE MACHINE LEARNING")
    print("=" * 65)
    sales_df, products_df, customers_df = load_data()
    forecast_results = train_demand_forecast(sales_df, products_df)
    rfm_results = train_customer_rfm(sales_df, customers_df)
    export_chatbot_insights(sales_df, forecast_results, rfm_results)
    
    print("\n" + "=" * 65)
    print("  ¡ENTRENAMIENTO COMPLETADO EXITOSAMENTE!")
    print("  Modelos guardados en la carpeta /ml_models:")
    print("   1. forecast_model.pkl   (Modelo seleccionado tras comparar 5 algoritmos)")
    print("   2. kmeans_rfm.pkl       (Modelo K-Means de Segmentación)")
    print("   3. ml_insights.json     (Base de conocimiento estructurada para el Chatbot)")
    print("=" * 65)

if __name__ == "__main__":
    main()
