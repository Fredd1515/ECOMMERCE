import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, CheckCircle, CreditCard, QrCode, Truck, ShieldCheck, 
  MapPin, Phone, User, ShoppingBag, ArrowRight, ArrowLeft, Loader2, Sparkles 
} from 'lucide-react';
import { Button, toast } from '@/components/ui';
import { createOrder } from '@/lib/datawarehouseQueries';
import {
  calculateDeliveryRoute,
  formatDistance,
  formatDuration,
} from '@/lib/googleMapsClient';
import DeliveryRoutePreview from './DeliveryRoutePreview';
import DeliveryLocationPicker from './DeliveryLocationPicker';

const PHARMACY_ORIGIN = import.meta.env.VITE_PHARMACY_ORIGIN || 'Jr. Jorge Chávez S/N, Plaza Principal, Yanahuanca, Daniel Alcides Carrión, Pasco, Perú 19001';
const PHARMACY_ORIGIN_COORDINATES = {
  lat: Number(import.meta.env.VITE_PHARMACY_ORIGIN_LAT || -10.5),
  lng: Number(import.meta.env.VITE_PHARMACY_ORIGIN_LNG || -76.5667),
};
const YAPE_PLIN_NUMBER = '944908531';
const YAPE_PLIN_NUMBER_DISPLAY = '944 908 531';

