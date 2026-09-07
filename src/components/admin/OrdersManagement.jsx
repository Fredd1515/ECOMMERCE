import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Package, Clock, CheckCircle, Truck, XCircle,
  ChevronDown, ChevronUp, Search, Filter, Eye, AlertCircle
} from 'lucide-react';
import { Button, toast } from '@/components/ui';
import { getAllOrdersWithDetails, getOrderStats } from '@/lib/adminQueries';
import { updateOrderStatus } from '@/lib/datawarehouseQueries';

// ── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:    { label: 'Pendiente',   color: 'bg-amber-100 text-amber-800  border-amber-200',   dot: 'bg-amber-400',  icon: Clock       },
  processing: { label: 'Procesando',  color: 'bg-blue-100  text-blue-800   border-blue-200',    dot: 'bg-blue-400',   icon: Package     },
  shipped:    { label: 'En Camino',   color: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-400', icon: Truck       },
  delivered:  { label: 'Entregado',   color: 'bg-green-100 text-green-800  border-green-200',   dot: 'bg-green-400',  icon: CheckCircle },
  cancelled:  { label: 'Cancelado',   color: 'bg-red-100   text-red-800    border-red-200',     dot: 'bg-red-400',    icon: XCircle     },
};

const STATUS_FLOW = ['pending', 'processing', 'shipped', 'delivered'];

const getNextStatus = (status) => {
  const currentIndex = STATUS_FLOW.indexOf(status);
  return currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentIndex + 1]
    : null;
};

