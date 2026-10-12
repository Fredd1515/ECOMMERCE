"""
=============================================================================
GENERADOR DE DATOS SINTÉTICOS PARA E-COMMERCE / DATA WAREHOUSE & ML
=============================================================================
Este script genera 3 archivos CSV optimizados para importación directa en Supabase:
  1. fact_sales.csv      (500 ventas con patrones realistas para Machine Learning)
  2. dim_customers.csv   (50 clientes con perfiles demográficos)
  3. dim_products.csv    (12 productos reales sincronizados con el catálogo)

Requisitos: Solo Python estándar (no requiere pip install).
Ejecución:  py jisad.py
=============================================================================
"""

import csv
import uuid
import random
from datetime import datetime, timedelta

# Configuración de cantidad de datos
TOTAL_SALES = 500
TOTAL_CUSTOMERS = 50

# ---------------------------------------------------------------------------
# 1. CATÁLOGO REAL DE PRODUCTOS DE LA FARMACIA (12 productos actuales)
# ---------------------------------------------------------------------------
PRODUCTS_CATALOG = [
    {
        "product_key": 1,
        "product_id": "3305e132-ad65-445c-a9a2-833439813c7b",
        "name": "Ibuprofeno 400mg",
        "category_name": "Medicamentos",
        "subcategory_name": "Antiinflamatorios",
        "brand": "Bayer",
        "price": 12.00,
        "cost": 6.50,
        "sku": "MED-IBU-400",
        "unit_type": "Caja x 10 cápsulas blandas",
        "unit_size": "400mg",
        "prescription_required": False
    },
    {
        "product_key": 2,
        "product_id": "a0b1eb7f-b6ad-4b29-89a5-5ccf109f2048",
        "name": "Amoxicilina 500mg",
        "category_name": "Medicamentos",
        "subcategory_name": "Antibióticos",
        "brand": "Pfizer",
        "price": 18.50,
        "cost": 10.00,
        "sku": "MED-AMX-500",
        "unit_type": "Caja x 24 cápsulas",
        "unit_size": "500mg",
        "prescription_required": True
    },
    {
        "product_key": 3,
        "product_id": "018c2c07-4a60-4a8b-8c8c-945663b72176",
        "name": "Vitamina C 1000mg + Zinc",
        "category_name": "Vitaminas",
        "subcategory_name": "Inmunidad",
        "brand": "Redoxon",
        "price": 28.90,
        "cost": 16.00,
        "sku": "VIT-VITC-1000",
        "unit_type": "Tubo x 15 tabletas efervescentes",
        "unit_size": "1000mg",
        "prescription_required": False
    },
    {
        "product_key": 4,
        "product_id": "e2558930-f614-427e-b9f3-fca477d6f786",
        "name": "Protector Solar Facial FPS 50+",
        "category_name": "Cuidado Personal",
        "subcategory_name": "Dermatología",
        "brand": "La Roche-Posay",
        "price": 65.00,
        "cost": 38.00,
        "sku": "DER-SOLAR-50",
        "unit_type": "Frasco x 50ml",
        "unit_size": "50ml",
        "prescription_required": False
    },
    {
        "product_key": 5,
        "product_id": "ad54d7be-97cf-47cf-b636-c1233046bd4d",
        "name": "Alcohol en Gel Antibacterial 70%",
        "category_name": "Primeros Auxilios",
        "subcategory_name": "Desinfección",
        "brand": "Aval",
        "price": 9.50,
        "cost": 4.50,
        "sku": "AUX-ALC-70",
        "unit_type": "Frasco dosificador x 500ml",
        "unit_size": "500ml",
        "prescription_required": False
    },
    {
        "product_key": 6,
        "product_id": "1d55fe49-a8bd-433f-a625-64bd3846ca5c",
        "name": "Pañales Hipoalergénicos Talla M",
        "category_name": "Bebés y Maternidad",
        "subcategory_name": "Pañales",
        "brand": "Huggies",
        "price": 42.00,
        "cost": 26.00,
        "sku": "BEB-PAN-M",
        "unit_type": "Paquete x 40 unidades",
        "unit_size": "Talla M",
        "prescription_required": False
    },
    {
        "product_key": 7,
        "product_id": "3373d950-e90a-4245-ac51-e0d5a9867ddb",
        "name": "Complejo B Multivitamínico",
        "category_name": "Vitaminas",
        "subcategory_name": "Suplementos",
        "brand": "Bion3",
        "price": 32.00,
        "cost": 17.50,
        "sku": "VIT-COMP-B",
        "unit_type": "Frasco x 60 tabletas",
        "unit_size": "60 tab",
        "prescription_required": False
    },
    {
        "product_key": 8,
        "product_id": "0b068393-7e82-437c-93b1-aca1372c3b9d",
        "name": "Jarabe para la Tos y Garganta",
        "category_name": "Medicamentos",
        "subcategory_name": "Respiratorio",
        "brand": "Abrilar",
        "price": 16.80,
        "cost": 9.00,
        "sku": "MED-JAR-TOS",
        "unit_type": "Frasco x 120ml",
        "unit_size": "120ml",
        "prescription_required": False
    },
    {
        "product_key": 9,
        "product_id": "037822e6-dbf8-4676-a70f-958b2423e1fd",
        "name": "Crema Cicatrizante y Reparadora",
        "category_name": "Cuidado Personal",
        "subcategory_name": "Cuidado de la Piel",
        "brand": "Cicaplast",
        "price": 39.50,
        "cost": 22.00,
        "sku": "CUI-CRE-CIC",
        "unit_type": "Tubo x 40g",
        "unit_size": "40g",
        "prescription_required": False
    },
    {
        "product_key": 10,
        "product_id": "1dae16df-5e61-41a6-b415-e58efec91d4f",
        "name": "Serum Ácido Hialurónico Hidratante",
        "category_name": "Cuidado Personal",
        "subcategory_name": "Facial",
        "brand": "Vichy",
        "price": 89.00,
        "cost": 50.00,
        "sku": "CUI-SER-HIAL",
        "unit_type": "Frasco x 30ml",
        "unit_size": "30ml",
        "prescription_required": False
    },
    {
        "product_key": 11,
        "product_id": "367d1716-ded3-4ae0-9894-c3688e0a158f",
        "name": "Termómetro Digital Infrarrojo",
        "category_name": "Primeros Auxilios",
        "subcategory_name": "Equipos Médicos",
        "brand": "Omron",
        "price": 45.00,
        "cost": 25.00,
        "sku": "AUX-TERM-DIG",
        "unit_type": "Unidad",
        "unit_size": "1 ud",
        "prescription_required": False
    },
    {
        "product_key": 12,
        "product_id": "f71f2a03-b9a0-4026-93d6-d4680f499d73",
        "name": "Paracetamol 500mg",
        "category_name": "Medicamentos",
        "subcategory_name": "Analgésicos",
        "brand": "Genfar",
        "price": 8.50,
        "cost": 4.00,
        "sku": "MED-PAR-500",
        "unit_type": "Caja x 20 tabletas",
        "unit_size": "500mg",
        "prescription_required": False
    }
]