const CheckoutModal = ({ onClose, cart = [], user, profile, onOrderSuccess }) => {
  const [step, setStep] = useState(1); // 1: Datos de Entrega, 2: Pago, 3: Éxito
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'yape', 'card', 'cash'
  const [loading, setLoading] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  // Formulario de Envío
  const [shippingData, setShippingData] = useState({
    fullName: profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : (user?.name || ''),
    phone: profile?.phone || '',
    address: profile?.address || '',
    city: profile?.city || 'Lima',
    reference: ''
  });

  // Datos de Pago con Tarjeta
  const [cardData, setCardData] = useState({
    cardNumber: '',
    cardHolder: profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : '',
    expiry: '',
    cvv: ''
  });

  // Datos de Yape / Plin
  const [yapeCode, setYapeCode] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  // Cálculos de montos
  const subtotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  
  // Descuento según membresía o promociones
  const membershipLevel = profile?.membershipLevel || profile?.membership_level;
  const discountPercent = profile?.role === 'customer' && membershipLevel === 'gold' ? 0.15
    : profile?.role === 'customer' && membershipLevel === 'silver' ? 0.10 : 0;
  const discountAmount = subtotal * discountPercent;
  
  const shippingCost = (subtotal - discountAmount) >= 50 ? 0 : 8.00;
  const finalTotal = (subtotal - discountAmount) + shippingCost;

  useEffect(() => {
    setRouteEstimate(null);
    setRouteError('');
  }, [shippingData.address, shippingData.city]);

  const handleShippingFieldChange = (field, value) => {
    setShippingData({ ...shippingData, [field]: value });
    if (field === 'address' || field === 'city') {
      setSelectedLocation(null);
    }
  };

  const handleCalculateRoute = async (routeInput = {}) => {
    const address = routeInput.address ?? shippingData.address;
    const city = routeInput.city ?? shippingData.city;
    const destinationCoordinates = routeInput.destinationCoordinates ?? selectedLocation;

    if (!address || !city) {
      setRouteError('Ingresa la dirección y ciudad para calcular la ruta.');
      return null;
    }

    setRouteLoading(true);
    setRouteError('');

    try {
      const estimate = await calculateDeliveryRoute({
        origin: PHARMACY_ORIGIN,
        destination: [address, city, 'Perú'].filter(Boolean).join(', '),
        originCoordinates: PHARMACY_ORIGIN_COORDINATES,
        destinationCoordinates,
      });
      setRouteEstimate(estimate);
      return estimate;
    } catch (error) {
      console.error('Error calculando ruta de delivery:', error);
      setRouteEstimate(null);
      setRouteError(error.message || 'No se pudo calcular la ruta de entrega.');
      return null;
    } finally {
      setRouteLoading(false);
    }
  };

  const handleLocationChange = ({ lat, lng, address, city, source }) => {
    const nextAddress = address || shippingData.address;
    const nextCity = city || shippingData.city;
    setSelectedLocation({ lat, lng, address, city });
    setShippingData(prev => ({
      ...prev,
      address: address || prev.address,
      city: city || prev.city,
    }));

    if (source === 'current') {
      void handleCalculateRoute({
        address: nextAddress,
        city: nextCity,
        destinationCoordinates: { lat, lng },
      });
    }
  };

  // Formateador de tarjeta de crédito
  const handleCardNumberChange = (e) => {
    let value = e.target.value.replace(/\D/g, '').substring(0, 16);
    value = value.replace(/(\d{4})/g, '$1 ').trim();
    setCardData({ ...cardData, cardNumber: value });
  };

  const handleExpiryChange = (e) => {
    let value = e.target.value.replace(/\D/g, '').substring(0, 4);
    if (value.length >= 2) {
      value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    setCardData({ ...cardData, expiry: value });
  };

  const handleSubmitOrder = async () => {
    if (!cart.length) {
      toast({
        title: "Carrito vacío",
        description: "Agrega al menos un producto antes de confirmar la compra.",
        variant: "destructive"
      });
      return;
    }

    if (!shippingData.address || !shippingData.phone) {
      toast({
        title: "Datos incompletos",
        description: "Por favor ingresa la dirección y teléfono de entrega.",
        variant: "destructive"
      });
      setStep(1);
      return;
    }

    if (!routeEstimate) {
      toast({
        title: "Calcula la ruta de entrega",
        description: "Verifica la dirección para conocer la distancia y el tiempo estimado.",
        variant: "destructive"
      });
      setStep(1);
      return;
    }

    const normalizedCardNumber = cardData.cardNumber.replace(/\s/g, '');
    if (paymentMethod === 'card' && (
      !/^\d{16}$/.test(normalizedCardNumber)
      || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardData.expiry)
      || !/^\d{3,4}$/.test(cardData.cvv)
    )) {
      toast({
        title: "Datos de tarjeta no válidos",
        description: "Ingresa 16 dígitos, vencimiento MM/AA válido y un CVV de 3 o 4 dígitos.",
        variant: "destructive"
      });
      return;
    }

    if ((paymentMethod === 'yape' || paymentMethod === 'plin') && !yapeCode.trim()) {
      toast({
        title: "Código de operación requerido",
        description: "Por favor ingresa los dígitos de la confirmación de Yape/Plin.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const orderPayload = {
        customer_id: user?.id || null,
        customer_name: shippingData.fullName || user?.email || 'Cliente',
        customer_email: user?.email || 'cliente@farmacia.pe',
        subtotal: parseFloat(subtotal.toFixed(2)),
        discount: parseFloat(discountAmount.toFixed(2)),
        shipping_cost: parseFloat(shippingCost.toFixed(2)),
        final_amount: parseFloat(finalTotal.toFixed(2)),
        status: 'pending',
        payment_method: paymentMethod,
        payment_status: 'pending',
        payment_reference: yapeCode.trim() || null,
        shipping_address: `${shippingData.address}, ${shippingData.city} ${shippingData.reference ? `(Ref: ${shippingData.reference})` : ''} - Tel: ${shippingData.phone}`,
        order_date: new Date().toISOString()
      };

      const orderItemsPayload = cart.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total_price: item.price * item.quantity
      }));

      const { data: createdOrder, error } = await createOrder(orderPayload, orderItemsPayload);

      if (error) throw error;

      setCompletedOrder(createdOrder);
      setStep(3); // Pantalla de éxito
      
      if (onOrderSuccess) {
        onOrderSuccess(createdOrder);
      }

      toast({
        title: "Pedido enviado a revisión",
        description: `El pedido #${createdOrder.order_code || createdOrder.id} quedará pendiente hasta que el administrador valide el pago.`
      });
    } catch (err) {
      console.error('Error al procesar el pedido:', err);
      const manualCheckoutNotInstalled = /confirmación manual no está instalada|create_order_pending/i.test(err.message || '');
      toast({
        title: manualCheckoutNotInstalled ? "Configura la confirmación manual" : "No se pudo registrar el pedido",
        description: manualCheckoutNotInstalled
          ? "Ejecuta supabase/atomic_checkout.sql en Supabase → SQL Editor y vuelve a intentarlo."
          : (err.message || "Ocurrió un error inesperado al procesar tu compra."),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-6 border border-gray-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-green-200" />
              <h2 className="text-2xl font-bold">Confirmación de Compra</h2>
            </div>
            <p className="text-green-100 text-xs mt-1">
              {step === 1 && 'Paso 1 de 2: Dirección y detalles de entrega'}
              {step === 2 && 'Paso 2 de 2: Método de pago'}
              {step === 3 && 'Pago pendiente de verificación'}
            </p>
          </div>
          {step !== 3 && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Barra de Progreso */}
        {step !== 3 && (
          <div className="flex border-b border-gray-100 bg-gray-50/50 text-xs font-semibold">
            <div 
              onClick={() => setStep(1)}
              className={`flex-1 py-3 text-center cursor-pointer border-b-2 transition-all flex items-center justify-center gap-2 ${
                step === 1 ? 'border-green-600 text-green-700 bg-white font-bold' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 1 ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>1</span>
              <span>Entrega y Contacto</span>
            </div>
            <div 
              onClick={() => {
                if (shippingData.address && shippingData.phone && routeEstimate) setStep(2);
              }}
              className={`flex-1 py-3 text-center cursor-pointer border-b-2 transition-all flex items-center justify-center gap-2 ${
                step === 2 ? 'border-green-600 text-green-700 bg-white font-bold' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 2 ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>2</span>
              <span>Método de Pago</span>
            </div>
          </div>
        )}

        {/* Contenido Dinámico según el Paso */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* PASO 1: DATOS DE ENTREGA */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                ¿Dónde entregamos tu pedido?
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Nombre Completo de quien recibe *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={shippingData.fullName}
                      onChange={(e) => setShippingData({ ...shippingData, fullName: e.target.value })}
                      placeholder="Ej. Fredd Eufracio"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      required
                      value={shippingData.phone}
                      onChange={(e) => setShippingData({ ...shippingData, phone: e.target.value })}
                      placeholder="+51 987 654 321"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Ciudad / Distrito *
                  </label>
                  <input
                    type="text"
                    required
                    value={shippingData.city}
                    onChange={(e) => handleShippingFieldChange('city', e.target.value)}
                    placeholder="Ej. Lima, Cerro de Pasco"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Dirección Exacta (Calle, Avenida, Número) *
                  </label>
                    <input
                      type="text"
                      required
                      value={shippingData.address}
                      onChange={(e) => handleShippingFieldChange('address', e.target.value)}
                      placeholder="Av. Los Rosales 1234, Dpto 402"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Referencia de Entrega (Opcional)
                  </label>
                  <input
                    type="text"
                    value={shippingData.reference}
                    onChange={(e) => setShippingData({ ...shippingData, reference: e.target.value })}
                    placeholder="Frente al parque principal, portón negro"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                  />
                </div>
              </div>

              <DeliveryLocationPicker
                selectedLocation={selectedLocation}
                onLocationChange={handleLocationChange}
              />

              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-blue-900 text-sm">Calcula tu ruta de delivery</h4>
                    <p className="text-xs text-blue-800 mt-1">
                      Origen: {PHARMACY_ORIGIN}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleCalculateRoute}
                    disabled={routeLoading || !shippingData.address || !shippingData.city}
                    className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    {routeLoading ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Calculando...
                      </span>
                    ) : (
                      'Calcular ruta'
                    )}
                  </Button>
                </div>

                {routeError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {routeError}
                  </p>
                )}

                <DeliveryRoutePreview routeEstimate={routeEstimate} />
              </div>

              {/* Resumen Mini */}
              <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100/80 flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-600">Total a pagar:</span>
                  <div className="text-xl font-bold text-gray-900">S/{finalTotal.toFixed(2)}</div>
                </div>
                <Button
                  onClick={() => {
                    if (!shippingData.address || !shippingData.phone) {
                      toast({
                        title: "Completa los datos",
                        description: "Ingresa tu dirección y teléfono para continuar.",
                        variant: "destructive"
                      });
                      return;
                    }
                    if (!routeEstimate) {
                      toast({
                        title: "Calcula la ruta primero",
                        description: "Presiona «Calcular ruta» para verificar el tiempo de entrega.",
                        variant: "destructive"
                      });
                      return;
                    }
                    setStep(2);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center gap-2 px-5 py-2.5 font-semibold shadow-md shadow-green-600/20"
                >
                  <span>Continuar al Pago</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* PASO 2: MÉTODOS DE PAGO */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Opciones de Método */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2.5">
                  Selecciona tu Método de Pago
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Tarjeta */}
                  <div
                    onClick={() => setPaymentMethod('card')}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2 ${
                      paymentMethod === 'card'
                        ? 'border-green-600 bg-green-50/50 shadow-sm text-green-900 font-bold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <CreditCard className={`w-6 h-6 ${paymentMethod === 'card' ? 'text-green-600' : 'text-gray-500'}`} />
                    <span className="text-xs">Tarjeta Débito / Crédito</span>
                  </div>

                  {/* Yape / Plin */}
                  <div
                    onClick={() => setPaymentMethod('yape')}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2 ${
                      paymentMethod === 'yape'
                        ? 'border-purple-600 bg-purple-50/50 shadow-sm text-purple-900 font-bold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-purple-600 text-white text-[11px] font-black flex items-center justify-center">
                      Y
                    </div>
                    <span className="text-xs">Yape / Plin</span>
                  </div>

                  {/* Contra Entrega */}
                  <div
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2 ${
                      paymentMethod === 'cash'
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm text-blue-900 font-bold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Truck className={`w-6 h-6 ${paymentMethod === 'cash' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <span className="text-xs">Contra Entrega</span>
                  </div>
                </div>
              </div>

              {/* Formulario según Método */}
              {paymentMethod === 'card' && (
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-xl space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Tarjeta de Crédito / Débito</span>
                    <span className="font-mono">VISA / MASTERCARD</span>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-300 mb-1">
                      Número de Tarjeta
                    </label>
                    <input
                      type="text"
                      maxLength={19}
                      value={cardData.cardNumber}
                      onChange={handleCardNumberChange}
                      placeholder="4557 1234 5678 9012"
                      className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-sm tracking-widest text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-300 mb-1">
                        Titular de la Tarjeta
                      </label>
                      <input
                        type="text"
                        value={cardData.cardHolder}
                        onChange={(e) => setCardData({ ...cardData, cardHolder: e.target.value })}
                        placeholder="Nombre Apellido"
                        className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-green-500 uppercase"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-300 mb-1">
                          Expira
                        </label>
                        <input
                          type="text"
                          maxLength={5}
                          value={cardData.expiry}
                          onChange={handleExpiryChange}
                          placeholder="MM/AA"
                          className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-2 py-2 text-xs text-center font-mono text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-300 mb-1">
                          CVV
                        </label>
                        <input
                          type="password"
                          maxLength={4}
                          value={cardData.cvv}
                          onChange={(e) => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '') })}
                          placeholder="123"
                          className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-2 py-2 text-xs text-center font-mono text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'yape' && (
                <div className="bg-purple-50/70 border border-purple-200 p-5 rounded-2xl space-y-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-purple-900 font-bold text-sm">
                    <QrCode className="w-5 h-5 text-purple-700" />
                    Paga desde tu app Yape o Plin usando este número
                  </div>

                  <div className="bg-white p-4 rounded-2xl inline-block shadow-md border border-purple-100 mx-auto">
                    <Phone className="w-10 h-10 mx-auto text-purple-700" />
                    <div className="text-[11px] font-bold text-purple-900 mt-2">
                      Envía exactamente: <span className="text-sm font-extrabold">S/{finalTotal.toFixed(2)}</span>
                    </div>
                    <a
                      href={`tel:${YAPE_PLIN_NUMBER}`}
                      className="block text-2xl font-black tracking-wider text-purple-800 mt-1 hover:text-purple-600"
                    >
                      {YAPE_PLIN_NUMBER_DISPLAY}
                    </a>
                    <div className="text-[10px] text-gray-500 mt-1">Número para Yape o Plin</div>
                  </div>

                  <div className="text-xs text-gray-600 bg-white p-3 rounded-xl border border-purple-100 max-w-sm mx-auto">
                    <div><strong>Número Yape / Plin:</strong> {YAPE_PLIN_NUMBER_DISPLAY}</div>
                    <div><strong>Titular:</strong> Farmacia Digital S.A.C.</div>
                  </div>

                  <div className="max-w-xs mx-auto text-left">
                    <label className="block text-xs font-bold text-purple-900 mb-1">
                      Número de Operación / Aprobación Yape *
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={yapeCode}
                      onChange={(e) => setYapeCode(e.target.value.trimStart().slice(0, 20))}
                      placeholder="Ej. 849201"
                      className="w-full px-3.5 py-2 border border-purple-300 rounded-xl text-sm font-mono text-center font-bold focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 outline-none bg-white"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'cash' && (
                <div className="bg-blue-50/70 border border-blue-200 p-5 rounded-2xl text-center space-y-2">
                  <Truck className="w-10 h-10 text-blue-600 mx-auto" />
                  <h4 className="font-bold text-blue-900 text-sm">Pago Contra Entrega</h4>
                  <p className="text-xs text-gray-600 max-w-sm mx-auto">
                    Pagas en efectivo o con tarjeta mediante POS inalámbrico al momento de recibir tus medicamentos en tu domicilio.
                  </p>
                </div>
              )}

              {/* Resumen de Costos */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200/80 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal ({cart.length} productos):</span>
                  <span>S/{subtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Descuento aplicado ({Math.round(discountPercent * 100)}%):</span>
                    <span>-S/{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Envío a domicilio:</span>
                  <span>{shippingCost === 0 ? <strong className="text-green-600">¡GRATIS!</strong> : `S/${shippingCost.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>Total Final:</span>
                  <span className="text-green-600">S/{finalTotal.toFixed(2)}</span>
                </div>
                <p className="pt-2 text-[11px] leading-relaxed text-amber-700">
                  El pedido quedará pendiente de validación. El stock se descontará únicamente cuando un administrador confirme el pago.
                </p>
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="rounded-xl px-4 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Atrás</span>
                </Button>
                <Button
                  onClick={handleSubmitOrder}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 font-bold shadow-lg shadow-green-600/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Procesando Pago Seguro...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>Registrar pedido S/{finalTotal.toFixed(2)}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* PASO 3: ÉXITO */}
          {step === 3 && completedOrder && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-6 space-y-5"
            >
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle className="w-12 h-12 stroke-[2.5]" />
              </div>

              <div>
                <h3 className="text-2xl font-black text-gray-900">¡Pedido registrado!</h3>
                <p className="text-sm text-gray-600 mt-1">
                  El administrador revisará tu pago antes de preparar el pedido y descontar el stock.
                </p>
              </div>

              {/* Recibo Mini */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-left max-w-md mx-auto space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                  <span className="text-gray-500">Código de Pedido:</span>
                  <span className="font-mono font-bold text-sm text-green-700">
                    {completedOrder.order_code || completedOrder.id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Método de Pago:</span>
                  <span className="font-semibold text-gray-800 uppercase">{paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Monto del pedido:</span>
                  <span className="font-bold text-gray-900 text-sm">S/{finalTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Estado:</span>
                  <span className="font-semibold text-amber-600">⏳ Pendiente de validación</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Dirección de Entrega:</span>
                  <span className="text-gray-800 font-medium text-right max-w-[200px] truncate">{shippingData.address}</span>
                </div>
                {routeEstimate && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Distancia estimada:</span>
                      <span className="text-gray-800 font-medium">{formatDistance(routeEstimate.distanceMeters)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tiempo de traslado:</span>
                      <span className="text-gray-800 font-medium">{formatDuration(routeEstimate.durationMillis)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-3 flex gap-3 max-w-md mx-auto">
                <Button
                  onClick={onClose}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 font-semibold shadow-md shadow-green-600/20"
                >
                  Seguir Comprando
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CheckoutModal;
