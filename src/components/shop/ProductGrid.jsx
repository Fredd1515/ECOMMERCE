import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Star } from 'lucide-react';
import { Button, toast } from '@/components/ui';

const ProductGrid = ({ products, onAddToCart, user, searchTerm = '', selectedCategory = 'all' }) => {

  const filteredProducts = products.filter(product => {
    // Filtro especial para ofertas
    if (selectedCategory === 'ofertas') {
      const searchMatch = !searchTerm || [
        product.name,
        product.description,
        product.category,
        product.sku,
        product.barcode,
        product.category_name,
        product.subcategory_name,
        product.brand,
        product.manufacturer,
        product.unit_type,
        product.unit_size
      ].some(field =>
        field && field.toString().toLowerCase().includes(searchTerm.toLowerCase())
      );
      return product.onSale && searchMatch;
    }

    // Filtros normales
    const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;

    // Búsqueda avanzada por múltiples atributos
    const searchMatch = !searchTerm || [
      product.name,
      product.description,
      product.category,
      product.sku,
      product.barcode,
      product.category_name,
      product.subcategory_name,
      product.brand,
      product.manufacturer,
      product.unit_type,
      product.unit_size
    ].some(field =>
      field && field.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );

    return categoryMatch && searchMatch;
  });


  const handleAddToCart = (product) => {
    if (product.prescription && !user) {
      toast({
        title: "Inicia sesión requerido",
        description: "Debes iniciar sesión para comprar medicamentos con receta",
        variant: "destructive"
      });
      return;
    }
    onAddToCart(product);
  };

  return (
    <section id="productos" className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold text-gray-800 mb-4">
            Nuestros Productos
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Encuentra los mejores medicamentos y productos de salud con precios especiales
          </p>
        </motion.div>

        {/* Search Results Info */}
        {searchTerm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-6"
          >
            <p className="text-lg text-gray-700">
              Resultados para: <span className="font-semibold text-green-600">"{searchTerm}"</span>
            </p>
            <p className="text-sm text-gray-500">
              {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
            </p>
          </motion.div>
        )}

        {/* Products Grid */}
        <div className="grid grid-cols-4 gap-8">
          {filteredProducts.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 group"
            >
              <div className="relative bg-gray-100 h-56 flex items-center justify-center overflow-hidden group">
                <img
                  className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-300"
                  alt={`${product.name} - medicamento de farmacia`}
                  src={product.image_url || product.image || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=300&fit=crop'}
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=300&fit=crop';
                  }}
                />

                {product.onSale && (
                  <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                    ¡Oferta!
                  </div>
                )}

                {product.prescription && (
                  <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                    Receta
                  </div>
                )}
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{product.name}</h3>
                  <p className="text-gray-600 text-sm mb-2">{product.description}</p>
                  <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                    {product.category}
                  </span>
                </div>

                <div className="flex items-center mb-4">
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <span className="text-gray-600 text-sm ml-2">(4.8)</span>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold text-green-600">
                      S/ {product.price.toFixed(2)}
                    </span>
                    {product.originalPrice && (
                      <span className="text-lg text-gray-400 line-through">
                        S/ {product.originalPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {user?.role === 'customer' && user.membershipLevel && (
                  <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 font-medium">
                      🎉 Descuento del {user.membershipLevel === 'gold' ? '15' : '10'}% aplicado
                    </p>
                  </div>
                )}

                <Button
                  onClick={() => handleAddToCart(product)}
                  disabled={product.stock === 0}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3"
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Agregar al Carrito
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-xl text-gray-600">No se encontraron productos con los filtros seleccionados</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductGrid;
