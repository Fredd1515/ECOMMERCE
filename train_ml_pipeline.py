"""
=============================================================================
PIPELINE DE MACHINE LEARNING PARA E-COMMERCE FARMACÉUTICO
=============================================================================
Este script ejecuta:
  1. Modelo 1: Pronóstico de Demanda y Ventas Futuras (Forecasting con Random Forest)
     - Proyecta demanda e ingresos por producto a 7, 15 y 30 días.
     - Evalúa precisión con MAE, RMSE y R².
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
from sklearn.ensemble import RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Asegurar carpeta de salida para modelos y métricas
MODELS_DIR = "ml_models"
os.makedirs(MODELS_DIR, exist_ok=True)

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
    """Entrena un modelo Random Forest para predecir demanda diaria por producto."""
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
    full_df["rolling_mean_7"] = full_df.groupby("product_key")["units_sold"].shift(1).rolling(window=7, min_periods=1).mean().fillna(0)
    
    # Enlazar atributos del producto
    full_df = full_df.merge(products_df[["product_key", "category_name", "prescription_required"]], on="product_key", how="left")
    full_df = pd.get_dummies(full_df, columns=["category_name"], drop_first=True)
    
    feature_cols = [c for c in full_df.columns if c not in ["date", "units_sold", "revenue"]]
    
    # División temporal Train (80%) y Test (20%)
    split_date = full_df["date"].quantile(0.80)
    train = full_df[full_df["date"] <= split_date]
    test = full_df[full_df["date"] > split_date]
    
    X_train, y_train = train[feature_cols], train["units_sold"]
    X_test, y_test = test[feature_cols], test["units_sold"]
    
    print("\n[3/5] Entrenando Modelo de Pronóstico (RandomForestRegressor)...")
    model = RandomForestRegressor(n_estimators=120, max_depth=10, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluación
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    
    print(f" -> Evaluación del Modelo:")
    print(f"    • MAE (Error Absoluto Medio):   {mae:.3f} unidades")
    print(f"    • RMSE (Raíz Error Cuadrático): {rmse:.3f} unidades")
    print(f"    • R² Score (Precisión Global):  {r2:.3f}")
    
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
        
        # Últimos lags del producto
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
                "lag_1": prod_data["units_sold"],
                "lag_7": prod_data["lag_1"],
                "rolling_mean_7": prod_data["rolling_mean_7"],
                "prescription_required": prod["prescription_required"]
            }
            # Completar dummies
            for col in feature_cols:
                if col not in row_dict:
                    row_dict[col] = prod_data.get(col, 0)
            
            x_row = pd.DataFrame([row_dict])[feature_cols]
            pred_val = max(0, float(model.predict(x_row)[0]))
            preds.append(pred_val)
            
        units_7 = round(sum(preds[:7]), 1)
        units_15 = round(sum(preds[:15]), 1)
        units_30 = round(sum(preds[:30]), 1)
        
        unit_price = float(sales_df[sales_df["product_key"] == p_key]["unit_price"].iloc[0])
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
        "metrics": {"mae": round(mae, 3), "rmse": round(rmse, 3), "r2": round(r2, 3)},
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

    # También guardar copia directa para el frontend de React
    frontend_path = os.path.join("src", "data", "ml_insights.json")
    os.makedirs(os.path.dirname(frontend_path), exist_ok=True)
    with open(frontend_path, "w", encoding="utf-8") as f:
        json.dump(insights, f, ensure_ascii=False, indent=2)
        
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
    print("   1. forecast_model.pkl   (Modelo Random Forest de Demanda)")
    print("   2. kmeans_rfm.pkl       (Modelo K-Means de Segmentación)")
    print("   3. ml_insights.json     (Base de conocimiento estructurada para el Chatbot)")
    print("=" * 65)

if __name__ == "__main__":
    main()
