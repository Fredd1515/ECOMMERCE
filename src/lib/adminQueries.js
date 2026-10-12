// =====================================================
// CONSULTAS EN TIEMPO REAL PARA ADMINISTRADOR
// =====================================================

import { supabase } from './customSupabaseClient';
import {
  getWarehouseDashboardMetrics,
  getWarehouseSalesChartData,
  getWarehouseProductSales,
  getWarehouseCustomerAnalytics,
  getWarehouseOrders,
  getWarehouseOrderStats
} from './warehouseAnalytics';

export const getDashboardMetrics = async () => {
  return getWarehouseDashboardMetrics();
};

/**
 * Obtiene datos de ventas por mes para gráficos
 */
export const getSalesChartData = async (months = 6) => {
  return getWarehouseSalesChartData(months);
};

/**
 * Obtiene top productos más vendidos con datos reales
 */
export const getTopProducts = async (limit = 10) => {
  const { data, error, source } = await getWarehouseProductSales();
  return {
    data: (data || []).slice(0, limit).map((product) => ({
      product_id: product.product_key,
      product_name: product.product_name,
      category_name: product.category_name,
      total_revenue: product.total_sales,
      times_sold: product.orders,
      total_quantity: product.quantity_sold
    })),
    error,
    source
  };
};

/**
 * Obtiene análisis de clientes con datos reales
 */
export const getCustomerAnalytics = async (limit = 50) => {
  return getWarehouseCustomerAnalytics(limit);
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
  return getWarehouseOrders();
};

/**
 * Obtiene estadísticas de pedidos por estado
 */
export const getOrderStats = async () => {
  return getWarehouseOrderStats();
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
  return getWarehouseProductSales(startDate, endDate);
};

/**
 * Obtiene análisis de ventas por producto en un período
 */
export const getProductSalesAnalytics = async (startDate, endDate) => {
  return getWarehouseProductSales(startDate, endDate);
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

