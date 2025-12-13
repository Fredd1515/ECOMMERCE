import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Minus, ShoppingBag, CreditCard, Truck } from 'lucide-react';
import { Button, toast } from '@/components/ui';

const Cart = ({ cart, onClose, onRemoveItem, onUpdateQuantity, user }) => {
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const subtotal = cart.reduce((total, item) => {
    let price = item.price;
    // Aplicar descuento si el usuario tiene membresía
    if (user?.role === 'customer' && user.membershipLevel) {
      const discount = user.membershipLevel === 'gold' ? 0.15 : 0.10;
      price = price * (1 - discount);
    }
    return total + (price * item.quantity);
  }, 0);

  const shipping = subtotal > 50 ? 0 : 10;
  const total = subtotal + shipping;

  const handleCheckout = () => {
    if (!user) {
      toast({
        title: "Inicia sesión requerido",
        description: "Debes iniciar sesión para realizar una compra",
        variant: "destructive"
      });
      return;
    }

    setIsCheckingOut(true);

    // Simular proceso de pago
    setTimeout(() => {
      toast({
        title: "🚧 Esta función no está implementada aún",
        description: "¡Pero no te preocupes! Puedes solicitarla en tu próximo prompt! 🚀"
      });
      setIsCheckingOut(false);
    }, 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-white h-full w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShoppingBag className="w-6 h-6" />
              <h2 className="text-xl font-bold">Carrito de Compras</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
          <p className="text-blue-100 mt-2">
            {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
          </p>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-6">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Tu carrito está vacío</p>
              <p className="text-gray-400 text-sm mt-2">
                Agrega productos para comenzar tu compra
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => {
                let displayPrice = item.price;
                let discount = 0;

                if (user?.role === 'customer' && user.membershipLevel) {
                  discount = user.membershipLevel === 'gold' ? 0.15 : 0.10;
                  displayPrice = item.price * (1 - discount);
                }

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                          className="w-full h-full object-contain p-1"
                          alt={`${item.name} - producto de farmacia`}
                          src={item.image_url || item.image || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200&h=200&fit=crop'}
                          onError={(e) => {
                            // Si la imagen falla al cargar, usar una imagen por defecto
                            e.target.src = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200&h=200&fit=crop';
                          }}
                        />
                      </div>

                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800 mb-1">{item.name}</h3>
                        <p className="text-sm text-gray-600 mb-2">{item.category}</p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-green-600">
                              S/ {displayPrice.toFixed(2)}
                            </span>
                            {discount > 0 && (
                              <span className="text-xs text-gray-400 line-through">
                                S/ {item.price.toFixed(2)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-8 h-8"
                              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-8 h-8"
                              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {discount > 0 && (
                          <div className="mt-2 text-xs text-green-600 font-medium">
                            🎉 Descuento del {(discount * 100).toFixed(0)}% aplicado
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveItem(item.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            {/* Shipping Info */}
            <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-blue-800">
                  {shipping === 0 ? 'Envío gratis' : `Envío: S/ ${shipping.toFixed(2)}`}
                </span>
              </div>
              {subtotal < 50 && (
                <span className="text-xs text-blue-600">
                  Compra S/ {(50 - subtotal).toFixed(2)} más para envío gratis
                </span>
              )}
            </div>

            {/* Summary */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>S/ {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Envío:</span>
                <span>S/ {shipping.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-800 border-t pt-2">
                <span>Total:</span>
                <span>S/ {total.toFixed(2)}</span>
              </div>
            </div>

            <Button
              onClick={handleCheckout}
              disabled={isCheckingOut}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              {isCheckingOut ? 'Procesando...' : 'Proceder al Pago'}
            </Button>

            {!user && (
              <p className="text-xs text-gray-500 text-center mt-2">
                Inicia sesión para obtener descuentos exclusivos
              </p>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Cart;
