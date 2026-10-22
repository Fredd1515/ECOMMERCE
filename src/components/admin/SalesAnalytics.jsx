import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Download, RefreshCw, BarChart3, CalendarDays } from 'lucide-react';
import { Button, toast } from '@/components/ui';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  getSalesByPeriod,
  getDailySalesByPeriod
} from '@/lib/adminQueries';
import { supabase } from '@/lib/customSupabaseClient';

const SalesAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [dailyRange, setDailyRange] = useState('7');
  const [salesData, setSalesData] = useState([]);
  const [dailySales, setDailySales] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dataSource, setDataSource] = useState('');

  useEffect(() => {
    loadSalesData();
    loadDailySales();

    // Refresca la vista cuando una confirmación de pago crea o actualiza
    // registros en fact_sales, sin depender de recargar el navegador.
    const channel = supabase
      .channel(`sales-analytics-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fact_sales' },
        () => {
          loadSalesData();
          loadDailySales();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadSalesData();
          loadDailySales();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => {
          loadSalesData();
          loadDailySales();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange, dailyRange]);

  const loadSalesData = async () => {
    setLoading(true);
    try {
      console.log('[SalesAnalytics] Cargando datos de ventas para rango:', dateRange);

      // Calcular fechas según el rango
      const daysBack = parseInt(dateRange.replace('d', '')) || 30;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const { data: salesAnalytics, error, source } = await getSalesByPeriod(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      setDataSource(source || 'fact_sales + dim_products');

      console.log('[SalesAnalytics] Datos recibidos:', {
        cantidad: salesAnalytics?.length || 0,
        error: error || 'ninguno'
      });

      if (error) {
        console.error('[SalesAnalytics] Error en getSalesByPeriod:', error);
      }

      if (salesAnalytics) {
        console.log('[SalesAnalytics] Estableciendo datos de ventas:', salesAnalytics);
        setSalesData(salesAnalytics);
      } else {
        console.log('[SalesAnalytics] No hay datos de ventas');
        setSalesData([]);
      }
    } catch (error) {
      console.error('Error loading sales data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos de ventas",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDailySales = async () => {
    setDailyLoading(true);
    try {
      const { data, error, source } = await getDailySalesByPeriod(Number(dailyRange));
      if (error) throw error;
      setDailySales(data || []);
      if (source) setDataSource(source);
    } catch (error) {
      console.error('Error loading daily sales:', error);
      setDailySales([]);
    } finally {
      setDailyLoading(false);
    }
  };

  const refreshSales = () => {
    loadSalesData();
    loadDailySales();
  };

  const dailyTotals = dailySales.reduce((totals, day) => ({
    sales: totals.sales + Number(day.sales || 0),
    orders: totals.orders + Number(day.orders || 0),
    quantity: totals.quantity + Number(day.quantitySold || 0)
  }), { sales: 0, orders: 0, quantity: 0 });

  const exportData = () => {
    if (salesData.length === 0) return;
    
    const csvContent = "data:text/csv;charset=utf-8,"
      + Object.keys(salesData[0] || {}).join(",") + "\n"
      + salesData.map(row => Object.values(row).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ventas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Análisis de Ventas</h2>
          <p className="text-gray-600 mt-1">Análisis detallado de ventas y productos · Fuente: {dataSource || 'fact_sales + dim_products'}</p>
        </div>

        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="90d">Últimos 90 días</option>
            <option value="1y">Último año</option>
          </select>

          <Button
            onClick={refreshSales}
            disabled={loading || dailyLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>


          {salesData.length > 0 && (
            <Button
              variant="outline"
              onClick={exportData}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar
            </Button>
          )}
        </div>
      </div>

      {/* Ventas del día y desglose por periodo */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-6 rounded-xl shadow-sm border"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{dailyRange === '1' ? 'Ventas del día' : 'Ventas por día'}</h3>
              <p className="text-sm text-gray-500 mt-1">Desglose actualizado de hoy y los últimos periodos.</p>
            </div>
          </div>
          <select
            value={dailyRange}
            onChange={(event) => setDailyRange(event.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
            aria-label="Periodo de ventas diarias"
          >
            <option value="1">Hoy</option>
            <option value="7">Últimos 7 días</option>
            <option value="14">Últimos 14 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
            <p className="text-xs text-emerald-700 font-semibold uppercase">Ventas</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">S/{dailyTotals.sales.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
            <p className="text-xs text-blue-700 font-semibold uppercase">Pedidos</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{dailyTotals.orders}</p>
          </div>
          <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">
            <p className="text-xs text-purple-700 font-semibold uppercase">Unidades</p>
            <p className="text-2xl font-bold text-purple-800 mt-1">{dailyTotals.quantity}</p>
          </div>
        </div>

        {dailyLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <RefreshCw className="w-7 h-7 animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dailySales}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value, name) => [
                name === 'sales' ? `S/${Number(value).toFixed(2)}` : value,
                name === 'sales' ? 'Ventas' : 'Pedidos'
              ]} />
              <Legend />
              <Bar dataKey="sales" fill="#10B981" name="Ventas (S/)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="orders" fill="#3B82F6" name="Pedidos" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white p-6 rounded-xl shadow-sm border"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Análisis Detallado de Ventas</h3>
        </div>
        {salesData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-gray-500">
            <BarChart3 className="w-16 h-16 mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">No hay ventas registradas</p>
            <p className="text-sm text-center mb-4 max-w-md">
              No se encontraron pedidos registrados en este rango de fechas.
              {dateRange === '7d' && ' Intenta cambiar el rango de fechas a "Últimos 30 días" o más.'}
            </p>
            <p className="text-xs text-gray-400">
              Se muestran todos los pedidos registrados (solo se excluyen los cancelados).
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4 text-sm text-gray-600">
              <span className="font-medium">{salesData.length} producto(s) vendido(s)</span> en {dateRange === '7d' ? 'los últimos 7 días' : dateRange === '30d' ? 'los últimos 30 días' : dateRange === '90d' ? 'los últimos 90 días' : 'el último año'}
              <span className="text-xs text-gray-500 ml-2">(Todos los pedidos registrados)</span>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="product_name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantity_sold" fill="#3B82F6" name="Cantidad Vendida" />
                <Bar dataKey="total_sales" fill="#10B981" name="Ventas Totales (S/)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SalesAnalytics;

