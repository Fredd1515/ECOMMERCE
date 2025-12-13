import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Download, RefreshCw, BarChart3 } from 'lucide-react';
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
  getSalesByPeriod
} from '@/lib/adminQueries';

const SalesAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [salesData, setSalesData] = useState([]);

  useEffect(() => {
    loadSalesData();
  }, [dateRange]);

  const loadSalesData = async () => {
    setLoading(true);
    try {
      console.log('[SalesAnalytics] Cargando datos de ventas para rango:', dateRange);

      // Calcular fechas según el rango
      const daysBack = parseInt(dateRange.replace('d', '')) || 30;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const { data: salesAnalytics, error } = await getSalesByPeriod(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

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
          <p className="text-gray-600 mt-1">Análisis detallado de ventas y productos</p>
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
            onClick={loadSalesData}
            disabled={loading}
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

