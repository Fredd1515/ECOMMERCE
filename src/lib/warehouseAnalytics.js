import { supabase } from './customSupabaseClient';

// No incluir snapshots CSV con ventas o clientes en el bundle del navegador.
// En desarrollo, si Supabase no tiene datos, el panel muestra vacío en vez de
// exponer información administrativa local a usuarios no autorizados.
const localSnapshot = {
  sales: [],
  customers: [],
  products: []
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const uniqueValues = (rows, selector) => new Set(
  rows.map(selector).filter((value) => value !== null && value !== undefined && value !== '')
).size;

const getDateValue = (sale) => {
  if (sale.order_date) return new Date(sale.order_date);
  if (sale.delivery_date) return new Date(sale.delivery_date);
  if (sale.date_key) {
    const key = String(sale.date_key);
    if (/^\d{8}$/.test(key)) {
      return new Date(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T00:00:00`);
    }
  }
  return null;
};

const getSaleRevenue = (sale) => toNumber(
  sale.final_price ?? sale.total_price ?? (toNumber(sale.unit_price) * toNumber(sale.quantity_sold))
);

const isCancelled = (sale) => ['cancelled', 'canceled', 'anulado', 'cancelado'].includes(
  String(sale.order_status || '').toLowerCase()
);

const normalizeStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (['completed', 'complete', 'paid', 'delivered', 'entregado'].includes(value)) return 'delivered';
  if (['cancelled', 'canceled', 'cancelado', 'anulado'].includes(value)) return 'cancelled';
  if (['shipped', 'in_transit', 'en camino'].includes(value)) return 'shipped';
  if (['processing', 'preparing', 'procesando'].includes(value)) return 'processing';
  return 'pending';
};

const fetchTable = async (table) => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .range(0, 9999);

  return { data: data || [], error };
};

export const getWarehouseContext = async () => {
  const [salesResult, customersResult, productsResult] = await Promise.all([
    fetchTable('fact_sales'),
    fetchTable('dim_customers'),
    fetchTable('dim_products')
  ]);

  if (salesResult.error) {
    return {
      data: null,
      error: salesResult.error,
      source: 'fact_sales'
    };
  }

  const useLocalSales = import.meta.env.DEV && salesResult.data.length === 0 && localSnapshot.sales.length > 0;
  const useLocalCustomers = import.meta.env.DEV && customersResult.data.length === 0 && localSnapshot.customers.length > 0;
  const useLocalProducts = import.meta.env.DEV && productsResult.data.length === 0 && localSnapshot.products.length > 0;
  const sales = useLocalSales ? localSnapshot.sales : salesResult.data;
  const customers = useLocalCustomers ? localSnapshot.customers : customersResult.data;
  const products = useLocalProducts ? localSnapshot.products : productsResult.data;
  const source = useLocalSales || useLocalCustomers || useLocalProducts
    ? 'snapshot local · aplica la migración RLS para datos en vivo'
    : 'fact_sales + dim_customers + dim_products';

  return {
    data: {
      sales,
      customers,
      products,
      customerError: customersResult.error,
      productError: productsResult.error
    },
    error: null,
    source
  };
};

export const getWarehouseDashboardMetrics = async () => {
  const { data: context, error, source } = await getWarehouseContext();
  if (error) return { data: null, error, source };

  const { sales, customers, products } = context;
  const validSales = sales.filter((sale) => !isCancelled(sale));
  const totalSales = validSales.reduce((sum, sale) => sum + getSaleRevenue(sale), 0);
  const totalOrders = uniqueValues(validSales, (sale) => sale.order_id || sale.sales_key);
  const totalCustomers = customers.length > 0
    ? uniqueValues(customers, (customer) => customer.customer_key)
    : uniqueValues(validSales, (sale) => sale.customer_key);
  const totalProducts = products.length > 0
    ? uniqueValues(products, (product) => product.product_key)
    : uniqueValues(validSales, (sale) => sale.product_key);

  let lowStockProducts = null;
  let inventorySource = 'fact_inventory no disponible';
  const { data: inventory, error: inventoryError } = await fetchTable('fact_inventory');
  if (!inventoryError && inventory.length > 0) {
    const lowStockKeys = inventory.filter((item) => {
      const stock = item.ending_stock ?? item.current_stock ?? item.stock ?? item.quantity_on_hand;
      const reorderPoint = item.reorder_point ?? item.minimum_stock;
      return item.is_low_stock === true
        || ['LOW', 'CRITICAL'].includes(String(item.stock_status || '').toUpperCase())
        || (stock !== undefined && (reorderPoint !== undefined
          ? toNumber(stock) <= toNumber(reorderPoint)
          : toNumber(stock) <= 50));
    }).map((item) => item.product_key ?? item.inventory_key);
    lowStockProducts = uniqueValues(lowStockKeys, (value) => value);
    inventorySource = 'fact_inventory';
  } else {
    const { data: liveProducts, error: liveProductsError } = await fetchTable('products');
    if (!liveProductsError) {
      const lowStockKeys = liveProducts
        .filter((product) => toNumber(product.stock) <= 50)
        .map((product) => product.id);
      lowStockProducts = uniqueValues(lowStockKeys, (value) => value);
      inventorySource = 'products';
    }
  }

  return {
    data: {
      totalSales: Number(totalSales.toFixed(2)),
      totalOrders,
      totalProducts,
      totalCustomers,
      lowStockProducts,
      averageOrderValue: totalOrders ? Number((totalSales / totalOrders).toFixed(2)) : 0,
      totalQuantitySold: validSales.reduce((sum, sale) => sum + toNumber(sale.quantity_sold), 0),
      totalProfit: Number(validSales.reduce((sum, sale) => sum + toNumber(sale.profit_amount), 0).toFixed(2)),
      totalDiscounts: Number(validSales.reduce((sum, sale) => sum + toNumber(sale.discount_amount), 0).toFixed(2)),
      inventorySource,
      source,
      records: sales.length
    },
    error: null,
    source
  };
};

export const getWarehouseSalesChartData = async (months = 12) => {
  const { data: context, error, source } = await getWarehouseContext();
  if (error) return { data: [], error, source };

  const grouped = new Map();
  context.sales.filter((sale) => !isCancelled(sale)).forEach((sale) => {
    const date = getDateValue(sale);
    if (!date || Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const existing = grouped.get(key) || {
      month: date.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' }),
      sales: 0,
      orders: new Set(),
      quantitySold: 0,
      _sort: key
    };
    existing.sales += getSaleRevenue(sale);
    existing.orders.add(sale.order_id || sale.sales_key);
    existing.quantitySold += toNumber(sale.quantity_sold);
    grouped.set(key, existing);
  });

  const chartData = Array.from(grouped.values())
    .sort((a, b) => a._sort.localeCompare(b._sort))
    .slice(-months)
    .map(({ orders, _sort, ...item }) => ({
      ...item,
      orders: orders.size,
      sales: Number(item.sales.toFixed(2))
    }));

  return { data: chartData, error: null, source };
};

const getDateRange = (startDate, endDate) => {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
  return { start, end };
};

export const getWarehouseProductSales = async (startDate, endDate) => {
  const { data: context, error, source } = await getWarehouseContext();
  if (error) return { data: [], error, source };

  const { start, end } = getDateRange(startDate, endDate);
  let sales = context.sales.filter((sale) => !isCancelled(sale));
  const filteredSales = sales.filter((sale) => {
    const date = getDateValue(sale);
    return date && (!start || date >= start) && (!end || date <= end);
  });

  // The warehouse in the project is historical. If the UI asks for a current
  // calendar range with no rows, use the most recent available warehouse window
  // of the same duration instead of displaying invented values or an empty KPI.
  if (filteredSales.length > 0 || !start || !end) {
    sales = filteredSales;
  } else {
    const datedSales = sales
      .map((sale) => ({ sale, date: getDateValue(sale) }))
      .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
      .sort((a, b) => b.date - a.date);
    const latest = datedSales[0]?.date;
    const days = Math.max(1, Math.ceil((end - start) / 86400000));
    const fallbackStart = latest ? new Date(latest.getTime() - days * 86400000) : null;
    sales = fallbackStart
      ? datedSales.filter((item) => item.date >= fallbackStart && item.date <= latest).map((item) => item.sale)
      : [];
  }

  const productMap = new Map(context.products.map((product) => [String(product.product_key), product]));
  const grouped = new Map();
  sales.forEach((sale) => {
    const key = String(sale.product_key ?? sale.product_id ?? 'unknown');
    const product = productMap.get(key);
    const existing = grouped.get(key) || {
      product_key: sale.product_key,
      product_name: product?.name || `Producto ${sale.product_key ?? 'sin clave'}`,
      category_name: product?.category_name || product?.category || 'Sin categoría',
      quantity_sold: 0,
      total_sales: 0,
      orders: new Set()
    };
    existing.quantity_sold += toNumber(sale.quantity_sold);
    existing.total_sales += getSaleRevenue(sale);
    existing.orders.add(sale.order_id || sale.sales_key);
    grouped.set(key, existing);
  });

  return {
    data: Array.from(grouped.values())
      .sort((a, b) => b.total_sales - a.total_sales)
      .map(({ orders, ...item }) => ({
        ...item,
        orders: orders.size,
        total_sales: Number(item.total_sales.toFixed(2))
      })),
    error: null,
    source
  };
};

export const getWarehouseCustomerAnalytics = async (limit = 10000) => {
  const { data: context, error, source } = await getWarehouseContext();
  if (error) return { data: [], error, source };

  const customerMap = new Map(context.customers.map((customer) => [String(customer.customer_key), {
    customer_id: customer.customer_key,
    email: customer.email,
    full_name: customer.full_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || `Cliente ${customer.customer_key}`,
    first_name: customer.first_name,
    last_name: customer.last_name,
    created_at: customer.registration_date || customer.created_at,
    total_orders: 0,
    total_spent: 0,
    total_quantity: 0
  }]));

  context.sales.filter((sale) => !isCancelled(sale)).forEach((sale) => {
    const key = String(sale.customer_key ?? 'unknown');
    const customer = customerMap.get(key) || {
      customer_id: sale.customer_key,
      email: '',
      full_name: `Cliente ${sale.customer_key ?? 'sin clave'}`,
      total_orders: 0,
      total_spent: 0,
      total_quantity: 0
    };
    customer.total_spent += getSaleRevenue(sale);
    customer.total_quantity += toNumber(sale.quantity_sold);
    customerMap.set(key, customer);
  });

  const orderSets = new Map();
  context.sales.filter((sale) => !isCancelled(sale)).forEach((sale) => {
    const key = String(sale.customer_key ?? 'unknown');
    if (!orderSets.has(key)) orderSets.set(key, new Set());
    orderSets.get(key).add(sale.order_id || sale.sales_key);
  });

  const data = Array.from(customerMap.entries())
    .map(([key, customer]) => ({
      ...customer,
      total_orders: orderSets.get(key)?.size || 0,
      total_spent: Number(customer.total_spent.toFixed(2))
    }))
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, limit);

  return { data, error: null, source };
};

export const getWarehouseOrders = async () => {
  // Se consultan ambas fuentes: fact_sales contiene el histórico y orders
  // contiene pedidos pendientes que todavía no deben aparecer como ventas.
  const [contextResult, ordersResult, itemsResult] = await Promise.all([
    getWarehouseContext(),
    fetchTable('orders'),
    fetchTable('order_items')
  ]);

  if (contextResult.error && ordersResult.error) {
    return { data: [], error: contextResult.error, source: 'orders + fact_sales' };
  }

  const context = contextResult.data || { sales: [], customers: [], products: [] };
  const productMap = new Map(context.products.map((product) => [String(product.product_key), product]));
  const customerMap = new Map(context.customers.map((customer) => [String(customer.customer_key), customer]));
  const orders = new Map();
  const operationalItems = new Map();

  (itemsResult.data || []).forEach((item) => {
    const list = operationalItems.get(item.order_id) || [];
    list.push({
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: toNumber(item.quantity),
      unit_price: toNumber(item.unit_price),
      total_price: toNumber(item.total_price)
    });
    operationalItems.set(item.order_id, list);
  });

  context.sales.forEach((sale) => {
    const orderId = sale.order_id || `warehouse-sale-${sale.sales_key}`;
    const customer = customerMap.get(String(sale.customer_key));
    const product = productMap.get(String(sale.product_key));
    const existing = orders.get(orderId) || {
      id: orderId,
      order_code: String(orderId),
      customer_id: sale.customer_key,
      customer_name: customer?.full_name || `Cliente ${sale.customer_key ?? 'sin clave'}`,
      customer_email: customer?.email || '',
      status: normalizeStatus(sale.order_status),
      payment_method: sale.payment_method,
      payment_status: sale.payment_status,
      shipping_method: sale.delivery_method,
      order_date: sale.order_date || sale.delivery_date,
      created_at: sale.order_date || sale.delivery_date,
      total_amount: 0,
      subtotal: 0,
      discount: 0,
      discount_amount: 0,
      final_amount: 0,
      isWarehouse: true,
      order_items: []
    };

    existing.total_amount += toNumber(sale.total_price);
    existing.subtotal += toNumber(sale.total_price);
    existing.discount_amount += toNumber(sale.discount_amount);
    existing.discount += toNumber(sale.discount_amount);
    existing.final_amount += getSaleRevenue(sale);
    existing.order_items.push({
      id: sale.order_item_id || sale.sales_key,
      product_id: product?.product_id || sale.product_key,
      product_name: product?.name || `Producto ${sale.product_key ?? 'sin clave'}`,
      quantity: toNumber(sale.quantity_sold),
      unit_price: toNumber(sale.unit_price),
      total_price: toNumber(sale.total_price)
    });
    orders.set(orderId, existing);
  });

  // Los pedidos operativos tienen prioridad para mostrar pago pendiente,
  // número de operación, dirección y los items reales del checkout.
  (ordersResult.data || []).forEach((order) => {
    const existing = orders.get(order.id);
    const items = operationalItems.get(order.id) || existing?.order_items || [];
    orders.set(order.id, {
      ...existing,
      ...order,
      id: order.id,
      status: normalizeStatus(order.status),
      total_amount: toNumber(order.subtotal || order.final_amount),
      subtotal: toNumber(order.subtotal),
      discount: toNumber(order.discount),
      discount_amount: toNumber(order.discount),
      shipping_cost: toNumber(order.shipping_cost),
      final_amount: toNumber(order.final_amount),
      isWarehouse: false,
      order_items: items
    });
  });

  const source = [
    contextResult.error ? null : 'fact_sales',
    ordersResult.error ? null : 'orders'
  ].filter(Boolean).join(' + ') || 'sin datos';

  return {
    data: Array.from(orders.values()).map((order) => ({
      ...order,
      total_amount: Number(toNumber(order.total_amount).toFixed(2)),
      subtotal: Number(toNumber(order.subtotal).toFixed(2)),
      discount: Number(toNumber(order.discount).toFixed(2)),
      discount_amount: Number(toNumber(order.discount_amount).toFixed(2)),
      shipping_cost: Number(toNumber(order.shipping_cost).toFixed(2)),
      final_amount: Number(toNumber(order.final_amount).toFixed(2))
    })).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    error: null,
    source
  };
};

export const getWarehouseOrderStats = async () => {
  const { data: orders, error, source } = await getWarehouseOrders();
  if (error) return { data: null, error, source };

  const stats = {
    pending: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    totalRevenue: 0
  };
  orders.forEach((order) => {
    if (stats[order.status] !== undefined) stats[order.status] += 1;
    if (order.status !== 'cancelled') stats.totalRevenue += order.final_amount || 0;
  });
  stats.totalRevenue = Number(stats.totalRevenue.toFixed(2));
  return { data: stats, error: null, source };
};
