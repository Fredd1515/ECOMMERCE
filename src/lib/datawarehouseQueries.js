// =====================================================
// FUNCIONES DE CONSULTA PARA LA APLICACIÓN
// Versión limpia - solo funciones utilizadas
// =====================================================

import { supabase } from './customSupabaseClient';

// =====================================================
// PRODUCTOS
// =====================================================

/**
 * Obtiene todos los productos de la base de datos
 */
export const getProducts = async () => {
  try {
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (productsData && productsData.length > 0 && !productsError) {
      return { data: productsData, error: null };
    }

    return { data: null, error: null };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { data: null, error: null };
  }
};

/**
 * Actualiza un producto
 */
export const updateProduct = async (productId, updates) => {
  const timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from('products')
    .update({
      ...updates,
      updated_at: timestamp
    })
    .eq('id', productId)
    .select()
    .maybeSingle();

  if (data && !error) {
    return { data, error: null };
  }

  // Si no se actualizó, retornar datos actualizados sin error (modo offline)
  return {
    data: { id: productId, ...updates, updated_at: timestamp },
    error: null
  };
};

/**
 * Crea un nuevo producto
 */
export const createProduct = async (productData) => {
  const timestamp = new Date().toISOString();

  try {
    const toInsert = {
      ...productData,
      created_at: timestamp,
      updated_at: timestamp
    };

    const { data, error } = await supabase
      .from('products')
      .insert(toInsert)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error creating product:', error);
      return { data: { id: Date.now(), ...productData, created_at: timestamp }, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error creating product:', error);
    return { data: { id: Date.now(), ...productData, created_at: timestamp }, error };
  }
};

// =====================================================
// PROVEEDORES (SUPPLIERS)
// =====================================================

/**
 * Obtiene todos los proveedores
 */
export const getDataWarehouseSuppliers = async () => {
  try {
    const { data, error } = await supabase
      .from('dim_suppliers')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching suppliers:', error);
      return { data: [], error: null };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return { data: [], error: null };
  }
};

/**
 * Crea un nuevo proveedor
 */
export const createSupplier = async (supplierData) => {
  try {
    const { data, error } = await supabase
      .from('dim_suppliers')
      .insert(supplierData)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating supplier:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza un proveedor
 */
export const updateSupplier = async (supplierId, updates) => {
  try {
    const { data, error } = await supabase
      .from('dim_suppliers')
      .update(updates)
      .eq('supplier_id', supplierId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating supplier:', error);
    return { data: null, error };
  }
};

// =====================================================
// EMPLEADOS (EMPLOYEES)
// =====================================================

/**
 * Obtiene empleados con paginación y filtros
 */
export const getEmployees = async ({ page = 1, pageSize = 10, search = '', department = null, active = null } = {}) => {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('dim_employees')
      .select('*', { count: 'exact' })
      .order('hire_date', { ascending: false });

    if (search) {
      const term = `%${search}%`;
      query = query.or(`first_name.ilike.${term},last_name.ilike.${term},full_name.ilike.${term},email.ilike.${term}`);
    }

    if (department) {
      query = query.eq('department', department);
    }

    if (active !== null && active !== undefined) {
      query = query.eq('is_active', active);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    return { data: data || [], total: count || 0, error: null };
  } catch (error) {
    console.error('Error fetching employees:', error);
    return { data: [], total: 0, error };
  }
};

/**
 * Crea un nuevo empleado
 */
export const createEmployee = async (employeeData) => {
  try {
    const { data, error } = await supabase
      .from('dim_employees')
      .insert(employeeData)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating employee:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza un empleado
 */
export const updateEmployee = async (employeeId, updates) => {
  try {
    const { data, error } = await supabase
      .from('dim_employees')
      .update(updates)
      .eq('employee_id', employeeId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating employee:', error);
    return { data: null, error };
  }
};

// =====================================================
// PERFILES DE USUARIO
// =====================================================

/**
 * Obtiene el perfil de un usuario
 */
export const getProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // Error de RLS recursivo - no crítico
      if (error.code === '42P17' || error.message?.includes('recursion')) {
        console.warn('⚠ Error de política RLS detectado.');
        return { data: null, error: null };
      }

      // Perfil no existe - no crítico
      if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
        return { data: null, error: null };
      }

      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching profile:', error);

    if (error.code === '42P17' || error.message?.includes('recursion')) {
      return { data: null, error: null };
    }

    return { data: null, error };
  }
};

/**
 * Crea o actualiza un perfil
 */
export const upsertProfile = async (profileData) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        ...profileData,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error upserting profile:', error);
    return { data: null, error };
  }
};

// =====================================================
// PEDIDOS (ORDERS)
// =====================================================

/**
 * Obtiene todos los pedidos de un usuario
 */
export const getOrdersByUser = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_id,
          product_name,
          quantity,
          unit_price,
          total_price
        )
      `)
      .eq('customer_id', userId)
      .order('order_date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching orders:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza el estado de un pedido
 */
export const updateOrderStatus = async (orderId, status) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating order status:', error);
    return { data: null, error };
  }
};

/**
 * Crea un nuevo pedido
 */
export const createOrder = async (orderData, orderItems) => {
  try {
    // Crear el pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) throw orderError;

    // Crear los items del pedido
    const itemsWithOrderId = orderItems.map(item => ({
      ...item,
      order_id: order.id
    }));

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsWithOrderId)
      .select();

    if (itemsError) throw itemsError;

    return {
      data: { ...order, order_items: items },
      error: null
    };
  } catch (error) {
    console.error('Error creating order:', error);
    return { data: null, error };
  }
};

// =====================================================
// COMPORTAMIENTO DEL CLIENTE
// =====================================================

/**
 * Actualiza métricas de comportamiento del cliente
 * (Operación no crítica - no bloquea si falla)
 */
export const updateCustomerBehavior = async (customerId, behaviorData) => {
  try {
    const { data: customerData, error: customerError } = await supabase
      .from('dim_customers')
      .select('customer_key')
      .eq('user_id', customerId)
      .maybeSingle();

    if (customerError || !customerData) {
      console.log('Customer not found in dim_customers, skipping behavior update');
      return { data: null, error: null };
    }

    const { data, error } = await supabase
      .from('fact_customer_behavior')
      .upsert({
        customer_key: customerData.customer_key,
        ...behaviorData,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.log('Error updating customer behavior (non-critical):', error);
      return { data: null, error: null };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating customer behavior (non-critical):', error);
    return { data: null, error: null };
  }
};

