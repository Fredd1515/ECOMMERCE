import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit, Save, X, RefreshCw, Package, AlertTriangle, Search, Trash2, Tag, Check, Image as ImageIcon } from 'lucide-react';
import { Button, toast } from '@/components/ui';
import { getProductsWithAnalytics } from '@/lib/adminQueries';
import { deleteProduct } from '@/lib/datawarehouseQueries';

const CATEGORIES = [
  'Medicamentos',
  'Vitaminas',
  'Cuidado Personal',
  'Primeros Auxilios',
  'Bebés y Maternidad',
  'Dermocosmética',
  'Suplementos'
];

const ProductsManagement = ({ onUpdateProduct, onCreateProduct }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [editingProduct, setEditingProduct] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialNewProduct = {
    name: '',
    description: '',
    price: '',
    sale_price: '',
    stock: '',
    category: 'Medicamentos',
    brand: '',
    manufacturer: '',
    unit_type: 'Caja x 20 tabletas',
    unit_size: '500mg',
    image_url: '',
    prescription: false,
    onSale: false,
    is_active: true
  };

  const [newProduct, setNewProduct] = useState(initialNewProduct);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await getProductsWithAnalytics();
      if (error) throw error;
      if (data) setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los productos.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProduct = async (e) => {
    if (e) e.preventDefault();
    if (!editingProduct) return;

    setIsSubmitting(true);
    try {
      const payload = {
        ...editingProduct,
        price: parseFloat(editingProduct.price) || 0,
        sale_price: editingProduct.sale_price ? parseFloat(editingProduct.sale_price) : null,
        stock: parseInt(editingProduct.stock, 10) || 0,
        onSale: Boolean(editingProduct.onSale),
        prescription: Boolean(editingProduct.prescription),
        is_active: Boolean(editingProduct.is_active)
      };

      if (onUpdateProduct) {
        await onUpdateProduct(payload.id, payload);
      }

      setProducts(prev => prev.map(p => p.id === payload.id ? { ...p, ...payload } : p));
      setEditingProduct(null);
      await loadProducts();
    } catch (error) {
      console.error('Error updating product:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el producto. Inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateProduct = async (e) => {
    if (e) e.preventDefault();
    if (!newProduct.name || !newProduct.price) {
      toast({
        title: "Campos requeridos",
        description: "El nombre y precio son obligatorios.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...newProduct,
        price: parseFloat(newProduct.price) || 0,
        sale_price: newProduct.sale_price ? parseFloat(newProduct.sale_price) : null,
        stock: parseInt(newProduct.stock, 10) || 0,
        category_name: newProduct.category,
        image: newProduct.image_url || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&h=500&fit=crop'
      };

      if (onCreateProduct) {
        await onCreateProduct(payload);
      }

      setIsCreateOpen(false);
      setNewProduct(initialNewProduct);
      await loadProducts();
    } catch (error) {
      console.error('Error creating product:', error);
      toast({
        title: "Error",
        description: "No se pudo crear el producto.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId, productName) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar "${productName}" del catálogo?`)) {
      return;
    }

    try {
      const { success, error } = await deleteProduct(productId);
      if (error || !success) throw error || new Error('No se pudo eliminar');

      toast({
        title: "Producto eliminado",
        description: `"${productName}" ha sido retirado del inventario.`
      });
      setProducts(prev => prev.filter(p => p.id !== productId));
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar el producto de la base de datos.",
        variant: "destructive"
      });
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategoryFilter === 'all' || product.category === selectedCategoryFilter;
    const matchesSearch = !searchTerm || [
      product.name,
      product.category,
      product.brand,
      product.description
    ].some(field => field && field.toString().toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Inventario y Catálogo</h2>
          <p className="text-gray-500 text-sm mt-1">
            Modifica precios, stock, imágenes y productos en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={loadProducts}
            variant="outline"
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Recargar</span>
          </Button>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 shadow-md shadow-green-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Producto</span>
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, categoría o marca..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="w-full sm:w-64">
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="all">Todas las categorías</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="py-4 px-6">Producto</th>
                <th className="py-4 px-6">Categoría / Marca</th>
                <th className="py-4 px-6">Precio (S/)</th>
                <th className="py-4 px-6">Stock</th>
                <th className="py-4 px-6">Oferta / Receta</th>
                <th className="py-4 px-6">Estado</th>
                <th className="py-4 px-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                    Cargando productos del inventario...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No se encontraron productos que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-blue-50/30 transition-colors">
                    {/* Producto */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image_url || product.image || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=100&h=100&fit=crop'}
                          alt={product.name}
                          className="w-12 h-12 rounded-xl object-contain bg-gray-50 p-1 border border-gray-100 shadow-sm"
                          onError={(e) => {
                            e.target.src = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=100&h=100&fit=crop';
                          }}
                        />
                        <div className="max-w-xs">
                          <div className="font-semibold text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500 truncate">{product.description || 'Sin descripción'}</div>
                        </div>
                      </div>
                    </td>

                    {/* Categoría / Marca */}
                    <td className="py-4 px-6">
                      <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium mb-1">
                        {product.category || 'General'}
                      </span>
                      {product.brand && (
                        <div className="text-xs text-gray-500 font-medium">{product.brand}</div>
                      )}
                    </td>

                    {/* Precio */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-gray-900">S/{Number(product.price).toFixed(2)}</div>
                      {product.sale_price && (
                        <div className="text-xs text-red-600 font-semibold line-through">
                          S/{Number(product.sale_price).toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Stock */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-bold ${product.stock < 20 ? 'text-red-600' : product.stock < 50 ? 'text-amber-600' : 'text-gray-800'}`}>
                          {product.stock}
                        </span>
                        <span className="text-xs text-gray-400">unid.</span>
                        {product.stock < 20 && <AlertTriangle className="w-4 h-4 text-red-500 ml-1" title="Stock bajo" />}
                      </div>
                    </td>

                    {/* Etiquetas */}
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1">
                        {product.onSale && (
                          <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                            Oferta
                          </span>
                        )}
                        {product.prescription && (
                          <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                            Receta
                          </span>
                        )}
                        {!product.onSale && !product.prescription && (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        product.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${product.is_active !== false ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                        {product.is_active !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingProduct({ ...product })}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProduct(product.id, product.name)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Edición de Producto */}
      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Edit className="w-5 h-5" />
                    Editar Producto
                  </h3>
                  <p className="text-blue-100 text-xs mt-0.5">ID: {editingProduct.id}</p>
                </div>
                <button
                  onClick={() => setEditingProduct(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Formulario */}
              <form onSubmit={handleUpdateProduct} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nombre */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Nombre del Producto *
                    </label>
                    <input
                      type="text"
                      required
                      value={editingProduct.name || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      placeholder="Ej. Paracetamol 500mg"
                    />
                  </div>

                  {/* Categoría */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Categoría
                    </label>
                    <select
                      value={editingProduct.category || 'Medicamentos'}
                      onChange={(e) => setEditingProduct({ 
                        ...editingProduct, 
                        category: e.target.value,
                        category_name: e.target.value 
                      })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Marca / Fabricante */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Marca / Laboratorio
                    </label>
                    <input
                      type="text"
                      value={editingProduct.brand || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      placeholder="Ej. Bayer, Genfar, Pfizer"
                    />
                  </div>

                  {/* Precio Regular */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Precio Regular (S/) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editingProduct.price ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Precio de Oferta */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Precio Oferta (S/ Opcional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingProduct.sale_price ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, sale_price: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      placeholder="Dejar vacío si no aplica"
                    />
                  </div>

                  {/* Stock Disponible */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Stock en Inventario *
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={editingProduct.stock ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      placeholder="Cantidad de unidades"
                    />
                  </div>

                  {/* Formato / Presentación */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Presentación / Formato
                    </label>
                    <input
                      type="text"
                      value={editingProduct.unit_type || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, unit_type: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      placeholder="Ej. Caja x 20 tabletas, Frasco 500ml"
                    />
                  </div>

                  {/* URL de Imagen */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      URL de Imagen del Producto
                    </label>
                    <div className="flex gap-3 items-center">
                      <input
                        type="url"
                        value={editingProduct.image_url || editingProduct.image || ''}
                        onChange={(e) => setEditingProduct({ 
                          ...editingProduct, 
                          image_url: e.target.value,
                          image: e.target.value 
                        })}
                        className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                        placeholder="https://..."
                      />
                      {(editingProduct.image_url || editingProduct.image) && (
                        <img 
                          src={editingProduct.image_url || editingProduct.image} 
                          alt="Preview" 
                          className="w-11 h-11 rounded-xl object-contain border bg-gray-50"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Descripción */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Descripción del Producto
                    </label>
                    <textarea
                      rows={3}
                      value={editingProduct.description || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      placeholder="Detalles sobre indicaciones, uso y beneficios..."
                    />
                  </div>
                </div>

                {/* Switches / Checkboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(editingProduct.onSale)}
                      onChange={(e) => setEditingProduct({ ...editingProduct, onSale: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-gray-800">🔥 En Oferta</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(editingProduct.prescription)}
                      onChange={(e) => setEditingProduct({ ...editingProduct, prescription: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-gray-800">📋 Requiere Receta</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={editingProduct.is_active !== false}
                      onChange={(e) => setEditingProduct({ ...editingProduct, is_active: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-gray-800">✅ Producto Activo</span>
                  </label>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-600/20"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSubmitting ? 'Guardando cambios...' : 'Guardar Cambios'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingProduct(null)}
                    className="flex-1 py-2.5 rounded-xl font-medium"
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Creación de Nuevo Producto */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Crear Nuevo Producto
                  </h3>
                  <p className="text-green-100 text-xs mt-0.5">Agrega un nuevo producto a tu inventario</p>
                </div>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Nombre del Producto *
                    </label>
                    <input
                      type="text"
                      required
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                      placeholder="Ej. Amoxicilina 500mg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Categoría
                    </label>
                    <select
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Marca / Laboratorio
                    </label>
                    <input
                      type="text"
                      value={newProduct.brand}
                      onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                      placeholder="Ej. Bayer, Pfizer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Precio Regular (S/) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={newProduct.price}
                      onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Stock Inicial *
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={newProduct.stock}
                      onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                      placeholder="Cantidad disponible"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      URL de Imagen (Opcional)
                    </label>
                    <input
                      type="url"
                      value={newProduct.image_url}
                      onChange={(e) => setNewProduct({ ...newProduct, image_url: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                      placeholder="https://images.unsplash.com/..."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Descripción
                    </label>
                    <textarea
                      rows={3}
                      value={newProduct.description}
                      onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none"
                      placeholder="Detalles sobre el producto..."
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-semibold shadow-lg shadow-green-600/20"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSubmitting ? 'Guardando...' : 'Crear Producto'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                    className="flex-1 py-2.5 rounded-xl font-medium"
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProductsManagement;
