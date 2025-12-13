
import React from 'react';
import { Heart, Phone, Mail, MapPin, Clock, Facebook, Instagram, Twitter } from 'lucide-react';

const Footer = () => {
  return (
    <footer id="contacto" className="bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-4 gap-8">
          {/* Logo y descripción */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold">Farmacia</span>
                <p className="text-sm text-green-400 font-semibold">Salud Total</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">
              Más de 10 años cuidando tu salud y la de tu familia.
              Medicamentos de calidad y atención profesional.
            </p>
          </div>

          {/* Contacto */}
          <div className="space-y-4">
            <span className="text-lg font-bold text-white">Contacto</span>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Phone className="w-5 h-5 text-green-400" />
                <span className="text-gray-300">+51 999 888 777</span>
              </div>
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-green-400" />
                <span className="text-gray-300">info@farmaciasaludtotal.com</span>
              </div>
              <div className="flex items-center space-x-3">
                <MapPin className="w-5 h-5 text-green-400" />
                <span className="text-gray-300">Av. Salud 123, Lima, Perú</span>
              </div>
            </div>
          </div>

          {/* Horarios */}
          <div className="space-y-4">
            <span className="text-lg font-bold text-white">Horarios</span>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-green-400" />
                <div className="text-gray-300">
                  <p className="text-sm">Lun - Vie: 8:00 AM - 10:00 PM</p>
                  <p className="text-sm">Sáb - Dom: 9:00 AM - 8:00 PM</p>
                </div>
              </div>
            </div>
          </div>

          {/* Redes sociales */}
          <div className="space-y-4">
            <span className="text-lg font-bold text-white">Síguenos</span>
            <div className="flex space-x-4">
              <a href="#" className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-pink-600 rounded-full flex items-center justify-center hover:bg-pink-700 transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-blue-400 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-8 pt-8 text-center">
          <p className="text-gray-400 text-sm">
            © 2024 Farmacia Salud Total. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