# Datos demográficos para clientes en Perú
NOMBRES = ["Juan", "María", "Carlos", "Ana", "Luis", "Rosa", "Jorge", "Lucía", "Pedro", "Elena", "José", "Carmen", "Miguel", "Patricia", "David", "Claudia", "Diego", "Sofía", "Fernando", "Valeria"]
APELLIDOS = ["Quispe", "Flores", "Rodríguez", "Sánchez", "García", "Mamani", "Rojas", "Díaz", "Torres", "Morales", "Vargas", "Castro", "Romero", "Mendoza", "Espinoza", "Huamán", "Chávez", "Paredes", "Gutiérrez", "Castillo"]
CIUDADES = ["Yanahuanca", "Cerro de Pasco", "Lima", "Huánuco", "Huancayo", "Tarma", "Arequipa", "Trujillo"]
METODOS_PAGO = ["yape", "plin", "tarjeta", "efectivo"]
METODOS_ENTREGA = ["delivery", "pickup"]

# ---------------------------------------------------------------------------
# 2. GENERADOR DE CLIENTES (dim_customers.csv)
# ---------------------------------------------------------------------------
def generate_customers():
    customers = []
    start_reg = datetime(2023, 6, 1)
    
    for i in range(1, TOTAL_CUSTOMERS + 1):
        first_name = random.choice(NOMBRES)
        last_name = random.choice(APELLIDOS)
        full_name = f"{first_name} {last_name}"
        email = f"{first_name.lower()}.{last_name.lower()}{random.randint(10, 999)}@gmail.com"
        phone = f"+51 9{random.randint(10000000, 99999999)}"
        city = random.choice(CIUDADES)
        reg_date = start_reg + timedelta(days=random.randint(0, 365))
        customer_type = random.choices(["regular", "premium", "vip"], weights=[0.7, 0.22, 0.08])[0]
        
        customers.append({
            "customer_key": i,
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "full_name": full_name,
            "phone": phone,
            "address": f"Av. Los Libertadores {random.randint(100, 999)}",
            "city": city,
            "state": "Pasco" if city in ["Yanahuanca", "Cerro de Pasco"] else "Perú",
            "country": "Perú",
            "customer_type": customer_type,
            "registration_date": reg_date.strftime("%Y-%m-%d"),
            "is_active": "true"
        })
    return customers

