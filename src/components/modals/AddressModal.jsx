import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, MapPin, Home, Building2, Navigation } from 'lucide-react';
import { Button, toast } from '@/components/ui';
import { upsertProfile } from '@/lib/datawarehouseQueries';

const AddressModal = ({ onClose, user, profile, onAddressSaved }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'Perú'
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
        postal_code: profile.postal_code || '',
        country: profile.country || 'Perú'
      });
    }
  }, [profile]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: "Inicia sesión requerido",
        description: "Debes iniciar sesión para guardar tu dirección.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await upsertProfile({
        id: user.id,
        ...profile,
        ...formData,
        updated_at: new Date().toISOString()
      });

      if (error) {
        toast({
          title: "Error",
          description: "No se pudo guardar la dirección. Intenta nuevamente.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "¡Dirección guardada!",
          description: "Tu dirección de entrega se ha guardado correctamente."
        });
        if (onAddressSaved) {
          onAddressSaved(data);
        }
        onClose();
      }
    } catch (error) {
      console.error('Error saving address:', error);
      toast({
        title: "Error",
        description: "Ocurrió un error al guardar la dirección.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Dirección de Entrega</h2>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
              <X className="w-6 h-6" />
            </Button>
          </div>
          <p className="text-blue-100 mt-2">Ingresa tu dirección para recibir tus pedidos</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
            <div className="relative">
              <Home className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Calle, número, referencia"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ciudad</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Ciudad"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Distrito</label>
              <div className="relative">
                <Navigation className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Distrito"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Código Postal</label>
              <input
                type="text"
                name="postal_code"
                value={formData.postal_code}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Código postal"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">País</label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="País"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
            disabled={loading}
          >
            {loading ? 'Guardando...' : 'Guardar Dirección'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default AddressModal;
