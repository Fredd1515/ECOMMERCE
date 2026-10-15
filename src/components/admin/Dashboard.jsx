import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Package, Users, DollarSign, RefreshCw, BarChart3, Sparkles, ShoppingBag, AlertTriangle } from 'lucide-react';
import { Button, toast, Pagination } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getDashboardMetrics, getSalesChartData, getTopProducts } from '@/lib/adminQueries';
import { supabase } from '@/lib/customSupabaseClient';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [dashboardMetrics, setDashboardMetrics] = useState({
    totalSales: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    lowStockProducts: null,
    averageOrderValue: 0,
    totalQuantitySold: 0,
    totalProfit: 0,
    totalDiscounts: 0,
    inventorySource: '',
    source: ''
  });
  const [salesChartData, setSalesChartData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [mlInsights, setMlInsights] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Lista de pronósticos por producto obtenidos del modelo de ML
  const forecastList = Object.entries(mlInsights?.pronostico_demanda_30_dias || {}).map(([name, data]) => ({
    name,
    ...data
  }));

  const PAGE_SIZE = 10;
  const paginatedForecasts = forecastList.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Clientes segmentados por ML
  const segResumen = mlInsights?.segmentacion_clientes?.resumen || {};
  const totalVIP = segResumen['Cliente VIP / Champion'] || 0;
  const totalRiesgo = segResumen['En Riesgo de Abandono (Churn)'] || 0;
  const totalLeales = segResumen['Cliente Leal / Frecuente'] || 0;
  useEffect(() => {
    loadDashboardData();
    loadMlInsights();
  }, []);

  const loadMlInsights = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/ml-insights', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.ok) setMlInsights(await response.json());
    } catch (error) {
      console.error('Error loading protected ML insights:', error);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setDataError('');
    try {
      const [metricsResult, chartResult, topProductsResult] = await Promise.all([
        getDashboardMetrics(),
        getSalesChartData(12),
        getTopProducts(5)
      ]);
      if (metricsResult.error) throw metricsResult.error;
      if (chartResult.error) throw chartResult.error;
      if (topProductsResult.error) throw topProductsResult.error;

      setDashboardMetrics(metricsResult.data || {
        totalSales: 0,
        totalOrders: 0,
        totalProducts: 0,
        totalCustomers: 0,
        lowStockProducts: null,
        averageOrderValue: 0,
        totalQuantitySold: 0,
        totalProfit: 0,
        totalDiscounts: 0,
        inventorySource: '',
        source: ''
      });
      setSalesChartData(chartResult.data || []);
      setTopProducts(topProductsResult.data || []);

      toast({
        title: "Datos actualizados",
        description: `KPIs sincronizados desde ${metricsResult.source || 'el data warehouse'}.`
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setDataError('No se pudieron leer los datos reales del data warehouse. Verifica el acceso a fact_sales, dim_customers y dim_products.');
      setDashboardMetrics({
        totalSales: 0,
        totalOrders: 0,
        totalProducts: 0,
        totalCustomers: 0,
        lowStockProducts: null,
        averageOrderValue: 0,
        totalQuantitySold: 0,
        totalProfit: 0,
        totalDiscounts: 0,
        inventorySource: '',
        source: ''
      });
      setSalesChartData([]);
      setTopProducts([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando métricas y modelo ML...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
            <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-purple-200">
              <Sparkles className="w-3 h-3 text-purple-600" /> ML Sincronizado
            </span>
          </div>
          <p className="text-gray-600 mt-1">Resumen general y pronósticos de Machine Learning · {mlInsights?.kpis_generales?.periodo_analizado}</p>
          <p className="text-xs text-gray-500 mt-1">Fuente de KPIs: {dashboardMetrics.source || 'fact_sales + dim_customers + dim_products'}</p>
        </div>
        <Button
          onClick={loadDashboardData}
          variant="outline"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {dataError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {dataError}
        </div>
      )}

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-xl shadow-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Ventas Totales</p>
              <p className="text-3xl font-bold mt-1">S/{dashboardMetrics.totalSales.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-green-200 mt-1">Desde fact_sales · {dashboardMetrics.totalOrders.toLocaleString()} pedidos</p>
            </div>
            <DollarSign className="w-12 h-12 text-green-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl shadow-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Total Pedidos</p>
              <p className="text-3xl font-bold mt-1">{dashboardMetrics.totalOrders.toLocaleString()}</p>
              <p className="text-xs text-blue-200 mt-1">Ticket medio real: S/ {Number(dashboardMetrics.averageOrderValue || 0).toFixed(2)}</p>
            </div>
            <ShoppingBag className="w-12 h-12 text-blue-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-xl shadow-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Total Productos</p>
              <p className="text-3xl font-bold mt-1">{dashboardMetrics.totalProducts}</p>
              <p className="text-xs text-purple-200 mt-1">Registrados en dim_products</p>
            </div>
            <Package className="w-12 h-12 text-purple-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-xl shadow-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm">Clientes Analizados</p>
              <p className="text-3xl font-bold mt-1">{dashboardMetrics.totalCustomers.toLocaleString()}</p>
              <p className="text-xs text-orange-200 mt-1">Registrados en dim_customers</p>
            </div>
            <Users className="w-12 h-12 text-orange-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-xl shadow-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">Stock Bajo</p>
              <p className="text-3xl font-bold mt-1">{dashboardMetrics.lowStockProducts === null ? '—' : dashboardMetrics.lowStockProducts.toLocaleString()}</p>
              <p className="text-xs text-red-200 mt-1">{dashboardMetrics.inventorySource || 'Requiere fact_inventory'}</p>
            </div>
            <AlertTriangle className="w-12 h-12 text-red-200" />
          </div>
        </motion.div>
      </div>

      {/* Gráfico de ventas */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white p-6 rounded-xl shadow-sm border"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Evolución de Ventas por Mes</h3>
            <p className="text-xs text-gray-500 mt-0.5">Ventas agrupadas directamente desde fact_sales</p>
          </div>
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> Histórico 2024
          </span>
        </div>
        {salesChartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">
            No hay registros disponibles para graficar.
          </div>
        ) : (
            <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salesChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name) => [
                name === 'sales' ? `S/${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : value,
                name === 'sales' ? 'Ventas (S/)' : 'Pedidos'
              ]}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Legend />
            <Bar dataKey="sales" fill="#10B981" name="Ventas (S/)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="orders" fill="#3B82F6" name="Pedidos" radius={[4, 4, 0, 0]} />
          </BarChart>
            </ResponsiveContainer>
        )}
      </motion.div>

      {/* Indicadores derivados de fact_sales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unidades vendidas</p>
          <p className="text-3xl font-bold text-blue-700 mt-1">{Number(dashboardMetrics.totalQuantitySold || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">SUM(quantity_sold)</p>
        </div>
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Utilidad acumulada</p>
          <p className="text-3xl font-bold text-emerald-700 mt-1">S/ {Number(dashboardMetrics.totalProfit || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">SUM(profit_amount)</p>
        </div>
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Descuentos aplicados</p>
          <p className="text-3xl font-bold text-amber-700 mt-1">S/ {Number(dashboardMetrics.totalDiscounts || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">SUM(discount_amount)</p>
        </div>
      </div>

      {/* Productos líderes */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm border overflow-hidden"
      >
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Productos líderes por ingresos</h3>
          <p className="text-xs text-gray-500 mt-1">Ranking real de fact_sales unido con dim_products</p>
        </div>
        {topProducts.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No hay ventas disponibles para calcular el ranking.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80">
                <tr className="text-xs font-semibold uppercase text-gray-500">
                  <th className="px-5 py-3 text-left">Producto</th>
                  <th className="px-5 py-3 text-left">Categoría</th>
                  <th className="px-5 py-3 text-right">Unidades</th>
                  <th className="px-5 py-3 text-right">Pedidos</th>
                  <th className="px-5 py-3 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topProducts.map((product) => (
                  <tr key={product.product_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{product.product_name}</td>
                    <td className="px-5 py-3 text-gray-500">{product.category_name || '—'}</td>
                    <td className="px-5 py-3 text-right">{Number(product.total_quantity || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">{Number(product.times_sold || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-700">S/ {Number(product.total_revenue || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Segmentación de clientes ML */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Clientes VIP / Champion', count: totalVIP, color: 'from-amber-400 to-amber-500', desc: 'Alta frecuencia y gasto' },
          { label: 'Clientes Leales', count: totalLeales, color: 'from-sky-400 to-sky-500', desc: 'Compradores regulares' },
          { label: 'En Riesgo de Churn', count: totalRiesgo, color: 'from-rose-400 to-rose-500', desc: 'Requieren re-engagement' },
        ].map((seg, i) => (
          <motion.div
            key={seg.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`bg-gradient-to-br ${seg.color} p-5 rounded-xl text-white shadow-md`}
          >
            <p className="text-white/80 text-xs font-medium uppercase tracking-wide">{seg.label}</p>
            <p className="text-4xl font-bold mt-1">{seg.count}</p>
            <p className="text-white/70 text-xs mt-1">{seg.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Lista de Pronósticos de Demanda por Producto (con Paginación de 10) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm border overflow-hidden"
      >
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">Pronóstico de Demanda y Ventas (Machine Learning)</h3>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Random Forest
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Predicciones calculadas por el modelo para reposición y compras (MAE: {mlInsights?.metricas_modelo_ml?.mae || 0.58} uds). No reemplazan los KPIs reales.
            </p>
          </div>
          <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
            Total productos: <span className="font-bold text-gray-800">{forecastList.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80">
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-left">Categoría</th>
                <th className="px-6 py-3 text-right">Precio Unit.</th>
                <th className="px-6 py-3 text-center">Demanda 7d</th>
                <th className="px-6 py-3 text-center">Demanda 15d</th>
                <th className="px-6 py-3 text-center">Demanda 30d</th>
                <th className="px-6 py-3 text-right">Ingreso Proyectado (30d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedForecasts.map((prod) => (
                <tr key={prod.name} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-6 py-3.5 font-medium text-gray-900">
                    {prod.name}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="bg-gray-100 text-gray-700 text-xs px-2.5 py-0.5 rounded-full">
                      {prod.category}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right font-semibold text-gray-800">
                    S/ {Number(prod.unit_price).toFixed(2)}
                  </td>
                  <td className="px-6 py-3.5 text-center font-bold text-blue-600">
                    ~{prod.projected_units_7d} uds
                  </td>
                  <td className="px-6 py-3.5 text-center font-bold text-indigo-600">
                    ~{prod.projected_units_15d} uds
                  </td>
                  <td className="px-6 py-3.5 text-center font-bold text-purple-600">
                    ~{prod.projected_units_30d} uds
                  </td>
                  <td className="px-6 py-3.5 text-right font-bold text-emerald-600">
                    S/ {Number(prod.projected_revenue_30d).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación de 10 por página */}
        <Pagination
          currentPage={currentPage}
          totalItems={forecastList.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </motion.div>
    </div>
  );
};

export default Dashboard;
