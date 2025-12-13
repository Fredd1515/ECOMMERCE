import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, RefreshCw, Download, Mail, TrendingUp, ShoppingBag, DollarSign, UserCheck } from 'lucide-react';
import { Button, toast } from '@/components/ui';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { getCustomerAnalytics } from '@/lib/adminQueries';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

const CustomersManagement = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customerSegments, setCustomerSegments] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await getCustomerAnalytics(50);
      if (data) {
        setCustomers(data);
        processCustomerData(data);
      }

      toast({
        title: "Datos actualizados",
        description: "Clientes actualizados correctamente."
      });
    } catch (error) {
      console.error('Error loading customers:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const processCustomerData = (data) => {
    // Segmentar clientes por nivel de gasto
    const segments = [
      { name: 'VIP', value: data.filter(c => c.total_spent > 500).length, color: '#10B981' },
      { name: 'Premium', value: data.filter(c => c.total_spent >= 200 && c.total_spent <= 500).length, color: '#3B82F6' },
      { name: 'Regular', value: data.filter(c => c.total_spent >= 100 && c.total_spent < 200).length, color: '#F59E0B' },
      { name: 'Nuevos', value: data.filter(c => c.total_spent < 100).length, color: '#EF4444' }
    ];
    setCustomerSegments(segments);

    // Top 10 clientes - solo números
    const top = [...data]
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10)
      .map((c, index) => ({
        id: `#${index + 1}`,
        spent: c.total_spent,
        orders: c.total_orders
      }));
    setTopCustomers(top);
  };

  const exportCustomers = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Nombre,Email,Total Pedidos,Total Gastado\n"
      + customers.map(customer =>
          `${customer.full_name},${customer.email},${customer.total_orders},${customer.total_spent}`
        ).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clientes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Análisis de Clientes</h2>
          <p className="text-gray-600 mt-1">Estadísticas y comportamiento de tus clientes</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={loadCustomers}
            variant="outline"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            onClick={exportCustomers}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl shadow-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Total Clientes</p>
              <p className="text-3xl font-bold mt-1">{customers.length}</p>
            </div>
            <Users className="w-12 h-12 text-blue-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-xl shadow-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Pedidos Totales</p>
              <p className="text-3xl font-bold mt-1">
                {customers.reduce((sum, c) => sum + (c.total_orders || 0), 0)}
              </p>
            </div>
            <ShoppingBag className="w-12 h-12 text-green-200" />
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
              <p className="text-purple-100 text-sm">Ingresos Totales</p>
              <p className="text-3xl font-bold mt-1">
                S/{customers.reduce((sum, c) => sum + (c.total_spent || 0), 0).toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-purple-200" />
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
              <p className="text-orange-100 text-sm">Promedio por Cliente</p>
              <p className="text-3xl font-bold mt-1">
                S/{customers.length > 0
                  ? (customers.reduce((sum, c) => sum + (c.total_spent || 0), 0) / customers.length).toFixed(2)
                  : '0.00'
                }
              </p>
            </div>
            <TrendingUp className="w-12 h-12 text-orange-200" />
          </div>
        </motion.div>
      </div>

      {/* Gráficos de Análisis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Segmentación de Clientes */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white p-6 rounded-xl shadow-sm border"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Segmentación de Clientes</h3>
            <p className="text-sm text-gray-500 mt-1">Distribución por nivel de gasto</p>
          </div>
          {customerSegments.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={customerSegments}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ value }) => value > 0 ? value : ''}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {customerSegments.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} clientes`, 'Total']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-700">VIP (&gt;S/500)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm text-gray-700">Premium (S/200-500)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-sm text-gray-700">Regular (S/100-200)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-700">Nuevos (&lt;S/100)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              <p>No hay datos suficientes para mostrar</p>
            </div>
          )}
        </motion.div>

        {/* Top 10 Clientes */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white p-6 rounded-xl shadow-sm border"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Top 10 Mejores Clientes</h3>
            <p className="text-sm text-gray-500 mt-1">Ordenados por gasto total</p>
          </div>
          {topCustomers.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCustomers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="id"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  formatter={(value, name) => {
                    if (name === 'spent') return [`S/${value.toFixed(2)}`, 'Total Gastado'];
                    return [`${value}`, 'Pedidos'];
                  }}
                />
                <Bar dataKey="spent" fill="#10B981" name="spent" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              <p>No hay datos suficientes para mostrar</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default CustomersManagement;

