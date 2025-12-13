
import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Stethoscope, Activity, Thermometer, Scale, Eye, Calendar } from 'lucide-react';
import { Button, toast } from '@/components/ui';

const ServicesSection = () => {
  const services = [
    {
      id: 1,
      name: 'Medición de Presión Arterial',
      description: 'Control profesional de presión arterial con equipos calibrados',
      price: 15.00,
      duration: '15 min',
      icon: Heart,
      color: 'from-red-500 to-pink-500'
    },
    {
      id: 2,
      name: 'Control de Glucosa',
      description: 'Medición rápida y precisa de niveles de glucosa en sangre',
      price: 12.00,
      duration: '10 min',
      icon: Activity,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      id: 3,
      name: 'Medición de Temperatura',
      description: 'Control de temperatura corporal con termómetros digitales',
      price: 8.00,
      duration: '5 min',
      icon: Thermometer,
      color: 'from-orange-500 to-yellow-500'
    },
    {
      id: 4,
      name: 'Control de Peso y Talla',
      description: 'Medición precisa de peso corporal y estatura',
      price: 10.00,
      duration: '10 min',
      icon: Scale,
      color: 'from-green-500 to-teal-500'
    },
    {
      id: 5,
      name: 'Consulta Farmacéutica',
      description: 'Asesoría profesional sobre medicamentos y tratamientos',
      price: 25.00,
      duration: '30 min',
      icon: Stethoscope,
      color: 'from-purple-500 to-indigo-500'
    },
    {
      id: 6,
      name: 'Examen Visual Básico',
      description: 'Evaluación básica de agudeza visual',
      price: 20.00,
      duration: '20 min',
      icon: Eye,
      color: 'from-teal-500 to-blue-500'
    }
  ];

  const handleBookService = (service) => {
    toast({
      title: "🚧 Esta función no está implementada aún",
      description: "¡Pero no te preocupes! Puedes solicitarla en tu próximo !"
    });
  };

  return (
    <section id="servicios" className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold text-gray-800 mb-4">
            Servicios de Salud
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Además de medicamentos, ofrecemos servicios profesionales para cuidar tu salud
          </p>
        </motion.div>

        <div className="grid grid-cols-3 gap-8">
          {services.map((service, index) => {
            const IconComponent = service.icon;
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 group"
              >
                <div className={`h-32 bg-gradient-to-br ${service.color} relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-black/10"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <IconComponent className="w-12 h-12 text-white" />
                  </div>
                  <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm font-bold">
                    {service.duration}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-3">{service.name}</h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">{service.description}</p>

                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl font-bold text-green-600">
                        S/ {service.price.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center text-gray-500 text-sm">
                      <Calendar className="w-4 h-4 mr-1" />
                      {service.duration}
                    </div>
                  </div>

                  <Button
                    onClick={() => handleBookService(service)}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3"
                  >
                    Agendar Cita
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 text-center bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-8"
        >
          <h3 className="text-2xl font-bold text-gray-800 mb-4">
            ¿Necesitas atención personalizada?
          </h3>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Nuestro equipo de farmacéuticos profesionales está disponible para brindarte
            la mejor atención y asesoría en salud.
          </p>
          <Button
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-4"
            onClick={() => {
              const phoneNumber = '51958292145';
              const message = 'Hola, me gustaría consultar sobre vuestros servicios y medicamentos.';
              const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
              window.open(whatsappURL, '_blank');
            }}
          >
            Contactar Farmacéutico
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default ServicesSection;
