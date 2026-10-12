// =====================================================
// GENERADOR DE DATOS DE DEMOSTRACIÓN
// Genera 500 ventas sintéticas basadas en ml_insights.json
// Se usa cuando Supabase no tiene datos suficientes
// =====================================================

import mlInsights from '@/data/ml_insights.json';

// Semilla determinista para datos consistentes
const seededRandom = (seed) => {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
};

// Productos del catálogo (sincronizados con ml_insights)
const PRODUCTS = Object.entries(mlInsights.pronostico_demanda_30_dias || {}).map(
  ([name, data], i) => ({
    id: `prod-${data.product_key}`,
    name,
    category: data.category,
    price: data.unit_price,
  })
);

// Clientes del data warehouse
const VIP_CUSTOMERS = mlInsights.segmentacion_clientes?.clientes_vip || [];
const AT_RISK_CUSTOMERS = mlInsights.segmentacion_clientes?.clientes_en_riesgo_abandono || [];
const ALL_CUSTOMERS = [...VIP_CUSTOMERS, ...AT_RISK_CUSTOMERS];

// Completar hasta 50 clientes sintéticos si hacen falta
const CUSTOMER_NAMES = [
  'Carlos Perez', 'Maria Lopez', 'Juan Torres', 'Ana Ramirez', 'Luis Gonzalez',
  'Rosa Chavez', 'Pedro Castillo', 'Carmen Vega', 'Miguel Herrera', 'Lucia Morales',
  'Roberto Cruz', 'Elena Santos', 'Daniel Rios', 'Isabel Medina', 'Francisco Ramos',
  'Graciela Fuentes', 'Alejandro Suarez', 'Nora Jimenez', 'Andres Pizarro', 'Cecilia Aranda',
];

const generateCustomers = () => {
  const customers = [...ALL_CUSTOMERS];
  for (let i = customers.length; i < 50; i++) {
    customers.push({
      customer_key: i + 1,
      full_name: CUSTOMER_NAMES[i % CUSTOMER_NAMES.length] + ` ${i}`,
      email: `cliente${i + 1}@farmacia.pe`,
      city: ['Lima', 'Arequipa', 'Cusco', 'Trujillo', 'Huancayo'][i % 5],
    });
  }
  return customers;
};

const CUSTOMERS = generateCustomers();

const STATUSES = ['delivered', 'delivered', 'delivered', 'processing', 'shipped', 'pending', 'cancelled'];
const PAYMENT_METHODS = ['card', 'yape', 'cash', 'card', 'yape'];
const CITIES = ['Lima', 'Arequipa', 'Cusco', 'Trujillo', 'Huancayo', 'Ica', 'Piura', 'Chiclayo'];

// Genera una fecha dentro del rango 2024-01-15 a 2024-10-10
const genDate = (seed) => {
  const start = new Date('2024-01-15').getTime();
  const end = new Date('2024-10-10').getTime();
  const ts = start + seededRandom(seed) * (end - start);
  return new Date(ts).toISOString();
};

// Genera las 500 ventas sintéticas
export const generate500Sales = () => {
  const sales = [];

  for (let i = 0; i < 500; i++) {
    const customer = CUSTOMERS[Math.floor(seededRandom(i * 3) * CUSTOMERS.length)];
    const numItems = Math.floor(seededRandom(i * 7) * 3) + 1;

    const items = [];
    let subtotal = 0;
    for (let j = 0; j < numItems; j++) {
      const product = PRODUCTS[Math.floor(seededRandom(i * 11 + j) * PRODUCTS.length)];
      const quantity = Math.floor(seededRandom(i * 13 + j) * 4) + 1;
      const unitPrice = product.price;
      const total = parseFloat((unitPrice * quantity).toFixed(2));
      subtotal += total;
      items.push({
        id: `item-${i}-${j}`,
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        quantity,
        unit_price: unitPrice,
        total_price: total,
      });
    }

    const discount = seededRandom(i * 17) < 0.15 ? parseFloat((subtotal * 0.1).toFixed(2)) : 0;
    const finalAmount = parseFloat((subtotal - discount).toFixed(2));
    const status = STATUSES[Math.floor(seededRandom(i * 19) * STATUSES.length)];
    const orderDate = genDate(i * 23);

    sales.push({
      id: `order-${String(i + 1).padStart(4, '0')}`,
      order_code: `ORD-${String(i + 1).padStart(4, '0')}`,
      customer_id: `cust-${customer.customer_key}`,
      customer_name: customer.full_name,
      customer_email: customer.email,
      delivery_city: customer.city || CITIES[Math.floor(seededRandom(i * 29) * CITIES.length)],
      status,
      payment_method: PAYMENT_METHODS[Math.floor(seededRandom(i * 31) * PAYMENT_METHODS.length)],
      total_amount: subtotal,
      discount_amount: discount,
      final_amount: finalAmount,
      order_date: orderDate,
      created_at: orderDate,
      order_items: items,
    });
  }

  return sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

// Calcula métricas a partir de las 500 ventas
export const computeMetrics = (sales) => {
  const delivered = sales.filter(s => s.status === 'delivered');
  const totalSales = delivered.reduce((sum, s) => sum + s.final_amount, 0);

  return {
    totalSales: parseFloat(totalSales.toFixed(2)),
    totalOrders: sales.length,
    totalProducts: PRODUCTS.length,
    lowStockProducts: 3, // estimado
  };
};

// Calcula stats por estado
export const computeOrderStats = (sales) => {
  const stats = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, totalRevenue: 0 };
  sales.forEach(s => {
    if (stats.hasOwnProperty(s.status)) stats[s.status]++;
    if (s.status === 'delivered') stats.totalRevenue += s.final_amount;
  });
  stats.totalRevenue = parseFloat(stats.totalRevenue.toFixed(2));
  return stats;
};

// Genera datos para el gráfico mensual
export const computeMonthlyChart = (sales) => {
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthly = {};
  sales.forEach(s => {
    const date = new Date(s.created_at);
    const key = monthNames[date.getMonth()];
    if (!monthly[key]) monthly[key] = { month: key, sales: 0, orders: 0, _month: date.getMonth() };
    if (s.status === 'delivered') monthly[key].sales += s.final_amount;
    monthly[key].orders++;
  });

  return Object.values(monthly)
    .sort((a, b) => a._month - b._month)
    .map(({ _month, ...rest }) => ({
      ...rest,
      sales: parseFloat(rest.sales.toFixed(2)),
    }));
};

// Singleton para no regenerar en cada render
let _cachedSales = null;
export const getCachedSales = () => {
  if (!_cachedSales) _cachedSales = generate500Sales();
  return _cachedSales;
};
