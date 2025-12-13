// =====================================================
// CONSULTAS EN TIEMPO REAL PARA ADMINISTRADOR
// =====================================================

import { supabase } from './customSupabaseClient';

export const getDashboardMetrics = async () => {
  try {
    // Obtener ventas totales (todos los pedidos entregados)
    const { data: salesData, error: salesError } = await supabase
      .from('orders')
      .select('final_amount, status')
      .eq('status', 'delivered');

    if (salesError) {
      console.log('Error fetching sales data:', salesError);
    }

    // Obtener total de pedidos
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('id, status');

    if (ordersError) {
      console.log('Error fetching orders data:', ordersError);
    }

    // Obtener total de productos
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, stock')
      .eq('is_active', true);

    if (productsError) {
      console.log('Error fetching products data:', productsError);
    }

    // Calcular métricas
    const totalSales = salesData?.reduce((sum, order) => sum + (order.final_amount || 0), 0) || 0;
    const totalOrders = ordersData?.length || 0;
    const totalProducts = productsData?.length || 0;
    const lowStockProducts = productsData?.filter(p => p.stock < 50).length || 0;

    console.log('Dashboard metrics:', { totalSales, totalOrders, totalProducts, lowStockProducts });

    return {
      data: {
        totalSales,
        totalOrders,
        totalProducts,
        lowStockProducts
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return { data: null, error };
  }
};

/**
 * Obtiene datos de ventas por mes para gráficos
 */
export const getSalesChartData = async (months = 6) => {
  try {
    // Obtener pedidos de los últimos meses
    const { data: ordersData, error } = await supabase
      .from('orders')
      .select('final_amount, order_date, status')
      .gte('order_date', new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('order_date', { ascending: true });

    if (error) {
      console.log('Error fetching sales chart data:', error);
      return { data: [], error: null };
    }

    // Agrupar por mes
    const monthlyData = {};
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    ordersData?.forEach(order => {
      const date = new Date(order.order_date);
      const monthKey = monthNames[date.getMonth()];
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          sales: 0,
          orders: 0
        };
      }
      
      if (order.status === 'delivered') {
        monthlyData[monthKey].sales += order.final_amount || 0;
      }
      monthlyData[monthKey].orders += 1;
    });

    const chartData = Object.values(monthlyData);

    return { data: chartData, error: null };
  } catch (error) {
    console.error('Error fetching sales chart data:', error);
    return { data: [], error };
  }
};

/**
 * Obtiene top productos más vendidos con datos reales
 */
export const getTopProducts = async (limit = 10) => {
  try {
    // Obtener todos los items de órdenes
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        product_id,
        quantity,
        total_price,
        products (
          id,
          name,
          category,
          price
        )
      `);

    if (itemsError) {
      console.log('Error fetching order items:', itemsError);
      return { data: [], error: itemsError };
    }

    if (!orderItems || orderItems.length === 0) {
      // Si no hay ventas, devolver productos básicos
      const { data: products } = await supabase
        .from('products')
        .select('id, name, category, price')
        .eq('is_active', true)
        .limit(limit);

      return {
        data: products?.map(p => ({
          product_id: p.id,
          product_name: p.name,
          category_name: p.category,
          total_revenue: 0,
          times_sold: 0,
          total_quantity: 0
        })) || [],
        error: null
      };
    }

    // Agrupar por producto y calcular totales
    const productStats = {};

    orderItems.forEach(item => {
      if (!item.products) return;

      const productId = item.product_id;

      if (!productStats[productId]) {
        productStats[productId] = {
          product_id: productId,
          product_name: item.products.name,
          category_name: item.products.category,
          total_revenue: 0,
          times_sold: 0,
          total_quantity: 0
        };
      }

      productStats[productId].total_revenue += parseFloat(item.total_price || 0);
      productStats[productId].times_sold += 1;
      productStats[productId].total_quantity += parseInt(item.quantity || 0);
    });

    // Convertir a array y ordenar por ingresos totales
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, limit)
      .map(p => ({
        ...p,
        total_revenue: parseFloat(p.total_revenue.toFixed(2))
      }));

    return { data: topProducts, error: null };
  } catch (error) {
    console.error('Error fetching top products:', error);
    return { data: [], error };
  }
};

/**
 * Obtiene análisis de clientes con datos reales
 */
export const getCustomerAnalytics = async (limit = 50) => {
  try {
    // Obtener todos los clientes
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (profilesError) {
      console.log('Error fetching profiles:', profilesError);
      return { data: [], error: profilesError };
    }

    if (!profiles || profiles.length === 0) {
      return { data: [], error: null };
    }

    // Obtener todas las órdenes
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('customer_id, final_amount, total_amount, status');

    if (ordersError) {
      console.log('Error fetching orders:', ordersError);
    }

    // Calcular estadísticas reales por cliente
    const customerAnalytics = profiles.map(customer => {
      // Filtrar órdenes de este cliente
      const customerOrders = orders?.filter(o => o.customer_id === customer.id) || [];

      // Calcular total de pedidos
      const total_orders = customerOrders.length;

      // Calcular total gastado (solo pedidos no cancelados)
      const total_spent = customerOrders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, order) => {
          const amount = order.final_amount || order.total_amount || 0;
          return sum + amount;
        }, 0);

      return {
        customer_id: customer.id,
        email: customer.email,
        full_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        created_at: customer.created_at,
        total_orders,
        total_spent: parseFloat(total_spent.toFixed(2))
      };
    });

    // Ordenar por total gastado (descendente)
    customerAnalytics.sort((a, b) => b.total_spent - a.total_spent);

    return { data: customerAnalytics, error: null };
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    return { data: [], error };
  }
};

/**
 * Obtiene análisis de inventario
 */
export const getInventoryAnalytics = async () => {
  try {
    // Obtener productos con información de stock
    const { data, error } = await supabase
      .from('products')
      .select('name, stock, category')
      .eq('is_active', true);

    if (error) {
      console.log('Error fetching inventory analytics:', error);
      return { data: [], error: null };
    }

    // Crear análisis de inventario
    const inventoryAnalytics = data?.map(product => ({
      product_name: product.name,
      category_name: product.category,
      ending_stock: product.stock,
      is_low_stock: product.stock < 50,
      is_out_of_stock: product.stock === 0,
      location_name: 'Farmacia Principal'
    })) || [];

    return { data: inventoryAnalytics, error: null };
  } catch (error) {
    console.error('Error fetching inventory analytics:', error);
    return { data: [], error };
  }
};

//Obtiene todos los pedidos con información detallada
export const getAllOrdersWithDetails = async () => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_name,
          quantity,
          unit_price,
          total_price
        )
      `)
      .order('order_date', { ascending: false });

    if (error) {
      console.log('Error fetching orders:', error);
      return { data: [], error: null };
    }

    console.log('Orders fetched:', data);
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching orders with details:', error);
    return { data: [], error };
  }
};

