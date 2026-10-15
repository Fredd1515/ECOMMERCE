import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const mlInsights = require('../src/data/ml_insights.json');

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export default async function handler(req, res, runtimeEnv = {}) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: { message: 'Method not allowed.' } });
  }

  const supabaseUrl = runtimeEnv.supabaseUrl || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = runtimeEnv.supabaseKey
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY;
  const accessToken = getBearerToken(req);

  if (!supabaseUrl || !supabaseKey || !accessToken) {
    return sendJson(res, 401, { error: { message: 'Se requiere una sesión autenticada.' } });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return sendJson(res, 401, { error: { message: 'La sesión no es válida.' } });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError || profile?.role !== 'admin') {
      return sendJson(res, 403, { error: { message: 'Solo los administradores pueden acceder a los datos analíticos.' } });
    }

    return sendJson(res, 200, mlInsights);
  } catch (error) {
    console.error('ML insights admin endpoint error:', error);
    return sendJson(res, 500, { error: { message: 'No se pudieron cargar los datos analíticos.' } });
  }
}
