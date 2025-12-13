import React, { useState, useEffect } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { AnimatePresence } from 'framer-motion';
import { toast } from '@/components/ui';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Hero from '@/components/layout/Hero';
import ProductGrid from '@/components/shop/ProductGrid';
import Cart from '@/components/shop/Cart';
import ServicesSection from '@/components/shop/ServicesSection';
import LoginModal from '@/components/modals/LoginModal';
import OrderTrackingModal from '@/components/modals/OrderTrackingModal';
import AddressModal from '@/components/modals/AddressModal';
import AdminPanel from '@/components/admin/AdminPanel';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  getProducts, 
  getProfile, 
  getOrdersByUser, 
  updateProduct, 
  updateOrderStatus,
  createOrder,
  updateCustomerBehavior,
  createProduct
} from '@/lib/datawarehouseQueries';
import { selectMonthlyOffers } from '@/lib/utils';

function App() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const handleSearchChange = (term) => {
    setSearchTerm(term);
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    // Scroll to products section
    const productsSection = document.getElementById('productos');
    if (productsSection) {
      productsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Calcular categorías dinámicas desde los productos
  const categories = ['all', ...new Set(products.map(product => product.category).filter(Boolean))];

  useEffect(() => {
    const savedCart = localStorage.getItem('pharmacy_cart');
    if (savedCart) setCart(JSON.parse(savedCart));

    fetchProducts();
    
    // Scroll al inicio de la página al cargar
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchOrders();
    } else {
      setProfile(null);
      setOrders([]);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('pharmacy_cart', JSON.stringify(cart));
  }, [cart]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data, error } = await getProfile(user.id);
    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await getProducts();
    if (error) {
      console.error('Error fetching products:', error);
      toast({ title: "Error", description: "No se pudieron cargar los productos.", variant: "destructive" });
    } else {
      if (!data || data.length === 0) {
        const mockProducts = [
          {
            id: 1,
            name: 'Protector Solar SPF 50+',
            description: 'Protección solar de amplio espectro para todo tipo de piel',
            price: 25.50,
            category: 'Fotoprotección',
            stock: 100,
            onSale: false,
            prescription: false
          },
          {
            id: 2,
            name: 'Shampoo Anticaspa',
            description: 'Shampoo especializado para el control de la caspa y cuidado del cuero cabelludo',
            price: 18.75,
            category: 'Cuidado del cabello',
            stock: 80,
            onSale: true,
            originalPrice: 22.50,
            prescription: false
          },
          {
            id: 3,
            name: 'Pañales Talla M',
            description: 'Pañales ultra absorbentes para bebés de 4-9 kg',
            price: 35.00,
            category: 'Mamá & Bebé',
            stock: 50,
            onSale: false,
            prescription: false
          },
          {
            id: 4,
            name: 'Vitamina C 1000mg',
            description: 'Suplemento vitamínico para fortalecer el sistema inmunológico',
            price: 30.00,
            category: 'Vitaminas',
            stock: 60,
            onSale: false,
            prescription: false
          },
          {
            id: 5,
            name: 'Crema Hidratante Facial',
            description: 'Crema hidratante con ácido hialurónico para piel seca',
            price: 28.90,
            category: 'Fotoprotección',
            stock: 45,
            onSale: true,
            originalPrice: 35.00,
            prescription: false
          },
          {
            id: 6,
            name: 'Acondicionador Reparador',
            description: 'Acondicionador para cabello dañado con queratina',
            price: 22.00,
            category: 'Cuidado del cabello',
            stock: 70,
            onSale: false,
            prescription: false
          },
          {
            id: 7,
            name: 'Leche de Fórmula 1',
            description: 'Fórmula láctea para bebés de 0-6 meses',
            price: 45.00,
            category: 'Mamá & Bebé',
            stock: 30,
            onSale: false,
            prescription: false
          },
          {
            id: 8,
            name: 'Multivitamínico Completo',
            description: 'Complejo vitamínico con 12 vitaminas esenciales',
            price: 42.50,
            category: 'Vitaminas',
            stock: 40,
            onSale: true,
            originalPrice: 50.00,
            prescription: false
          },
          {
            id: 9,
            name: 'Bloqueador Solar Facial SPF 30',
            description: 'Protector solar específico para el rostro con textura ligera',
            price: 32.00,
            category: 'Fotoprotección',
            stock: 55,
            onSale: false,
            prescription: false
          },
          {
            id: 10,
            name: 'Tratamiento Capilar Nutritivo',
            description: 'Mascarilla intensiva para cabello seco y maltratado',
            price: 28.50,
            category: 'Cuidado del cabello',
            stock: 40,
            onSale: true,
            originalPrice: 35.00,
            prescription: false
          },
          {
            id: 11,
            name: 'Toallitas Húmedas para Bebé',
            description: 'Toallitas suaves con aloe vera para el cuidado del bebé',
            price: 12.50,
            category: 'Mamá & Bebé',
            stock: 200,
            onSale: false,
            prescription: false
          },
          {
            id: 12,
            name: 'Crema para Pañalitis',
            description: 'Crema protectora y reparadora con óxido de zinc',
            price: 18.00,
            category: 'Mamá & Bebé',
            stock: 85,
            onSale: false,
            prescription: false
          },
          {
            id: 13,
            name: 'Omega 3 Premium',
            description: 'Suplemento de ácidos grasos omega 3 para la salud cardiovascular',
            price: 55.00,
            category: 'Vitaminas',
            stock: 60,
            onSale: true,
            originalPrice: 65.00,
            prescription: false
          },
          {
            id: 14,
            name: 'After Sun Reparador',
            description: 'Loción calmante y refrescante para después de la exposición solar',
            price: 24.90,
            category: 'Fotoprotección',
            stock: 48,
            onSale: false,
            prescription: false
          },
          {
            id: 15,
            name: 'Serum Capilar Fortificante',
            description: 'Tratamiento intensivo para prevenir la caída del cabello',
            price: 38.00,
            category: 'Cuidado del cabello',
            stock: 35,
            onSale: false,
            prescription: false
          }
        ];
        // Aplicar selección mensual de ofertas
        const monthly = selectMonthlyOffers(mockProducts, 5, new Date());
        setProducts(monthly);
      } else {
        // Aplicar selección mensual de ofertas a los productos reales
        const monthly = selectMonthlyOffers(data, 5, new Date());
        setProducts(monthly);
      }
    }
  };

  const fetchOrders = async () => {
    if (!user) return;
    const { data, error } = await getOrdersByUser(user.id);
    if (error) {
      toast({ title: "Error", description: "No se pudieron cargar los pedidos.", variant: "destructive" });
    } else {
      setOrders(data);
    }
  };

  const addToCart = async (product, quantity = 1) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item));
    } else {
      setCart([...cart, { ...product, quantity }]);
    }
    
    // Registrar comportamiento del cliente en el datawarehouse
    if (user) {
      await updateCustomerBehavior(user.id, {
        cart_additions: 1,
        date_key: parseInt(new Date().toISOString().split('T')[0].replace(/-/g, ''))
      });
    }
    
    toast({ title: "¡Producto agregado!", description: `${product.name} se agregó al carrito` });
  };

  const removeFromCart = (productId) => setCart(cart.filter(item => item.id !== productId));

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(cart.map(item => item.id === productId ? { ...item, quantity } : item));
  };

  const handleLogout = async () => {
    await signOut();
    setIsAdminPanelOpen(false);
    toast({ title: "Sesión cerrada", description: "Has cerrado sesión correctamente." });
  };

  const handleUpdateProduct = async (updatedProduct) => {
    const { data, error } = await updateProduct(updatedProduct.id, updatedProduct);
    
    if (error) {
      toast({ title: "Error", description: "No se pudo actualizar el producto.", variant: "destructive" });
    } else {
      // Actualizar producto en el estado local inmediatamente
      setProducts(prevProducts => 
        prevProducts.map(p => p.id === data.id ? { ...p, ...data } : p)
      );
      toast({ title: "Producto actualizado", description: "Los cambios se han guardado." });
      
      // Intentar recargar productos desde la BD (si existen)
      // Si no hay productos en BD, mantener los cambios locales
      const { data: freshProducts } = await getProducts();
      if (freshProducts && freshProducts.length > 0) {
        const monthly = selectMonthlyOffers(freshProducts, 5, new Date());
        setProducts(monthly);
      }
    }
  };

  const handleUpdateOrder = async (updatedOrder) => {
    const { data, error } = await updateOrderStatus(updatedOrder.id, updatedOrder.status);

    if (error) {
      toast({ title: "Error", description: "No se pudo actualizar el pedido.", variant: "destructive" });
    } else {
      // Actualizar orden en el estado local
      setOrders(orders.map(o => o.id === data.id ? data : o));
      toast({ title: "Estado del pedido actualizado", description: `Pedido ${data.order_code} ahora está ${data.status}.` });
      
      // Recargar órdenes desde la BD para sincronizar
      fetchOrders();
    }
  };

  const handleTrackOrderClick = async () => {
    if (user) {
      setIsLoadingOrders(true);
      // Recargar pedidos antes de abrir el modal para tener la información más actualizada
      await fetchOrders();
      setIsLoadingOrders(false);
      setIsTrackingOpen(true);
    } else {
      toast({
        title: "Inicia sesión",
        description: "Debes iniciar sesión para ver tus pedidos.",
        variant: "destructive",
      });
      setIsLoginOpen(true);
    }
  };

  const handleCreateProduct = async (product) => {
    // Intentar crear producto en BD
    const { data, error } = await createProduct(product);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo crear el producto en la base de datos, se usará localmente', variant: 'destructive' });
      // Añadir producto localmente con ID temporal
      const temp = { id: Date.now(), ...product };
      setProducts(prev => [...prev, temp]);
      return temp;
    }

    // Si se creó en BD, recargar productos aplicando ofertas mensuales
    const { data: freshProducts } = await getProducts();
    if (freshProducts && freshProducts.length > 0) {
      const monthly = selectMonthlyOffers(freshProducts, 5, new Date());
      setProducts(monthly);
    } else if (data) {
      setProducts(prev => [...prev, data]);
    }

    return data;
  };

  const cartItemsCount = cart.reduce((total, item) => total + item.quantity, 0);

  return (
    <HelmetProvider>
      <>
        <Helmet>
          <title>Farmacia Salud Total - Tu farmacia de confianza online</title>
          <meta name="description" content="Farmacia Salud Total ofrece medicamentos, vitaminas y servicios de salud con los mejores precios y atención personalizada. Compra online con descuentos exclusivos." />
        </Helmet>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
          <Header
            user={profile}
            cartItemsCount={cartItemsCount}
            onCartClick={() => setIsCartOpen(true)}
            onLoginClick={() => setIsLoginOpen(true)}
            onLogout={handleLogout}
            onAdminClick={() => setIsAdminPanelOpen(true)}
            onTrackOrderClick={handleTrackOrderClick}
            isLoadingOrders={isLoadingOrders}
            onAddressClick={() => {
              if (user) {
                setIsAddressOpen(true);
              } else {
                toast({
                  title: "Inicia sesión",
                  description: "Debes iniciar sesión para ingresar tu dirección.",
                  variant: "destructive",
                });
                setIsLoginOpen(true);
              }
            }}
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            onCategoryClick={handleCategoryClick}
            selectedCategory={selectedCategory}
            categories={categories}
          />
          <main>
            <Hero />
            <ProductGrid 
              products={products} 
              onAddToCart={addToCart} 
              user={user} 
              searchTerm={searchTerm} 
              selectedCategory={selectedCategory}
            />
            <ServicesSection />
          </main>
          <Footer />
          <AnimatePresence>
            {isCartOpen && <Cart cart={cart} onClose={() => setIsCartOpen(false)} onRemoveItem={removeFromCart} onUpdateQuantity={updateCartQuantity} user={user} />}
          </AnimatePresence>
          <AnimatePresence>
            {isLoginOpen && <LoginModal onClose={() => setIsLoginOpen(false)} onLoginSuccess={async () => {
              setIsLoginOpen(false);
              // Esperar un momento para que el contexto se actualice
              await new Promise(resolve => setTimeout(resolve, 100));
            }} />}
          </AnimatePresence>
          <AnimatePresence>
            {isTrackingOpen && user && <OrderTrackingModal onClose={() => setIsTrackingOpen(false)} orders={orders} />}
          </AnimatePresence>
          <AnimatePresence>
            {isAdminPanelOpen && profile?.role === 'admin' && (
              <AdminPanel
                onClose={() => setIsAdminPanelOpen(false)}
                products={products}
                onUpdateProduct={handleUpdateProduct}
                onCreateProduct={handleCreateProduct}
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isAddressOpen && (
              <AddressModal
                onClose={() => setIsAddressOpen(false)}
                user={user}
                profile={profile}
                onAddressSaved={(updatedProfile) => {
                  setProfile(updatedProfile);
                  setIsAddressOpen(false);
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </>
    </HelmetProvider>
  );
}

export default App;
