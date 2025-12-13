import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Truck, Clock, Award, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui';

const Hero = () => {
  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleWhatsAppContact = () => {
    // Número de WhatsApp (reemplaza con tu número)
    const phoneNumber = '51958292145'; // Formato: código país + número sin espacios
    const message = 'Hola, me gustaría consultar sobre vuestros productos y servicios.';
    const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, '_blank');
  };

  return (
    <section className="relative bg-gradient-to-r from-green-600 via-blue-600 to-teal-600 text-white py-24 overflow-hidden">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-black/20 z-0"></div>

      {/* Background Pattern - detrás de todo */}
      <div className="absolute inset-0 opacity-10 z-0">
        <div className="absolute top-20 left-20 w-32 h-32 bg-white rounded-full"></div>
        <div className="absolute bottom-20 right-20 w-24 h-24 bg-yellow-300 rounded-full"></div>
        <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-blue-300 rounded-full"></div>
      </div>

      <div className="container mx-auto px-4 relative z-20">
        <div className="grid grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8 relative z-30"
          >
            <div>
              <h1 className="text-6xl font-bold mb-6 leading-tight drop-shadow-lg">
                Tu Salud es
                <span className="block text-yellow-300 drop-shadow-lg">Nuestra Prioridad</span>
              </h1>
              <p className="text-xl text-blue-100 mb-8 leading-relaxed drop-shadow-md">
                Medicamentos de calidad, servicios profesionales y atención personalizada.
                Más de 10 años cuidando tu bienestar y el de tu familia.
              </p>
            </div>

            <div className="flex gap-4">
              <Button
                size="lg"
                className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold px-8 py-4 text-lg"
                onClick={() => scrollToId('productos')}
              >
                Ver Productos
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-white text-white hover:bg-white hover:text-gray-900 px-8 py-4 text-lg"
                onClick={() => scrollToId('servicios')}
              >
                Nuestros Servicios
              </Button>
            </div>

            {/* Features */}
            <div className="grid grid-cols-4 gap-6 pt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center"
              >
                <Shield className="w-8 h-8 mx-auto mb-2 text-yellow-300" />
                <p className="text-sm font-medium">Productos Certificados</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <Truck className="w-8 h-8 mx-auto mb-2 text-yellow-300" />
                <p className="text-sm font-medium">Envío Gratis</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-center"
              >
                <Clock className="w-8 h-8 mx-auto mb-2 text-yellow-300" />
                <p className="text-sm font-medium">24/7 Disponible</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-center"
              >
                <Award className="w-8 h-8 mx-auto mb-2 text-yellow-300" />
                <p className="text-sm font-medium">5+ Años</p>
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative z-30"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-2xl">
              <img
                className="w-full h-auto object-cover block"
                alt="Farmacia moderna con productos de salud"
                src="/farmacia.jpg"
              />
            </div>

            {/* Floating Badge */}
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -top-4 -right-4 bg-yellow-400 text-gray-900 px-5 py-2 rounded-full font-bold shadow-lg z-40 text-sm"
            >
              ¡Ofertas!
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
