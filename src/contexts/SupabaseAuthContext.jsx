import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui';
import { updateCustomerBehavior } from '@/lib/datawarehouseQueries';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleSession = useCallback(async (session) => {
    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      handleSession(session);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        handleSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, [handleSession]);

  const signUp = useCallback(async (email, password, options) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error en el registro",
          description: error.message || "Algo salió mal",
        });
        return { error };
      }

      if (data.user && data.session) {
        // El registro sin confirmación de correo entrega la sesión inmediatamente.
        await handleSession(data.session);

        toast({
          title: "¡Cuenta creada!",
          description: "Tu cuenta fue creada y ya has iniciado sesión.",
        });
      } else if (data.user) {
        const confirmationError = new Error(
          'El registro está esperando confirmación de correo. Desactiva "Confirm email" en Supabase para usar acceso inmediato.'
        );

        toast({
          variant: "destructive",
          title: "Configuración pendiente",
          description: confirmationError.message,
        });

        return { data, error: confirmationError, needsEmailConfirmation: true };
      }

      return { data, error: null, needsEmailConfirmation: false };
    } catch (err) {
      console.error('Error en signUp:', err);
      toast({
        variant: "destructive",
        title: "Error en el registro",
        description: err.message || "Ocurrió un error inesperado",
      });
      return { data: null, error: err, needsEmailConfirmation: false };
    }
  }, [toast, handleSession]);

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error al iniciar sesión",
          description: error.message || "Algo salió mal",
        });
        return { error };
      }

      if (data.user && data.session) {
        // Actualizar el estado inmediatamente
        await handleSession(data.session);
        
        // Registrar inicio de sesión en el datawarehouse (no bloqueante)
        updateCustomerBehavior(data.user.id, {
          sessions_count: 1,
          date_key: parseInt(new Date().toISOString().split('T')[0].replace(/-/g, ''))
        }).catch(err => console.log('Error updating customer behavior:', err));
        
        toast({
          title: "¡Bienvenido de vuelta!",
          description: "Has iniciado sesión correctamente.",
        });
      }

      return { error: null };
    } catch (err) {
      console.error('Error en signIn:', err);
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: err.message || "Ocurrió un error inesperado",
      });
      return { error: err };
    }
  }, [toast, handleSession]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast({
        variant: "destructive",
        title: "Error al cerrar sesión",
        description: error.message || "Algo salió mal",
      });
    } else {
      toast({
        title: "Sesión cerrada",
        description: "Has cerrado sesión correctamente.",
      });
    }

    return { error };
  }, [toast]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  }), [user, session, loading, signUp, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};