/**
 * Obtiene estadísticas de pedidos por estado
 */
export const getOrderStats = async () => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('status, final_amount');

    if (error) throw error;

    const stats = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      totalRevenue: 0
    };

    data?.forEach(order => {
      const status = order.status?.toLowerCase() || 'pending';
      if (stats.hasOwnProperty(status)) {
        stats[status]++;
      }
      if (status === 'delivered') {
        stats.totalRevenue += order.final_amount || 0;
      }
    });

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching order stats:', error);
    return { data: null, error };
  }
};

/**
 * Obtiene productos con análisis de stock
 */
export const getProductsWithAnalytics = async () => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    // Agregar análisis de stock
    const productsWithAnalytics = data?.map(product => ({
      ...product,
      stockStatus: product.stock < 10 ? 'critical' : product.stock < 50 ? 'low' : 'normal',
      needsReorder: product.stock < 50
    }));

    return { data: productsWithAnalytics, error: null };
  } catch (error) {
    console.error('Error fetching products with analytics:', error);
    return { data: [], error };
  }
};

/**
 * Obtiene ventas por período
 */
export const getSalesByPeriod = async (startDate, endDate) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('final_amount, order_date, status')
      .gte('order_date', startDate)
      .lte('order_date', endDate)
      .eq('status', 'delivered')
      .order('order_date', { ascending: true });

    if (error) throw error;

    // Agrupar por día
    const dailySales = {};
    data?.forEach(order => {
      const date = order.order_date.split('T')[0];
      if (!dailySales[date]) {
        dailySales[date] = {
          date,
          sales: 0,
          orders: 0
        };
      }
      dailySales[date].sales += order.final_amount || 0;
      dailySales[date].orders += 1;
    });

    const chartData = Object.values(dailySales);

    return { data: chartData, error: null };
  } catch (error) {
    console.error('Error fetching sales by period:', error);
    return { data: [], error };
  }
};

