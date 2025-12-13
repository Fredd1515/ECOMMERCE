
import React from 'react';
import { motion } from 'framer-motion';
import { X, Truck, Package, CheckCircle, RefreshCw, Clock, ShoppingBag, Calendar, MapPin, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui';

const OrderTrackingModal = ({ onClose, orders = [] }) => {
  // Mapeo de estados de la BD a estados visuales
  const statusMapping = {
    'pending': 'Pendiente',
    'processing': 'Procesando',
    'shipped': 'En Camino',
    'delivered': 'Entregado',
    'cancelled': 'Cancelado'
  };

  const statusSteps = ['Pendiente', 'Procesando', 'En Camino', 'Entregado'];

  const getStatusInfo = (status) => {
    const mappedStatus = statusMapping[status] || status;
    switch (mappedStatus) {
      case 'Pendiente': return { icon: <Clock className="w-6 h-6 text-gray-500" />, text: 'Tu pedido está pendiente.' };
      case 'Procesando': return { icon: <RefreshCw className="w-6 h-6 text-yellow-500" />, text: 'Preparando tu pedido.' };
      case 'En Camino': return { icon: <Truck className="w-6 h-6 text-blue-500" />, text: 'Tu pedido está en camino.' };
      case 'Entregado': return { icon: <CheckCircle className="w-6 h-6 text-green-500" />, text: 'Tu pedido fue entregado.' };
      case 'Cancelado': return { icon: <X className="w-6 h-6 text-red-500" />, text: 'Tu pedido fue cancelado.' };
      default: return { icon: <Clock className="w-6 h-6 text-gray-500" />, text: 'Estado desconocido.' };
    }
  };

  const getStatusIndex = (status) => {
    const mappedStatus = statusMapping[status] || status;
    const index = statusSteps.indexOf(mappedStatus);
    return index >= 0 ? index : 0;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Fecha no disponible';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Mis Pedidos</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="w-6 h-6" />
          </Button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {orders && orders.length > 0 ? (
            <div className="space-y-6">
              {orders.map(order => {
                const currentStatusIndex = getStatusIndex(order.status);
                const statusInfo = getStatusInfo(order.status);
                const mappedStatus = statusMapping[order.status] || order.status;

                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-50 border rounded-lg p-5 hover:shadow-md transition-shadow"
                  >
                    {/* Header del pedido */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-gray-800">
                          Pedido: {order.order_code || order.id.substring(0, 8)}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(order.order_date)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600 text-lg">
                          S/ {(order.final_amount || order.total_amount || 0).toFixed(2)}
                        </p>
                        {order.payment_status && (
                          <p className="text-xs text-gray-500 mt-1">
                            Pago: {order.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Items del pedido */}
                    {order.order_items && order.order_items.length > 0 && (
                      <div className="mb-4 bg-white rounded-lg p-3">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Productos:</p>
                        <div className="space-y-2">
                          {order.order_items.map((item, idx) => (
                            <div key={item.id || idx} className="flex justify-between text-sm">
                              <span className="text-gray-600">
                                {item.product_name} x {item.quantity}
                              </span>
                              <span className="text-gray-800 font-medium">
                                S/ {(item.total_price || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dirección de entrega */}
                    {order.shipping_address && (
                      <div className="mb-4 flex items-start gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{order.shipping_address}</span>
                      </div>
                    )}

                    {/* Tracking number */}
                    {order.tracking_number && (
                      <div className="mb-4 text-sm">
                        <span className="text-gray-600">Número de seguimiento: </span>
                        <span className="font-mono font-semibold text-blue-600">{order.tracking_number}</span>
                      </div>
                    )}

                    {/* Estado del pedido */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                        {statusInfo.icon}
                        <p className="font-semibold text-gray-800">{mappedStatus}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        {statusSteps.map((step, index) => {
                          const isCompleted = index <= currentStatusIndex;
                          const isCurrent = index === currentStatusIndex;
                          const stepInfo = getStatusInfo(step.toLowerCase());

                          return (
                            <React.Fragment key={step}>
                              <div className="flex flex-col items-center text-center flex-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                  isCompleted
                                    ? 'bg-green-500 text-white'
                                    : isCurrent
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-gray-200 text-gray-400'
                                }`}>
                                  {stepInfo.icon}
                                </div>
                                <p className={`mt-2 text-xs font-medium ${
                                  isCompleted ? 'text-green-600' : isCurrent ? 'text-yellow-600' : 'text-gray-400'
                                }`}>
                                  {step}
                                </p>
                              </div>
                              {index < statusSteps.length - 1 && (
                                <div className={`flex-1 h-1 mx-1 ${
                                  isCompleted ? 'bg-green-500' : 'bg-gray-200'
                                }`} />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Aún no tienes pedidos</p>
              <p className="text-gray-400 text-sm mt-2">
                Realiza tu primera compra para ver tus pedidos aquí.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default OrderTrackingModal;

