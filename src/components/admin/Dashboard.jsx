import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Package, Users, DollarSign, RefreshCw, BarChart3, Sparkles, ShoppingBag, AlertTriangle, Radio, Clock3 } from 'lucide-react';
import { Button, toast, Pagination } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { getDashboardMetrics, getSalesChartData, getTopProducts, subscribeToDashboardChanges } from '@/lib/adminQueries';
import { supabase } from '@/lib/customSupabaseClient';

const ALGORITHM_EXPLANATIONS = {
  random_forest: 'Combina muchos árboles de decisión y promedia sus resultados. Captura relaciones no lineales y suele ser resistente a valores atípicos.',
  gradient_boosting: 'Construye árboles de forma secuencial; cada árbol corrige errores del anterior. Puede detectar cambios sutiles de demanda, pero requiere un ajuste cuidadoso.',
  extra_trees: 'Usa árboles muy aleatorizados para reducir la variabilidad del modelo. Es robusto y rápido, aunque puede perder precisión cuando el patrón es principalmente lineal.',
  hist_gradient_boosting: 'Es una variante optimizada de Gradient Boosting que agrupa los valores en histogramas. Mantiene la capacidad no lineal y escala mejor con más datos.',
  ridge: 'Es una regresión lineal con regularización. Es estable, interpretable y ayuda a controlar la multicolinealidad entre variables de calendario y retardos.'
};

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
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const refreshTimerRef = useRef(null);

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
  const modelDrivers = (mlInsights?.explicabilidad_modelo?.variables_principales || []).slice(0, 5);
  const modelMetrics = mlInsights?.metricas_modelo_ml || {};
  const hasModelMetrics = ['mae', 'rmse', 'r2'].every((metric) => Number.isFinite(Number(modelMetrics[metric])));
  const algorithmComparison = mlInsights?.algoritmos_comparacion || [];
  const selectedAlgorithm = mlInsights?.algoritmo_seleccionado || modelMetrics?.algorithm || 'Pendiente de seleccionar';
  const algorithmChartData = algorithmComparison.map((algorithm) => ({
    name: algorithm.name || algorithm.key,
    mae: Number.isFinite(Number(algorithm.mae)) ? Number(algorithm.mae) : null,
    rmse: Number.isFinite(Number(algorithm.rmse)) ? Number(algorithm.rmse) : null,
    r2: Number.isFinite(Number(algorithm.r2)) ? Number(algorithm.r2) : null,
    selected: Boolean(algorithm.selected)
  }));
  const selectedComparison = algorithmComparison.find((algorithm) => algorithm.selected)
    || algorithmComparison.find((algorithm) => algorithm.name === selectedAlgorithm);
  const selectedMae = Number(selectedComparison?.mae ?? modelMetrics.mae);
  const selectedRmse = Number(selectedComparison?.rmse ?? modelMetrics.rmse);
  const selectedR2 = Number(selectedComparison?.r2 ?? modelMetrics.r2);
  const hasSelectedMetrics = [selectedMae, selectedRmse, selectedR2].every(Number.isFinite);
  useEffect(() => {
    loadDashboardData({ notify: true });
    loadMlInsights();

    const scheduleRealtimeRefresh = () => {
      setRealtimeStatus('UPDATING');
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(async () => {
        await loadDashboardData({ showLoading: false });
        await loadMlInsights();
        setRealtimeStatus('SUBSCRIBED');
      }, 350);
    };

    const dashboardChannel = subscribeToDashboardChanges(
      scheduleRealtimeRefresh,
      (status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('POLLING');
        }
      }
    );

    // Fallback para instalaciones donde Realtime aún no fue habilitado en la
    // publicación de PostgreSQL. La UI sigue sincronizada sin intervención.
    const fallbackRefresh = window.setInterval(() => {
      loadDashboardData({ showLoading: false });
      loadMlInsights();
    }, 60000);

    return () => {
      window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(fallbackRefresh);
      supabase.removeChannel(dashboardChannel);
    };
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

  const loadDashboardData = async ({ showLoading = true, notify = false } = {}) => {
    if (showLoading) setLoading(true);
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
      setLastSyncAt(new Date());

      if (notify) {
        toast({
          title: "Datos actualizados",
          description: `KPIs sincronizados desde ${metricsResult.source || 'el data warehouse'}.`
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setDataError('No se pudieron leer los datos reales. Verifica el acceso a orders, profiles, fact_sales y las tablas del data warehouse.');
      // En una actualización de fondo conservamos los últimos datos válidos.
      if (showLoading) {
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
      }
    } finally {
      if (showLoading) setLoading(false);
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
            <span className={`${mlInsights ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-gray-100 text-gray-600 border-gray-200'} text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 border`}>
              <Sparkles className={`w-3 h-3 ${mlInsights ? 'text-purple-600' : 'text-gray-500'}`} />
              {mlInsights ? 'ML Sincronizado' : 'ML cargando'}
            </span>
          </div>
          <p className="text-gray-600 mt-1">Resumen general y pronósticos de Machine Learning · {mlInsights?.kpis_generales?.periodo_analizado}</p>
          <p className="text-xs text-gray-500 mt-1">Fuente de KPIs: {dashboardMetrics.source || 'orders + profiles + fact_sales'}</p>
        </div>
        <Button
          onClick={async () => {
            await loadDashboardData({ notify: true });
            await loadMlInsights();
          }}
          variant="outline"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
          realtimeStatus === 'SUBSCRIBED'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : realtimeStatus === 'UPDATING'
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          <Radio className={`h-3.5 w-3.5 ${realtimeStatus === 'UPDATING' ? 'animate-pulse' : ''}`} />
          {realtimeStatus === 'SUBSCRIBED' ? 'Tiempo real conectado' : realtimeStatus === 'UPDATING' ? 'Sincronizando venta…' : 'Sincronización automática'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
          Última actualización: {lastSyncAt ? lastSyncAt.toLocaleTimeString('es-PE') : '—'}
        </span>
        <span>Escucha fact_sales, pedidos y productos · respaldo cada 60 s</span>
      </div>

      {dataError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {dataError}
        </div>
      )}

      {/* Métricas de calidad del modelo ML */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Métricas del modelo de Machine Learning</h3>
            <p className="text-xs text-gray-500 mt-1">
              {selectedAlgorithm} · validación temporal 80/20 · valores obtenidos del último entrenamiento
            </p>
          </div>
          <span className={`text-xs font-semibold ${hasModelMetrics ? 'text-emerald-700' : 'text-amber-700'}`}>
            {hasModelMetrics ? '✓ Métricas disponibles' : 'Pendiente de entrenar'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'MAE', value: modelMetrics.mae, description: 'Error absoluto medio (uds.)', color: 'text-purple-700' },
            { label: 'RMSE', value: modelMetrics.rmse, description: 'Error cuadrático medio (uds.)', color: 'text-indigo-700' },
            { label: 'R²', value: modelMetrics.r2, description: 'Capacidad explicativa', color: 'text-blue-700' },
          ].map((metric) => (
            <div key={metric.label} className="rounded-lg border border-white bg-white/80 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{metric.label}</span>
                <span className={`text-2xl font-bold ${metric.color}`}>
                  {Number.isFinite(Number(metric.value)) ? Number(metric.value).toFixed(3) : '—'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">{metric.description}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Comparación reproducible de los cinco algoritmos de pronóstico */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-sky-100 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Comparación de 5 algoritmos</h3>
            <p className="mt-1 max-w-3xl text-xs text-gray-500">
              Todos se entrenaron con las mismas variables y la misma validación temporal 80/20. Se elige automáticamente el menor MAE; en caso de empate, el menor RMSE.
            </p>
          </div>
          <span className="mt-1 inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
            Seleccionado: {selectedAlgorithm}
          </span>
        </div>

        {algorithmComparison.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
            La comparación estará disponible después de ejecutar el pipeline de ML actualizado.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/80 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-3">Algoritmo</th>
                  <th className="px-3 py-3 text-right">MAE ↓</th>
                  <th className="px-3 py-3 text-right">RMSE ↓</th>
                  <th className="px-3 py-3 text-right">R² ↑</th>
                  <th className="px-3 py-3">Por qué se usa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {algorithmComparison.map((algorithm) => (
                  <tr key={algorithm.key || algorithm.name} className={algorithm.selected ? 'bg-emerald-50/70' : ''}>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold text-gray-900">{algorithm.name}</div>
                      <div className="text-[11px] text-gray-500">{algorithm.family}</div>
                      {algorithm.selected && <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">MEJOR RESULTADO</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-purple-700">{Number.isFinite(Number(algorithm.mae)) ? Number(algorithm.mae).toFixed(3) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-indigo-700">{Number.isFinite(Number(algorithm.rmse)) ? Number(algorithm.rmse).toFixed(3) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-blue-700">{Number.isFinite(Number(algorithm.r2)) ? Number(algorithm.r2).toFixed(3) : '—'}</td>
                    <td className="max-w-md px-3 py-3 text-xs leading-5 text-gray-600">{algorithm.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      {/* Gráfico estadístico de calidad del modelo ML */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Gráfico estadístico del modelo</h3>
            <p className="mt-1 text-xs text-gray-500">
              Comparación visual de los errores de predicción y la capacidad explicativa de cada algoritmo.
              En MAE y RMSE, un valor menor es mejor; en R², un valor mayor es mejor.
            </p>
          </div>
          <span className="mt-1 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            Mejor modelo: {selectedAlgorithm}
          </span>
        </div>

        {algorithmChartData.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
            No hay métricas suficientes para construir el gráfico. Ejecuta el pipeline de ML y vuelve a actualizar.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Errores de predicción</h4>
              <div className="h-80" role="img" aria-label="Comparación de MAE y RMSE por algoritmo">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={algorithmChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(value) => Number(value).toFixed(2)} />
                    <YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value, name) => [Number(value).toFixed(3), name]} />
                    <Legend />
                    <Bar dataKey="mae" name="MAE ↓" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="rmse" name="RMSE ↓" fill="#4F46E5" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Capacidad explicativa (R²)</h4>
              <div className="h-80" role="img" aria-label="Comparación de R2 por algoritmo">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={algorithmChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={['auto', 'auto']} tickFormatter={(value) => Number(value).toFixed(2)} />
                    <YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 11 }} />
                    <ReferenceLine x={0} stroke="#9CA3AF" />
                    <Tooltip formatter={(value) => [Number(value).toFixed(3), 'R²']} />
                    <Bar dataKey="r2" name="R² ↑" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-gray-100 pt-5">
          <h4 className="text-sm font-semibold text-gray-800">¿Qué hace cada algoritmo?</h4>
          <p className="mt-1 text-xs text-gray-500">
            Resumen práctico para interpretar la comparación del pronóstico de demanda.
          </p>

          {algorithmComparison.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {algorithmComparison.map((algorithm) => (
                <div
                  key={algorithm.key || algorithm.name}
                  className={`rounded-lg border p-4 ${algorithm.selected ? 'border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200' : 'border-gray-100 bg-gray-50/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="font-semibold text-gray-900">{algorithm.name}</h5>
                      <p className="text-[11px] text-gray-500">{algorithm.family}</p>
                    </div>
                    {algorithm.selected && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        ELEGIDO
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-600">
                    {ALGORITHM_EXPLANATIONS[algorithm.key] || algorithm.reason || 'Algoritmo de pronóstico evaluado por el pipeline.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-gray-500">
                    <span>MAE: {Number.isFinite(Number(algorithm.mae)) ? Number(algorithm.mae).toFixed(3) : '—'}</span>
                    <span>RMSE: {Number.isFinite(Number(algorithm.rmse)) ? Number(algorithm.rmse).toFixed(3) : '—'}</span>
                    <span>R²: {Number.isFinite(Number(algorithm.r2)) ? Number(algorithm.r2).toFixed(3) : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-indigo-900">
            <p className="font-semibold">¿Por qué se escogió {selectedAlgorithm}?</p>
            <p className="mt-1 text-xs leading-5 text-indigo-800">
              El pipeline selecciona primero el menor MAE y usa el menor RMSE como desempate. En esta ejecución,
              {hasSelectedMetrics
                ? ` ${selectedAlgorithm} obtuvo MAE ${selectedMae.toFixed(3)}, RMSE ${selectedRmse.toFixed(3)} y R² ${selectedR2.toFixed(3)}.`
                : ' sus métricas todavía no están disponibles.'}
              {' '}{selectedComparison?.reason || 'Por eso se utiliza para generar el pronóstico de demanda a 7, 15 y 30 días.'}
            </p>
          </div>
        </div>
      </motion.section>

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
              <p className="text-xs text-green-200 mt-1">Pedidos y ventas en vivo · {dashboardMetrics.totalOrders.toLocaleString()} pedidos</p>
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
              <p className="text-xs text-orange-200 mt-1">profiles + dim_customers</p>
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
            <p className="text-xs text-gray-500 mt-0.5">Ventas y pedidos agrupados desde orders + fact_sales</p>
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
          <p className="text-xs text-gray-500 mt-1">Pedidos y ventas actuales</p>
        </div>
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Utilidad acumulada</p>
          <p className="text-3xl font-bold text-emerald-700 mt-1">S/ {Number(dashboardMetrics.totalProfit || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">Fact_sales y pedidos procesados</p>
        </div>
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Descuentos aplicados</p>
          <p className="text-3xl font-bold text-amber-700 mt-1">S/ {Number(dashboardMetrics.totalDiscounts || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">Descuentos registrados</p>
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
          <p className="text-xs text-gray-500 mt-1">Ranking real de orders + fact_sales</p>
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

      {/* Explicabilidad global del modelo */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm border p-5"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">¿Qué variables influyen en el pronóstico?</h3>
            <p className="text-xs text-gray-500 mt-1">
              Importancia global del algoritmo seleccionado; indica utilidad predictiva, no causalidad.
            </p>
          </div>
          <BarChart3 className="w-5 h-5 text-purple-500 shrink-0" />
        </div>
        {modelDrivers.length === 0 ? (
          <p className="text-sm text-gray-500">La explicabilidad estará disponible después de volver a entrenar el modelo.</p>
        ) : (
          <div className="space-y-3">
            {modelDrivers.map((driver) => (
              <div key={driver.feature}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700">{driver.label || driver.feature}</span>
                  <span className="font-semibold text-purple-700">{driver.importance_pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                    style={{ width: `${Math.min(Number(driver.importance_pct || 0), 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

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
                {selectedAlgorithm}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Predicciones calculadas por {selectedAlgorithm} para reposición y compras (MAE: {mlInsights?.metricas_modelo_ml?.mae ?? '—'} uds). No reemplazan los KPIs reales.
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
              {paginatedForecasts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-sm text-gray-500">
                    No hay pronósticos disponibles. Ejecuta el pipeline de ML y vuelve a desplegar los insights.
                  </td>
                </tr>
              ) : paginatedForecasts.map((prod) => (
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