const PAYMENT_LABELS = { card: '💳 Tarjeta', yape: '📱 Yape/Plin', cash: '💵 Efectivo' };

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const StatusTimeline = ({ status }) => {
  const currentIndex = STATUS_FLOW.indexOf(status);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="text-xs font-bold text-gray-700 mb-3">Flujo del pedido</div>
      <div className="flex items-center">
        {STATUS_FLOW.map((step, index) => {
          const StepIcon = STATUS_CONFIG[step].icon;
          const completed = currentIndex >= index;
          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center min-w-[70px]">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${completed ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <StepIcon className="w-3.5 h-3.5" />
                </div>
                <span className={`text-[10px] mt-1 text-center ${completed ? 'text-blue-700 font-semibold' : 'text-gray-400'}`}>
                  {STATUS_CONFIG[step].label}
                </span>
              </div>
              {index < STATUS_FLOW.length - 1 && (
                <div className={`h-1 flex-1 mx-1 rounded-full ${currentIndex > index ? 'bg-blue-600' : 'bg-gray-100'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {status === 'cancelled' && (
        <p className="text-xs text-red-600 font-semibold mt-2">Este pedido fue cancelado.</p>
      )}
    </div>
  );
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

// ── Component ─────────────────────────────────────────────────────────────────
const OrdersManagement = ({ onUpdateOrder }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);        // which order is being saved
  const [expandedId, setExpandedId] = useState(null);    // expanded row
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [stats, setStats] = useState({ pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, totalRevenue: 0 });

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: ordersData }, { data: statsData }] = await Promise.all([
        getAllOrdersWithDetails(),
        getOrderStats()
      ]);
      if (ordersData) setOrders(ordersData);
      if (statsData)  setStats(statsData);
    } catch (err) {
      toast({ title: 'Error al cargar pedidos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // ── Handle status change ────────────────────────────────────────────────────
  const handleStatusChange = async (orderId, newStatus) => {
    setSavingId(orderId);

    // Optimistic update: change locally right away
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setStats(prev => {
      const oldOrder = orders.find(o => o.id === orderId);
      const oldStatus = oldOrder?.status;
      const updated = { ...prev };
      if (oldStatus && updated[oldStatus] !== undefined) updated[oldStatus] = Math.max(0, updated[oldStatus] - 1);
      if (updated[newStatus] !== undefined) updated[newStatus] += 1;
      return updated;
    });

    try {
      // Call Supabase directly for reliability
      const { error } = await updateOrderStatus(orderId, newStatus);
      if (error) throw error;

      // Also notify parent App.jsx so its state stays in sync
      if (onUpdateOrder) onUpdateOrder(orderId, { status: newStatus });

      toast({
        title: '✅ Estado actualizado',
        description: `Pedido actualizado a: ${STATUS_CONFIG[newStatus]?.label || newStatus}`,
      });
    } catch (err) {
      // Rollback optimistic update
      toast({ title: 'Error al guardar', description: err.message || 'No se pudo actualizar en la base de datos.', variant: 'destructive' });
      await loadOrders();
    } finally {
      setSavingId(null);
    }
  };

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    const matchSearch = !search
      || (o.customer_name || '').toLowerCase().includes(search.toLowerCase())
      || (o.customer_email || '').toLowerCase().includes(search.toLowerCase())
      || (o.order_code || o.id || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Pedidos</h2>
          <p className="text-gray-500 text-sm mt-0.5">{orders.length} pedidos registrados · {filtered.length} mostrados</p>
        </div>
        <Button onClick={loadOrders} variant="outline" disabled={loading} className="flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg], i) => {
          const Icon = cfg.icon;
          return (
            <motion.button
              key={key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => setFilterStatus(prev => prev === key ? 'all' : key)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                filterStatus === key ? `${cfg.color} shadow-md scale-[1.02]` : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">{cfg.label}</span>
                <Icon className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats[key] ?? 0}</p>
              {key === 'delivered' && stats.totalRevenue > 0 && (
                <p className="text-[10px] text-green-600 font-semibold mt-0.5">
                  S/{stats.totalRevenue.toFixed(2)} facturado
                </p>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, email o código de pedido…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-3" />
            <p>Cargando pedidos…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <AlertCircle className="w-10 h-10 mb-3 text-gray-300" />
            <p className="font-medium">No se encontraron pedidos</p>
            <p className="text-sm mt-1">Intenta ajustar el filtro o buscar otro término</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Pedido</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Pago</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estado Actual</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Cambiar Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((order, idx) => (
                  <React.Fragment key={order.id}>
                    <motion.tr
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className={`hover:bg-blue-50/30 transition-colors ${savingId === order.id ? 'opacity-60' : ''}`}
                    >
                      {/* Order ID */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-blue-700 bg-blue-50 rounded-lg px-2 py-0.5 inline-block">
                          {order.order_code || `#${order.id?.substring(0, 8)}`}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{(order.order_items?.length || 0)} ítem(s)</div>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-sm">{order.customer_name || 'Cliente'}</div>
                        <div className="text-[11px] text-gray-400 truncate max-w-[160px]">{order.customer_email}</div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">
                        {formatDate(order.created_at || order.order_date)}
                      </td>

                      {/* Payment Method */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-gray-600">{PAYMENT_LABELS[order.payment_method] || order.payment_method || '—'}</span>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        S/{(order.final_amount || 0).toFixed(2)}
                      </td>

                      {/* Current Status Badge */}
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={order.status} />
                      </td>

                      {/* Status Selector - THE ACTUAL EDITOR */}
                      <td className="px-4 py-3 text-center">
                        <div className="relative inline-block">
                          <select
                            value={order.status}
                            disabled={savingId === order.id}
                            onChange={e => handleStatusChange(order.id, e.target.value)}
                            className={`text-xs border-2 rounded-lg px-2 py-1.5 pr-6 outline-none cursor-pointer font-semibold transition-all ${
                              STATUS_CONFIG[order.status]?.color || 'border-gray-200 text-gray-700'
                            } focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-wait`}
                          >
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                          {savingId === order.id && (
                            <RefreshCw className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-blue-500" />
                          )}
                        </div>
                        {getNextStatus(order.status) && (
                          <button
                            type="button"
                            disabled={savingId === order.id}
                            onClick={() => handleStatusChange(order.id, getNextStatus(order.status))}
                            className="block mx-auto mt-1 text-[10px] font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
                          >
                            Avanzar a {STATUS_CONFIG[getNextStatus(order.status)].label}
                          </button>
                        )}
                      </td>

                      {/* Expand Details */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                          title="Ver detalle"
                        >
                          {expandedId === order.id ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </td>
                    </motion.tr>

                    {/* Expanded Detail Row */}
                    <AnimatePresence>
                      {expandedId === order.id && (
                        <motion.tr
                          key={`expanded-${order.id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={8} className="bg-blue-50/40 px-6 py-4">
                            <div className="mb-4">
                              <StatusTimeline status={order.status} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              {/* Items */}
                              <div>
                                <h4 className="font-bold text-gray-700 mb-2">🛍️ Productos del pedido</h4>
                                <div className="space-y-1">
                                  {(order.order_items || []).length === 0 ? (
                                    <p className="text-gray-400">Sin ítems registrados</p>
                                  ) : (
                                    order.order_items.map((item, i) => (
                                      <div key={i} className="flex justify-between bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                                        <span className="text-gray-700 font-medium">{item.product_name} × {item.quantity}</span>
                                        <span className="text-gray-500">S/{(item.total_price || 0).toFixed(2)}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* Order Info */}
                              <div className="space-y-1.5">
                                <h4 className="font-bold text-gray-700 mb-2">📦 Información de entrega</h4>
                                <div className="bg-white rounded-lg p-3 border border-gray-100 space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Dirección:</span>
                                    <span className="text-gray-800 font-medium text-right max-w-[200px]">{order.shipping_address || '—'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Subtotal:</span>
                                    <span className="text-gray-800">S/{(order.subtotal || 0).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Descuento:</span>
                                    <span className="text-green-600">-S/{(order.discount || 0).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Envío:</span>
                                    <span className="text-gray-800">S/{(order.shipping_cost || 0).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between border-t border-gray-100 pt-1 font-bold">
                                    <span className="text-gray-700">Total:</span>
                                    <span className="text-green-700">S/{(order.final_amount || 0).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Estado de Pago:</span>
                                    <span className={`font-semibold ${order.payment_status === 'completed' ? 'text-green-600' : 'text-amber-600'}`}>
                                      {order.payment_status === 'completed' ? '✅ Pagado' : '⏳ Pendiente'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersManagement;
