
import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, User, Shield, Heart, Search, MapPin, Package, Filter, Tag, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

const Header = ({ user, cartItemsCount, onCartClick, onLoginClick, onLogout, onAdminClick, onTrackOrderClick, onAddressClick, searchTerm, onSearchChange, onCategoryClick, selectedCategory = 'all', categories = [], isLoadingOrders = false }) => {

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      {/* Top Header Section */}
      <div className="border-b border-gray-100">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Farmacia</h1>
                <p className="text-sm text-green-600 font-semibold">Salud Total</p>
              </div>
            </motion.div>

            {/* Central Search Bar */}
            <div className="flex-1 max-w-2xl mx-8">
              <div className="flex-1">
                <div className="relative">
                  <div className="flex items-center bg-white rounded-full shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 focus-within:shadow-lg focus-within:ring-2 focus-within:ring-green-500 focus-within:ring-opacity-20">
                    <input
                      type="text"
                      placeholder="Busca una marca o producto"
                      value={searchTerm || ''}
                      onChange={(e) => onSearchChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const productsSection = document.getElementById('productos');
                          if (productsSection) {
                            productsSection.scrollIntoView({ behavior: 'smooth' });
                          }
                        }
                      }}
                      className="flex-1 px-4 py-2.5 bg-transparent border-0 focus:outline-none text-gray-700 placeholder-gray-400 text-sm pr-8"
                      title="Busca por: nombre, marca"
                    />

                    {/* Botón X para limpiar búsqueda */}
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => onSearchChange('')}
                        className="absolute right-12 text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        // El searchTerm ya se actualiza con onChange del input
                        // Solo necesitamos hacer scroll a los productos
                        const productsSection = document.getElementById('productos');
                        if (productsSection) {
                          productsSection.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 transition-all duration-200 flex items-center justify-center group"
                      title="Buscar productos"
                    >
                      <Search className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" />
                    </button>
                  </div>
                </div>
                {searchTerm && (
                  <p className="text-xs text-gray-500 mt-2 px-2 text-center">
                    Buscando en: nombre, marca </p>
                )}
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center space-x-4">
              <div
                className="flex items-center space-x-2 text-gray-600 hover:text-green-600 cursor-pointer"
                onClick={onAddressClick}
                title={user?.address ? `${user.address}, ${user.city || ''}` : 'Ingresa tu dirección de entrega'}
              >
                <MapPin className="w-5 h-5" />
                <span className="text-sm">
                  {user?.address ? (
                    <span className="truncate max-w-[200px]">
                      {user.address.split(',')[0]}{user.city ? `, ${user.city}` : ''}
                    </span>
                  ) : (
                    'Ingresa tu dirección de entrega'
                  )}
                </span>
              </div>

              {/* My Orders */}
              <div
                className="flex items-center space-x-2 text-gray-600 hover:text-green-600 cursor-pointer transition-colors"
                onClick={onTrackOrderClick}
                title="Ver mis pedidos"
              >
                <div className="relative">
                  {isLoadingOrders ? (
                    <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                  ) : (
                    <Package className="w-5 h-5" />
                  )}
                </div>
                <span className="text-sm">Mis pedidos</span>
              </div>

              {/* Login */}
              {user ? (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-2 text-gray-600">
                    <User className="w-5 h-5" />
                    <span className="text-sm">Hola, {user.name}</span>
                  </div>
                  {user.role === 'admin' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onAdminClick}
                      className="text-blue-600"
                    >
                      <Shield className="w-5 h-5" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onLogout}
                  >
                    Cerrar Sesión
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-gray-600 hover:text-green-600 cursor-pointer" onClick={onLoginClick}>
                  <User className="w-5 h-5" />
                  <span className="text-sm">Inicia sesión</span>
                </div>
              )}

              {/* Shopping Cart */}
              <div className="flex items-center space-x-2 bg-blue-50 px-3 py-2 rounded-lg cursor-pointer" onClick={onCartClick}>
                <ShoppingCart className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">{cartItemsCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Filters Bar */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="container mx-auto px-4">
          <div className="flex items-center space-x-3 py-3">
            {/* Filter Icon */}
            <div className="flex items-center space-x-2 text-gray-700">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium whitespace-nowrap">Filtros:</span>
            </div>

            {/* Botón Todos */}
            <button
              onClick={() => onCategoryClick && onCategoryClick('all')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md border transition-all whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-600 hover:text-green-600'
              }`}
            >
              Todos
            </button>

            {/* Filter Buttons - Dinámicos */}
            {categories.map(category => (
              category !== 'all' && (
                <button
                  key={category}
                  onClick={() => onCategoryClick && onCategoryClick(category)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md border transition-all whitespace-nowrap ${
                    selectedCategory === category
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-green-600 hover:text-green-600'
                  }`}
                >
                  {category}
                </button>
              )
            ))}

            {/* Special Offers */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onCategoryClick && onCategoryClick('ofertas')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md border transition-all whitespace-nowrap flex items-center space-x-1 ${
                  selectedCategory === 'ofertas'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-red-600 hover:text-red-600'
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>Solo Ofertas</span>
              </button>
            </div>

            {/* Services & Contact Links */}
            <div className="border-l border-gray-300 pl-3 ml-3 flex items-center space-x-3">
              <a
                href="#servicios"
                className="text-sm text-gray-600 hover:text-green-600 whitespace-nowrap transition-colors"
              >
                Nuestros servicios
              </a>
              <a
                href="#contacto"
                className="text-sm text-gray-600 hover:text-green-600 whitespace-nowrap transition-colors"
              >
                Contáctanos
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