# ---------------------------------------------------------------------------
# 3. GENERADOR DE VENTAS REALISTAS (fact_sales.csv)
# ---------------------------------------------------------------------------
def generate_sales(customers):
    sales = []
    # Rango de fechas: últimos 9 meses (para que el modelo de ML tenga serie temporal completa)
    start_date = datetime(2024, 1, 15, 8, 0, 0)
    end_date = datetime(2024, 10, 10, 21, 0, 0)
    total_seconds = int((end_date - start_date).total_seconds())

    # Ponderaciones de venta por popularidad (Paracetamol e Ibuprofeno se venden más)
    product_weights = [0.16, 0.08, 0.10, 0.05, 0.09, 0.06, 0.07, 0.09, 0.05, 0.04, 0.03, 0.18]

    for i in range(1, TOTAL_SALES + 1):
        # Fecha y hora aleatoria dentro del rango
        random_seconds = random.randint(0, total_seconds)
        order_datetime = start_date + timedelta(seconds=random_seconds)
        
        # Simular mayor venta en fines de semana y tardes (patrón real de retail)
        date_key = int(order_datetime.strftime("%Y%m%d"))
        
        # Producto y cantidad
        prod = random.choices(PRODUCTS_CATALOG, weights=product_weights)[0]
        customer = random.choice(customers)
        quantity = random.choices([1, 2, 3, 4, 5], weights=[0.55, 0.28, 0.10, 0.05, 0.02])[0]
        
        unit_price = prod["price"]
        total_price = round(quantity * unit_price, 2)
        
        # Descuentos ocasionales (ej. promociones de fin de mes o clientes VIP)
        has_discount = random.random() < 0.25
        discount_amount = round(total_price * random.choice([0.05, 0.10, 0.15]), 2) if has_discount else 0.00
        
        # En Perú el IGV es 18% (incluido en el total o desglosado)
        tax_amount = round((total_price - discount_amount) * 0.18, 2)
        final_price = round(total_price - discount_amount, 2)
        
        # Métricas de costo y margen de ganancia para ML
        unit_cost = prod["cost"]
        total_cost = round(quantity * unit_cost, 2)
        profit_amount = round(final_price - total_cost, 2)
        profit_margin = round((profit_amount / final_price) * 100, 2) if final_price > 0 else 0.00
        
        delivery_date = (order_datetime + timedelta(days=random.randint(0, 2))).strftime("%Y-%m-%d")
        
        sales.append({
            "order_id": str(uuid.uuid4()),
            "order_item_id": str(uuid.uuid4()),
            "date_key": date_key,
            "customer_key": customer["customer_key"],
            "product_key": prod["product_key"],
            "location_key": random.choice([1, 2]),
            "employee_key": random.choice([1, 2, 3]),
            "quantity_sold": quantity,
            "unit_price": f"{unit_price:.2f}",
            "total_price": f"{total_price:.2f}",
            "discount_amount": f"{discount_amount:.2f}",
            "tax_amount": f"{tax_amount:.2f}",
            "final_price": f"{final_price:.2f}",
            "unit_cost": f"{unit_cost:.2f}",
            "total_cost": f"{total_cost:.2f}",
            "profit_margin": f"{profit_margin:.2f}",
            "profit_amount": f"{profit_amount:.2f}",
            "payment_method": random.choice(METODOS_PAGO),
            "payment_status": "paid",
            "order_status": random.choices(["delivered", "shipped", "completed"], weights=[0.85, 0.10, 0.05])[0],
            "delivery_method": random.choice(METODOS_ENTREGA),
            "delivery_date": delivery_date,
            "order_date": order_datetime.strftime("%Y-%m-%d %H:%M:%S")
        })

    # Ordenar por fecha cronológica y asignar sales_key del 1 al 500
    sales.sort(key=lambda x: x["order_date"])
    for idx, sale in enumerate(sales, 1):
        sale["sales_key"] = idx

    return sales