/**
 * Obtiene análisis de ventas por producto en un período
 */
export const getProductSalesAnalytics = async (startDate, endDate) => {
  try {
    console.log('[getProductSalesAnalytics] Buscando ventas desde', startDate, 'hasta', endDate);

    // Primero obtener IDs de pedidos válidos en el período
    const { data: validOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .gte('order_date', startDate)
      .lte('order_date', endDate)
      .in('status', ['delivered', 'completed', 'shipped', 'processing']);

    if (ordersError) {
      console.error('[getProductSalesAnalytics] Error fetching orders:', ordersError);
      return { data: [], error: ordersError };
    }

    if (!validOrders || validOrders.length === 0) {
      console.log('[getProductSalesAnalytics] No hay pedidos en este período');
      return { data: [], error: null };
    }

    const orderIds = validOrders.map(o => o.id);
    console.log('[getProductSalesAnalytics] Pedidos válidos encontrados:', orderIds.length);

    // Ahora obtener los items de esos pedidos
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity, total_price')
      .in('order_id', orderIds);

    if (itemsError) {
      console.error('[getProductSalesAnalytics] Error fetching order items:', itemsError);
      return { data: [], error: itemsError };
    }

    if (!orderItems || orderItems.length === 0) {
      console.log('[getProductSalesAnalytics] No hay items de pedidos');
      return { data: [], error: null };
    }

    console.log('[getProductSalesAnalytics] Items obtenidos:', orderItems.length);

    // Agrupar por producto
    const productStats = {};

    orderItems.forEach(item => {
      const productName = item.product_name || `Producto ${item.product_id}`;

      if (!productStats[productName]) {
        productStats[productName] = {
          product_name: productName,
          quantity_sold: 0,
          total_sales: 0
        };
      }

      productStats[productName].quantity_sold += parseInt(item.quantity || 0);
      productStats[productName].total_sales += parseFloat(item.total_price || 0);
    });

    // Convertir a array y ordenar por ventas totales
    const chartData = Object.values(productStats)
      .sort((a, b) => b.total_sales - a.total_sales)
      .map(p => ({
        ...p,
        total_sales: parseFloat(p.total_sales.toFixed(2))
      }));

    console.log('[getProductSalesAnalytics] Productos procesados:', chartData.length);
    console.log('[getProductSalesAnalytics] Top 5 productos:', chartData.slice(0, 5));

    return { data: chartData, error: null };
  } catch (error) {
    console.error('[getProductSalesAnalytics] Error general:', error);
    return { data: [], error };
  }
};

/**
 * Suscribirse a cambios en pedidos
 */
export const subscribeToOrders = (callback) => {
  return supabase
    .channel('orders_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'orders' },
      callback
    )
    .subscribe();
};

/**
 * Suscribirse a cambios en productos
 */
export const subscribeToProducts = (callback) => {
  return supabase
    .channel('products_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'products' },
      callback
    )
    .subscribe();
};

/**
 * Suscribirse a cambios en perfiles
 */
export const subscribeToProfiles = (callback) => {
  return supabase
    .channel('profiles_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'profiles' },
      callback
    )
    .subscribe();
};

