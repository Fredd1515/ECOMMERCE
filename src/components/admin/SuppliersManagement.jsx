import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, Save, X, RefreshCw, Download, Truck, Phone, Mail } from 'lucide-react';
import { Button, toast } from '@/components/ui';
import { getDataWarehouseSuppliers, createSupplier, updateSupplier } from '@/lib/datawarehouseQueries';

const SuppliersManagement = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await getDataWarehouseSuppliers();
      if (error) throw new Error(error);
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los proveedores",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreateSupplier = () => {
    setEditingSupplier({
      supplier_id: '',
      supplier_name: '',
      contact_info: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      country: 'Perú',
      is_active: true,
      payment_terms: 'Net 30',
      product_categories: ''
    });
    setIsModalOpen(true);
  };

  const openEditSupplier = (supplier) => {
    setEditingSupplier({ ...supplier });
    setIsModalOpen(true);
  };

  const handleInputChange = (field, value) => {
    setEditingSupplier(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveSupplier = async () => {
    if (!editingSupplier?.supplier_name) {
      toast({
        title: 'Campo requerido',
        description: 'El nombre del proveedor es obligatorio',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);

      // Determinar si es creación o actualización
      if (editingSupplier.supplier_id && editingSupplier.supplier_key) {
        // Actualizar proveedor existente
        const { data, error } = await updateSupplier(editingSupplier.supplier_id, editingSupplier);

        if (error) throw error;

        toast({
          title: 'Proveedor actualizado',
          description: 'Los datos del proveedor se han actualizado correctamente'
        });
      } else {
        // Crear nuevo proveedor
        const { data, error } = await createSupplier(editingSupplier);

        if (error) throw error;

        toast({
          title: 'Proveedor creado',
          description: 'El proveedor se ha creado correctamente'
        });
      }

      setIsModalOpen(false);
      setEditingSupplier(null);
      await loadSuppliers();
    } catch (error) {
      console.error('Error saving supplier:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar los datos del proveedor',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const exportSuppliers = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Proveedor,Total Compras,Productos,Contacto,Estado\n"
      + suppliers.map(supplier =>
          `${supplier.supplier_name},${supplier.total_purchases || 0},${supplier.product_count || 0},${supplier.contact_info || ''},${supplier.is_active ? 'Activo' : 'Inactivo'}`
        ).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `proveedores_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-800">Gestión de Proveedores</h3>
          <p className="text-gray-600 mt-1">Administra tus proveedores y relaciones comerciales</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={loadSuppliers}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            onClick={exportSuppliers}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={openCreateSupplier}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Proveedor
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-xl shadow-sm border"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Proveedores</p>
              <p className="text-2xl font-bold text-blue-600">{suppliers.length}</p>
            </div>
            <Truck className="w-8 h-8 text-blue-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-xl shadow-sm border"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Proveedores Activos</p>
              <p className="text-2xl font-bold text-green-600">
                {suppliers.filter(s => s.is_active).length}
              </p>
            </div>
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-xl shadow-sm border"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Compras</p>
              <p className="text-2xl font-bold text-purple-600">
                S/{suppliers.reduce((sum, s) => sum + (s.total_purchases || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold text-sm">S/</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Suppliers Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white rounded-xl shadow-sm border overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proveedor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Compras
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Productos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Última Compra
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {suppliers.map((supplier) => (
                <tr key={supplier.supplier_key || supplier.supplier_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Truck className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {supplier.supplier_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{supplier.contact_info}</div>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <Mail className="w-3 h-3" />
                      {supplier.email || 'No email'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    S/{supplier.total_purchases?.toLocaleString() || '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {supplier.product_count || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {supplier.last_purchase_date
                      ? new Date(supplier.last_purchase_date).toLocaleDateString('es-PE')
                      : 'N/A'
                    }
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      supplier.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {supplier.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditSupplier(supplier)}
                      className="hover:bg-blue-50 hover:text-blue-600 hover:border-blue-600"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}

              {suppliers.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-lg font-medium">No hay proveedores registrados</p>
                    <p className="text-sm">Agrega tu primer proveedor para comenzar</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            <p className="mt-2 text-gray-600">Cargando proveedores...</p>
          </div>
        )}
      </motion.div>

      {/* Modal para crear/editar proveedor */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  {editingSupplier?.supplier_key ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                </h3>
                {editingSupplier?.supplier_key && (
                  <p className="text-sm text-gray-500 mt-1">
                    {editingSupplier.supplier_name}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setIsModalOpen(false); setEditingSupplier(null); }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Proveedor *
                </label>
                <input
                  type="text"
                  value={editingSupplier?.supplier_name || ''}
                  onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Laboratorio ABC"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  value={editingSupplier?.contact_person || editingSupplier?.contact_info || ''}
                  onChange={(e) => handleInputChange('contact_person', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre del contacto"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email de Contacto
                </label>
                <input
                  type="email"
                  value={editingSupplier?.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="contacto@proveedor.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={editingSupplier?.phone || ''}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="+51 987 654 321"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ciudad
                </label>
                <input
                  type="text"
                  value={editingSupplier?.city || ''}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Lima, Perú"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección
                </label>
                <textarea
                  value={editingSupplier?.address || ''}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Dirección completa del proveedor"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Términos de Pago
                </label>
                <select
                  value={editingSupplier?.payment_terms || 'Net 30'}
                  onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Net 15">Net 15 días</option>
                  <option value="Net 30">Net 30 días</option>
                  <option value="Net 60">Net 60 días</option>
                  <option value="COD">Contra entrega</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categorías de Productos
                </label>
                <input
                  type="text"
                  value={editingSupplier?.product_categories || ''}
                  onChange={(e) => handleInputChange('product_categories', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="Medicamentos, Cosméticos, etc."
                />
              </div>

              <div className="flex items-center space-x-2 mt-2">
                <input
                  id="supplier-active"
                  type="checkbox"
                  checked={!!editingSupplier?.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="supplier-active" className="text-sm text-gray-700">
                  Proveedor activo
                </label>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <Button
                onClick={handleSaveSupplier}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar
              </Button>
              <Button
                variant="outline"
                onClick={() => { setIsModalOpen(false); setEditingSupplier(null); }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SuppliersManagement;