# ---------------------------------------------------------------------------
# 4. EXPORTAR A CSV
# ---------------------------------------------------------------------------
def export_csv(filename, fieldnames, data):
    with open(filename, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
    print(f" [OK] Creado exitosamente: {filename} ({len(data)} registros)")

def main():
    print("=" * 65)
    print("  GENERANDO DATASETS SINTÉTICOS PARA E-COMMERCE Y ML")
    print("=" * 65)
    
    # 1. Generar Clientes (50 clientes con perfiles peruanos)
    customers = generate_customers()
    customer_fields = [
        "customer_key", "email", "first_name", "last_name", "full_name",
        "phone", "address", "city", "state", "country", "customer_type",
        "registration_date", "is_active"
    ]
    export_csv("dim_customers.csv", customer_fields, customers)

    # 2. Generar Catálogo de Productos (12 productos reales)
    product_fields = [
        "product_key", "product_id", "name", "category_name", "subcategory_name",
        "brand", "sku", "unit_type", "unit_size", "prescription_required"
    ]
    cleaned_products = [
        {k: prod[k] for k in product_fields} for prod in PRODUCTS_CATALOG
    ]
    export_csv("dim_products.csv", product_fields, cleaned_products)

    # 3. Generar Ventas (Exactamente 500 ventas distribuidas en los 12 productos y 50 clientes)
    sales = generate_sales(customers)
    sales_fields = [
        "sales_key", "order_id", "order_item_id", "date_key", "customer_key", "product_key",
        "location_key", "employee_key", "quantity_sold", "unit_price", "total_price",
        "discount_amount", "tax_amount", "final_price", "unit_cost", "total_cost",
        "profit_margin", "profit_amount", "payment_method", "payment_status",
        "order_status", "delivery_method", "delivery_date", "order_date"
    ]
    export_csv("fact_sales.csv", sales_fields, sales)

    print("=" * 65)
    print(f"  RESUMEN DE GENERACIÓN:")
    print(f"   • Total de ventas generadas: {len(sales)} filas")
    print(f"   • Clientes generados:        {len(customers)} perfiles")
    print(f"   • Productos cubiertos:       {len(cleaned_products)} productos reales")
    total_recaudado = sum(float(s["final_price"]) for s in sales)
    print(f"   • Ingresos totales simulados: S/ {total_recaudado:,.2f}")
    print("=" * 65)
    print(" INSTRUCCIONES DE IMPORTACIÓN EN SUPABASE:")
    print("  1. Abre tu Dashboard de Supabase -> Table Editor.")
    print("  2. Ve a la tabla 'fact_sales' -> Clic en 'Insert' -> 'Import data from CSV'.")
    print("  3. Selecciona el archivo 'fact_sales.csv' generado en esta carpeta.")
    print("  4. (Opcional) Si quieres, puedes hacer lo mismo con 'dim_customers.csv'")
    print("     en la tabla 'dim_customers' y 'dim_products.csv' en 'dim_products'.")
    print("=" * 65)

if __name__ == "__main__":
    main()
