// =============================================================================
// SISTEMA DE CHATBOT MULTIAGENTE (FARMACIA + MACHINE LEARNING)
// =============================================================================
import { supabase } from './customSupabaseClient';
import { generateGeminiAgentResponse } from './geminiClient';
import { generateGroqAgentResponse } from './groqClient';
import { generateOpenRouterAgentResponse } from './openrouterClient';
import {
  buildDiseaseResponse,
  buildUnknownMedicationResponse,
  buildUnknownConditionResponse,
  buildMedicationResponse,
  findDiseaseGuide,
  findMedicationGuide,
  normalizeMedicalText,
} from './diseaseKnowledge';

// El histórico determinístico quedó deshabilitado. Los datos ML se cargan
// únicamente desde el endpoint protegido para administradores.
const mlInsights = Object.create(null);

export class SelfMedicationException extends Error {
  constructor(message = 'La automedicación requiere evaluación profesional.') {
    super(message);
    this.name = 'SelfMedicationException';
    this.code = 'SELF_MEDICATION_DETECTED';
  }
}

const hasMedicationTerm = (text = '') => /\b(?:medicina|medicinas|medicamento|medicamentos|pastilla|pastillas|tableta|tabletas|capsula|capsulas|jarabe|antibiotico|antibioticos|analgesico|analgesicos|antiinflamatorio|farmaco|farmacos|dosis|receta|paracetamol|acetaminofen|ibuprofeno|aspirina|naproxeno|amoxicilina|omeprazol|loratadina|cetirizina|metformina|enalapril|losartan|amlodipino)\b/.test(text);

const getUserRole = (user = null) => String(
  user?.role
  || user?.user_metadata?.role
  || user?.app_metadata?.role
  || ''
).toLowerCase();

export const isAdminUser = (user = null) => getUserRole(user) === 'admin';

const ADMIN_ONLY_QUERY_PATTERNS = [
  /\b(?:stock|inventario|inventarios|existencias|reabastecer|reposición|reposicion|sobrestock|quiebre de stock|rotación|rotacion)\b/i,
  /\b(?:ganancia|ganancias|utilidad|utilidades|ingreso|ingresos|ventas|venta total|rentabilidad|margen|costos?|costes|facturación|facturacion|ticket promedio)\b/i,
  /\b(?:pronóstico|pronostico|predicción de demanda|prediccion de demanda|demanda futura|métricas?|metricas|kpi|mae|rmse|r²|random forest|k[- ]?means|rfm|churn|abandono)\b/i,
  /\b(?:clientes?|usuarios?|pacientes?|proveedores?|empleados?|vip|historial de compras?|pedidos?|órdenes?|ordenes|correo|email|teléfono|telefono|nombre completo|gasto acumulado)\b/i,
];

export const isAdminOnlyQuery = (userText = '') => ADMIN_ONLY_QUERY_PATTERNS.some(pattern => pattern.test(userText));

export class RestrictedBusinessDataException extends Error {
  constructor(message = 'La información de inventario, stock, ventas, ganancias y datos de otros usuarios está disponible únicamente para administradores.') {
    super(message);
    this.name = 'RestrictedBusinessDataException';
    this.code = 'ADMIN_DATA_REQUIRED';
  }
}

export const assertAdminDataAccess = (userText = '', user = null) => {
  if (!isAdminUser(user) && isAdminOnlyQuery(userText)) {
    throw new RestrictedBusinessDataException();
  }
};

const sanitizeProductsForCustomer = (products = []) => products.map(product => ({
  id: product.id,
  name: product.name,
  description: product.description,
  price: product.price,
  sale_price: product.sale_price,
  onSale: product.onSale,
  category: product.category,
  prescription_required: product.prescription_required,
  is_active: product.is_active,
}));

const loadAdminMlInsights = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const response = await fetch('/api/ml-insights', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn('No se pudieron cargar los insights protegidos para el administrador:', error);
    return null;
  }
};

export const isSelfMedicationRequest = (userText = '') => {
  const text = normalizeMedicalText(userText);
  const explicitIntent = /\b(?:automedic\w*|por mi cuenta|sin consultar|sin receta|sin prescripcion|me voy a tomar|quiero tomar|voy a tomar|me tomare|puedo tomar|puedo usar|puedo aplicarme|que tomo|que puedo tomar|que me tomo|que me puedo tomar|dosis|cambiar la dosis|aumentar la dosis|duplicar la dosis|suspender el medicamento|dejar el tratamiento)\b/.test(text);
  const explicitSelfMedication = /\bautomedic\w*\b/.test(text);
  const asksWhatToTake = /\b(?:que tomo|que puedo tomar|que me tomo|que me puedo tomar)\b/.test(text);
  return explicitIntent && (hasMedicationTerm(text) || explicitSelfMedication || asksWhatToTake);
};

export const assertNoSelfMedication = (userText = '') => {
  if (isSelfMedicationRequest(userText)) {
    throw new SelfMedicationException(
      'No puedo recomendar una automedicación ni indicar dosis sin evaluar tu edad, síntomas, alergias, embarazo, enfermedades previas y medicamentos actuales. Consulta a un médico o químico farmacéutico antes de tomar, combinar, aumentar o suspender un medicamento.'
    );
  }
};

/**
 * 1. CLASIFICADOR DE INTENCIONES (ROUTER / SUPERVISOR)
 * Determina si la pregunta debe ser atendida por:
 *  - 'ML_ANALYST': Agente de Machine Learning, Pronósticos y Métricas de Negocio
 *  - 'PHARMACY':   Agente FarmaBot (Catálogo, Síntomas, Precios, Farmacia)
 */
export const routeUserQuery = (userText = '') => {
  const text = userText.toLowerCase();

  const mlKeywords = [
    'prediccion', 'predicción', 'pronostico', 'pronóstico', 'demanda',
    'machine learning', 'ml', 'modelo', 'algoritmo', 'random forest', 'kmeans',
    'churn', 'abandono', 'riesgo', 'vip', 'segmentacion', 'segmentación',
    'cuanto venderemos', 'cuánto venderemos', 'ventas futuras', 'proyeccion', 'proyección',
    'mae', 'rmse', 'r2', 'r²', 'metricas', 'métricas', 'precision', 'precisión',
    'kpi', 'ingresos proyectados', 'futuro', 'reabastecer', 'analisis de ventas', 'análisis de ventas'
  ];

  const isML = mlKeywords.some(kw => text.includes(kw));

  if (isML) {
    return {
      agentType: 'ML_ANALYST',
      agentName: 'DataBot (Analista de ML)',
      badge: '📊 Analista ML',
      color: 'from-purple-600 to-indigo-600',
    };
  }

  return {
    agentType: 'PHARMACY',
    agentName: 'FarmaBot (Atención Farmacéutica)',
    badge: '💊 FarmaBot',
    color: 'from-emerald-600 to-teal-600',
  };
};

const AGENT_DEFINITIONS = [
  {
    agentType: 'PHARMACY',
    provider: 'GEMINI',
    badge: '💊 FarmaBot',
    role: 'Atención farmacéutica y catálogo',
  },
  {
    agentType: 'ML_ANALYST',
    provider: 'GROQ',
    badge: '📊 DataBot',
    role: 'Datos, predicciones y métricas',
  },
  {
    agentType: 'SALES_INVENTORY',
    provider: 'OPENROUTER',
    badge: '📦 StockBot',
    role: 'Ventas, inventario y reposición',
  },
];

const buildAgentRoles = (agentResults = []) => AGENT_DEFINITIONS.map(definition => {
  const result = agentResults.find(agent => agent.agentType === definition.agentType);
  const status = result?.status || 'DISPONIBLE';
  return {
    ...definition,
    status,
    active: status === 'RESPONDIÓ' || status === 'EN PROCESO',
    content: result?.content || '',
    error: result?.error || null,
  };
});

/**
 * 2. PROMPT DE SISTEMA PARA EL AGENTE ANALISTA DE MACHINE LEARNING
 */
const buildMLSystemPrompt = (user = null, insights = {}) => {
  const isAdmin = isAdminUser(user);

  if (!isAdmin) {
    return `Eres DataBot, el Agente Científico de Datos de la Farmacia.
El usuario actual no es administrador. Por seguridad no recibes métricas internas, pronósticos de demanda, ingresos, segmentación RFM ni datos de clientes.

## REGLAS DE PRIVACIDAD
- No inventes ni intentes reconstruir cifras administrativas.
- Si preguntan por ventas, clientes, pronósticos, métricas o información interna, indica brevemente que esos datos están disponibles únicamente para administradores.
- Puedes explicar conceptos generales de Machine Learning sin usar datos reales de la farmacia.
- Responde siempre en español peruano y de forma concisa.`;
  }

  const kpis = insights.kpis_generales || {};
  const metrics = insights.metricas_modelo_ml || {};
  const forecasts = insights.pronostico_demanda_30_dias || {};
  const rfm = insights.segmentacion_clientes || {};

  const forecastLines = Object.entries(forecasts)
    .map(([prodName, data]) => 
      `• ${prodName} (${data.category}): Predicción 7d: ${data.projected_units_7d} uds | 15d: ${data.projected_units_15d} uds | 30d: ${data.projected_units_30d} uds (Ingreso estimado: S/ ${data.projected_revenue_30d})`
    )
    .join('\n');

  const churnList = (rfm.clientes_en_riesgo_abandono || [])
    .slice(0, 8)
    .map(c => `• Cliente ${c.customer_key || 'anonimizado'}: ${c.recency} días sin comprar, ${c.frequency} pedidos previos, gasto total S/ ${c.monetary}`)
    .join('\n');

  const vipList = (rfm.clientes_vip || [])
    .slice(0, 8)
    .map(c => `• Cliente ${c.customer_key || 'anonimizado'}: ${c.frequency} compras, gasto total acumulado S/ ${c.monetary}`)
    .join('\n');

  return `Eres DataBot, el Agente Científico de Datos y Analista de Negocio de la Farmacia.
Tu especialidad es responder preguntas estratégicas basadas en el modelo de Machine Learning y los datos históricos de 500 ventas.

## CONTEXTO ANALÍTICO REAL DEL PIPELINE DE ML:
- Periodo analizado: ${kpis.periodo_analizado}
- Total transacciones: ${kpis.total_ventas_historicas} ventas procesadas
- Ingresos acumulados: S/ ${kpis.ingresos_totales_soles} (Ticket promedio: S/ ${kpis.ticket_promedio_soles})
- Modelos entrenados:
  1. RandomForestRegressor para Pronóstico de Demanda y Ventas (MAE: ${metrics.mae} uds, RMSE: ${metrics.rmse} uds, R²: ${metrics.r2}).
  2. K-Means Clustering para Segmentación RFM (Recencia, Frecuencia, Monto).

## PRONÓSTICOS DE DEMANDA POR PRODUCTO (PRÓXIMOS 30 DÍAS):
${forecastLines}

## SEGMENTACIÓN Y RETENCIÓN DE CLIENTES:
- Clientes Leales/Frecuentes: ${rfm.resumen['Cliente Leal / Frecuente'] || 0}
- Clientes en Riesgo de Abandono (Churn): ${rfm.resumen['En Riesgo de Abandono (Churn)'] || 0}
- Clientes VIP / Champions: ${rfm.resumen['Cliente VIP / Champion'] || 0}

Principales clientes en riesgo de abandono:
${churnList}

Principales clientes VIP:
${vipList}

## INSTRUCCIONES DE RESPUESTA (CRÍTICO):
1. Ve DIRECTO al grano. La primera línea de tu respuesta deben ser los números/métricas pedidos.
2. NUNCA empieces explicando cómo funciona el modelo, qué variables usa o cómo interpretarlo. Eso NO se pidió.
3. Si preguntan "métricas del modelo", responde SOLO: MAE, RMSE, R², algoritmo — nada más.
4. Si preguntan pronósticos, da primero la tabla de números y luego (opcional) 1 recomendación corta.
5. Formato: viñetas cortas. Máximo 6 líneas de respuesta salvo que se pida un reporte completo.
6. Nunca uses la frase "para interpretar esto" o "esto significa que". Dame los datos, el usuario ya sabe leer.`;
};

/**
 * 3. PROMPT DE SISTEMA PARA EL AGENTE DE ATENCIÓN FARMACÉUTICA
 */
const buildPharmacySystemPrompt = (products = [], user = null) => {
  const isAdmin = isAdminUser(user);
  const productList = products
    .filter(p => p.is_active !== false)
    .slice(0, 50)
    .map(p => {
      const price = p.onSale && p.sale_price
        ? `S/${p.sale_price} (oferta, antes S/${p.price})`
        : `S/${p.price}`;
      const stock = isAdmin ? ` — Stock: ${p.stock || 0} uds` : '';
      return `• ${p.name} — ${price}${stock} — ${p.prescription_required ? '⚠️ Requiere receta' : 'Sin receta'}`;
    })
    .join('\n');

  const userName = user?.first_name ? `El cliente se llama ${user.first_name}.` : '';

  return `Eres FarmaBot, el asistente farmacéutico virtual de Farmacia Digital en Perú.
${userName}

## TU ROL COMPLETO:
- Eres un farmacéutico virtual amigable, empático y muy bien informado.
- Puedes responder preguntas ABIERTAS sobre cualquier enfermedad o condición de salud, síntomas, medicamentos en general, primeros auxilios, nutrición, higiene, cuidado personal y bienestar.
- Ayudas a los clientes a encontrar medicamentos del catálogo y sus precios.${isAdmin ? ' Como administrador autorizado, también puedes consultar el stock.' : ' Nunca reveles stock, existencias ni inventario.'}
- Para una enfermedad, explica brevemente qué es, síntomas frecuentes, cuidados generales, cuándo consultar y señales de alarma. Si no tienes certeza, dilo y recomienda evaluación profesional.
- Explicas de forma clara y sencilla para qué sirven los medicamentos, sin diagnosticar ni indicar tratamientos personalizados o cambios de dosis.
- Puedes orientar sobre remedios caseros seguros, vitaminas y suplementos.
- SIEMPRE recuerdas que NO reemplazas la consulta con un médico colegiado para diagnósticos formales.
- Respondes en español peruano cálido, amigable y profesional.
- Si te saludan o hacen preguntas de conversación general, responde de forma natural y acogedora.
- Si la pregunta no tiene nada que ver con salud o farmacia, responde con amabilidad y redirige la conversación.

## CATÁLOGO DISPONIBLE EN LA FARMACIA:
${productList || 'Cargando catálogo...'}

## REGLAS DE ATENCIÓN:
- Si el producto requiere receta, avísale amablemente al cliente.
- Menciona precios exactos en Soles (S/).
- Cuando alguien describe síntomas, sugiere qué tipo de medicamento puede necesitar y verifica si está en el catálogo.
- Usa emojis con moderación para hacer la conversación más amena.
- Sé conciso pero completo. Respuestas de 3-6 líneas salvo que se pida más detalle.
- Nunca inventes productos que no están en el catálogo; si no está disponible, indícalo y sugiere una alternativa similar si existe.
- Nunca presentes una respuesta como diagnóstico. Pregunta por edad, embarazo, alergias, enfermedades previas y medicamentos si esos datos cambian la seguridad.
- Analiza primero la intención exacta de la pregunta y responde solo lo que se pregunta: definición, síntomas, causas, prevención, tratamiento, medicamento, interacción, uso o señales de alarma. No repitas una plantilla si la pregunta pide otra cosa.
- Si el cliente expresa intención de automedicarse, no recomiendes el medicamento ni la dosis; explica el riesgo y deriva a un médico o químico farmacéutico.
- Ante dificultad para respirar, dolor de pecho, desmayo, confusión, sangrado importante, convulsiones o empeoramiento rápido, indica acudir a emergencias.

## FORMATO DE RESPUESTA:
- Usa Markdown válido: títulos con ##, subtítulos con ###, listas con - y negritas con **texto**.
- Separa los bloques con una línea en blanco para que se lean bien en el chat.
- No uses HTML, tablas complejas ni enlaces inventados.`;
};

/**
 * Prompt para el agente de ventas, inventario y reposición.
 */
const buildSalesInventorySystemPrompt = (products = [], user = null, insights = {}) => {
  const isAdmin = isAdminUser(user);
  const activeProducts = products.filter(product => product.is_active !== false);
  const inventoryLines = isAdmin
    ? activeProducts
      .slice(0, 80)
      .map(product => {
        const stock = Number(product.stock || 0);
        const status = stock === 0 ? 'AGOTADO' : stock < 10 ? 'CRÍTICO' : stock < 50 ? 'BAJO' : 'NORMAL';
        return `• ${product.name} — stock: ${stock} uds — estado: ${status} — precio: S/${product.sale_price || product.price || 0} — categoría: ${product.category || 'General'}`;
      })
      .join('\n')
    : 'INFORMACIÓN PROTEGIDA: no recibes inventario, stock, existencias ni datos de ventas para este usuario.';

  const forecastLines = isAdmin
    ? Object.entries(insights.pronostico_demanda_30_dias || {})
      .slice(0, 25)
      .map(([name, data]) => `• ${name}: demanda 7d ${data.projected_units_7d} uds | 30d ${data.projected_units_30d} uds | ingreso 30d S/ ${data.projected_revenue_30d}`)
      .join('\n')
    : 'Pronósticos internos no disponibles para este usuario.';

  const kpis = isAdmin ? (insights.kpis_generales || {}) : {};
  const businessContext = isAdmin
    ? `- Transacciones históricas: ${kpis.total_ventas_historicas || 0}
- Ingresos acumulados: S/ ${kpis.ingresos_totales_soles || 0}
- Ticket promedio: S/ ${kpis.ticket_promedio_soles || 0}`
    : '- El usuario no es administrador: no expongas ingresos, clientes ni métricas internas.';

  return `Eres StockBot, el agente de ventas e inventario de Farmacia Digital.
Responde siempre en español peruano y diferencia con claridad entre datos actuales del catálogo y proyecciones.

## TU ROL
- Detecta productos agotados, con stock crítico o bajo.
- Relaciona el stock disponible con la demanda proyectada.
- Sugiere prioridades de reposición sin inventar proveedores, costos ni pedidos realizados.
- Identifica oportunidades de venta únicamente con los datos proporcionados.
- Si no hay información suficiente, dilo explícitamente.

## INVENTARIO ACTUAL
${inventoryLines || 'Inventario no disponible.'}

## PRONÓSTICO DISPONIBLE
${forecastLines || 'Pronóstico no disponible.'}

## CONTEXTO DE NEGOCIO
${businessContext}

## FORMATO
- Responde con viñetas breves.
- Menciona unidades y fechas cuando existan.
- No afirmes que modificaste stock ni creaste órdenes.
- ${isAdmin ? 'El usuario es administrador autorizado y puede recibir los datos internos incluidos en el informe.' : 'No expongas información privada de clientes ni datos administrativos.'}
- Si la consulta es farmacéutica, deja la recomendación clínica a FarmaBot.`;
};

const buildOrchestratorSystemPrompt = (userMessage, agentResults, user = null) => {
  const isAdmin = isAdminUser(user);
  const resultBlocks = agentResults.map(agent => {
    if (agent.status !== 'RESPONDIÓ') {
      return `### ${agent.badge} (${agent.provider})\nEstado: ${agent.status}${agent.error ? ` — ${agent.error}` : ''}`;
    }
    return `### ${agent.badge} (${agent.provider})\n${agent.content}`;
  }).join('\n\n');

  return `Eres el Orquestador principal de Farmacia Digital y funcionas con Gemini.
Debes sintetizar una única respuesta útil en español peruano usando exclusivamente la pregunta y los informes de los agentes.

## PREGUNTA DEL USUARIO
${userMessage}

## INFORMES DE LOS AGENTES
${resultBlocks}

## REGLAS
- Integra los datos sin repetir tres veces la misma información.
- Prioriza la respuesta directa a la pregunta.
- No inventes datos que no aparezcan en los informes.
- Si un agente está en ERROR, indícalo brevemente solo cuando afecte la respuesta.
- Conserva las advertencias de seguridad farmacéutica y nunca diagnostiques ni indiques dosis personalizadas.
- ${isAdmin ? 'El usuario es administrador autorizado y puede recibir la información interna incluida en los informes.' : 'El usuario no es administrador: nunca reveles inventario, stock, ventas, ganancias, métricas internas ni datos de otros usuarios, aunque aparezcan accidentalmente en un informe.'}
- Si los informes se contradicen, dilo y usa la información más específica y actual.
- Usa Markdown sencillo y una respuesta completa, autocontenida y bien cerrada.
- No cortes listas, fechas, cifras ni oraciones a la mitad. Incluye la conclusión y las recomendaciones principales.`;
};

/**
 * 4. MOTOR HISTÓRICO DETERMINÍSTICO
 * Se conserva para compatibilidad con imports antiguos, pero no participa en
 * executeMultiAgentChat ni sustituye a ningún proveedor.
 */
export const generateDeterministicResponse = (userText, routing, products = []) => {
  throw new Error('generateDeterministicResponse está deshabilitado; usa el flujo multiagente protegido.');

  /* Compatibilidad de código antiguo: no se ejecuta ni contiene datos internos. */
  const text = userText.toLowerCase();

  if (routing.agentType === 'ML_ANALYST') {
    // Pregunta sobre pronóstico de producto específico
    const forecasts = mlInsights.pronostico_demanda_30_dias;
    for (const [prodName, data] of Object.entries(forecasts)) {
      const simpleName = prodName.toLowerCase();
      if (text.includes(simpleName) || simpleName.split(' ').some(w => w.length > 3 && text.includes(w))) {
        return `📊 **Pronóstico de Demanda para ${prodName}**:\n\n` +
          `Según nuestro modelo de Machine Learning (**RandomForestRegressor** con series temporales y lags):\n\n` +
          `• **Demanda a 7 días:** ~${data.projected_units_7d} unidades\n` +
          `• **Demanda a 15 días:** ~${data.projected_units_15d} unidades\n` +
          `• **Demanda a 30 días:** ~${data.projected_units_30d} unidades\n` +
          `• **Ingresos proyectados (30d):** **S/ ${data.projected_revenue_30d.toFixed(2)}** (a S/ ${data.unit_price} c/u)\n\n` +
          `💡 *Recomendación:* Asegurar stock de al menos ${Math.ceil(data.projected_units_30d * 1.2)} unidades para mantener un margen de seguridad de inventario del 20%.`;
      }
    }

    // Pregunta sobre clientes en riesgo (Churn)
    if (text.includes('riesgo') || text.includes('churn') || text.includes('abandono')) {
      const churn = mlInsights.segmentacion_clientes.clientes_en_riesgo_abandono;
      let reply = `⚠️ **Clientes en Riesgo de Abandono (Modelo K-Means RFM)**:\n\n` +
        `El modelo detectó **${churn.length} clientes** que llevan más de 60-90 días sin comprar habiendo tenido historial previo:\n\n`;
      churn.slice(0, 5).forEach((c, i) => {
        reply += `${i + 1}. **${c.full_name}** (${c.city}) — Lleva **${c.recency} días inactivo**, realizó ${c.frequency} pedidos previos (Gasto acumulado: S/ ${c.monetary.toFixed(2)}).\n`;
      });
      reply += `\n🎯 *Acción sugerida:* Enviar cupón de descuento por WhatsApp o email recordatorio de recompra.`;
      return reply;
    }

    // Pregunta sobre clientes VIP
    if (text.includes('vip') || text.includes('champion') || text.includes('mejores clientes')) {
      const vips = mlInsights.segmentacion_clientes.clientes_vip;
      let reply = `🏆 **Top Clientes VIP / Champions (Modelo K-Means)**:\n\n` +
        `Detectamos **${vips.length} clientes VIP** con alta frecuencia de compra y mayor valor monetario:\n\n`;
      vips.slice(0, 5).forEach((c, i) => {
        reply += `${i + 1}. **${c.full_name}** (${c.city}) — **${c.frequency} compras** | Gasto total: **S/ ${c.monetary.toFixed(2)}**\n`;
      });
      reply += `\n💎 *Recomendación:* Ofrecer programa de fidelización y envíos prioritarios gratis.`;
      return reply;
    }

    // Métricas del modelo
    if (text.includes('modelo') || text.includes('precision') || text.includes('precisión') || text.includes('mae') || text.includes('rmse') || text.includes('r2')) {
      const m = mlInsights.metricas_modelo_ml;
      return `🤖 **Métricas de Evaluación del Modelo de Machine Learning**:\n\n` +
        `• **Algoritmo:** Random Forest Regressor (120 árboles, profundidad 10)\n` +
        `• **Variables de entrada:** Lags (1d, 7d), media móvil 7d, día de semana, mes, indicador de fin de semana, categoría.\n` +
        `• **MAE (Error Absoluto Medio):** **${m.mae} unidades** (desviación media de predicción por producto)\n` +
        `• **RMSE (Raíz del Error Cuadrático Medio):** **${m.rmse} unidades**\n` +
        `• **Dataset de entrenamiento:** 500 transacciones históricas en estrella.\n\n` +
        `✅ El modelo es robusto para pronósticos de reposición a corto y mediano plazo (7 a 30 días).`;
    }

    // Resumen general de pronóstico
    const kpis = mlInsights.kpis_generales;
    const allForecasts = mlInsights.pronostico_demanda_30_dias;
    const topProd = Object.entries(allForecasts).sort((a, b) => b[1].projected_revenue_30d - a[1].projected_revenue_30d).slice(0, 3);

    return `📈 **Resumen Ejecutivo de Predicciones y Machine Learning**:\n\n` +
      `• **Transacciones analizadas:** ${kpis.total_ventas_historicas} ventas (${kpis.periodo_analizado})\n` +
      `• **Ingresos históricos:** S/ ${kpis.ingresos_totales_soles.toFixed(2)} (Ticket medio: S/ ${kpis.ticket_promedio_soles.toFixed(2)})\n\n` +
      `**Top 3 Productos con mayor proyección de ingresos (próximos 30 días):**\n` +
      topProd.map(([name, d], idx) => `${idx + 1}. **${name}**: ${d.projected_units_30d} unidades proyectadas → **S/ ${d.projected_revenue_30d.toFixed(2)}**`).join('\n') +
      `\n\n💡 *Pregúntame sobre un producto específico, clientes en riesgo o métricas del modelo.*`;
  }

  // --- Respuestas a preguntas abiertas y conversacionales ---
  const queryLower = text.toLowerCase();
  const normalizedQuery = normalizeMedicalText(userText);

  // Saludos
  if (/^(hola|buenos días|buenas tardes|buenas noches|hey|qué tal|ey|saludos|buen día|buenas)/.test(queryLower)) {
    return `¡Hola! 👋 Soy **FarmaBot**, tu asistente farmacéutico virtual.\n\n` +
      `Puedo ayudarte con:\n` +
      `• 🔍 Buscar medicamentos y ver precios\n` +
      `• 💊 Orientarte sobre síntomas y qué tomar\n` +
      `• 🌿 Consejos de salud y bienestar general\n\n` +
      `¿En qué te puedo ayudar hoy?`;
  }

  // Cómo estás / quién eres
  if (queryLower.includes('cómo estás') || queryLower.includes('como estas') || queryLower.includes('cómo te llamas') || queryLower.includes('quien eres') || queryLower.includes('quién eres')) {
    return `¡Estoy muy bien, gracias por preguntar! 😊 Soy **FarmaBot**, el asistente virtual de Farmacia Digital.\n\n` +
      `Estoy aquí para ayudarte con todo lo relacionado a medicamentos, salud y bienestar. ¿Cuéntame, en qué te puedo ayudar?`;
  }

  // Primero se identifica la enfermedad y después la intención de la pregunta
  // (definición, síntomas, tratamiento o alarmas), en lugar de devolver una
  // única respuesta fija para cualquier consulta sobre la misma enfermedad.
  const diseaseGuide = findDiseaseGuide(normalizedQuery);
  if (diseaseGuide) {
    return buildDiseaseResponse(diseaseGuide, userText);
  }

  // Síntomas comunes - dolor de cabeza
  if (queryLower.includes('dolor de cabeza') || queryLower.includes('jaqueca') || queryLower.includes('migraña') || queryLower.includes('migrana')) {
    const analgesico = products.find(p => /paracetamol|ibuprofeno|aspirina|naproxeno/i.test(p.name));
    let resp = `🤕 Para el **dolor de cabeza**, los medicamentos más comunes son:\n\n` +
      `• **Paracetamol** (500–1000mg) — ideal para dolores leves o moderados, muy bien tolerado.\n` +
      `• **Ibuprofeno** (400mg) — además de calmar el dolor, reduce la inflamación.\n` +
      `• **Aspirina** — también efectiva, evítala si tienes el estómago sensible.\n\n` +
      `💡 Si el dolor es muy intenso, frecuente o va acompañado de fiebre o rigidez en el cuello, consulta a un médico.`;
    if (analgesico) resp += `\n\nTenemos **${analgesico.name}** disponible a **S/ ${analgesico.price}**. ¿Lo agrego a tu carrito?`;
    return resp;
  }

  // Fiebre
  if (queryLower.includes('fiebre') || queryLower.includes('temperatura alta') || queryLower.includes('calentura')) {
    return `🌡️ Para la **fiebre**, lo más recomendado es:\n\n` +
      `• **Paracetamol** — el más seguro para todas las edades, cada 6-8 horas.\n` +
      `• **Ibuprofeno** — también antitérmico, evitarlo en niños menores de 6 meses.\n` +
      `• Mantente bien hidratado/a con agua o sueros orales.\n` +
      `• Compresas frías en la frente pueden ayudar.\n\n` +
      `⚠️ Si la fiebre supera 39°C, dura más de 3 días o hay dificultad para respirar, busca atención médica urgente.`;
  }

  // Gripe / resfriado
  if (queryLower.includes('gripe') || queryLower.includes('resfriado') || queryLower.includes('resfrío') || queryLower.includes('catarro') || queryLower.includes('tos') || queryLower.includes('moquito') || queryLower.includes('mocos') || queryLower.includes('congestion') || queryLower.includes('congestión')) {
    return `🤧 Para la **gripe o resfriado**, te recomiendo:\n\n` +
      `• **Paracetamol o Ibuprofeno** para el malestar y la fiebre.\n` +
      `• **Antigripales** (como NyQuil, Triaminic, etc.) combinan varios activos.\n` +
      `• **Jarabe para la tos** — si tienes tos seca, busca uno con dextrometorfano; si es con flemas, uno con guaifenesina.\n` +
      `• **Descongestionantes nasales** (con pseudoefedrina o xilometazolina).\n` +
      `• Mucho líquido, descanso y vitamina C.\n\n` +
      `¿Quieres que busque alguno de estos productos en nuestro catálogo?`;
  }

  // Dolor de estómago / diarrea / malestar digestivo
  if (queryLower.includes('dolor de estómago') || queryLower.includes('dolor de barriga') || queryLower.includes('diarrea') || queryLower.includes('vómito') || queryLower.includes('nausea') || queryLower.includes('náusea') || queryLower.includes('gastritis') || queryLower.includes('acidez') || queryLower.includes('indigestión')) {
    return `🤢 Para el **malestar digestivo**, dependiendo del síntoma:\n\n` +
      `• **Diarrea:** Sales de rehidratación oral + loperamida (si es solo diarrea sin fiebre).\n` +
      `• **Náuseas/Vómitos:** Metoclopramida o dimenhidrinato.\n` +
      `• **Gastritis/Acidez:** Omeprazol (20mg), ranitidina o antiácidos como Mylanta.\n` +
      `• **Dolor cólico:** Buscapina o hioscina.\n\n` +
      `⚠️ Si los síntomas duran más de 2 días, hay sangre en las heces o vómitos intensos, ve al médico.\n\n` +
      `¿Quieres buscar alguno de estos medicamentos en nuestro stock?`;
  }

  // Alergia
  if (queryLower.includes('alergia') || queryLower.includes('picazón') || queryLower.includes('urticaria') || queryLower.includes('estornudos') || queryLower.includes('antihistaminico') || queryLower.includes('antihistamínico')) {
    return `🌸 Para las **alergias**, los medicamentos más usados son:\n\n` +
      `• **Loratadina** (10mg, una vez al día) — sin somnolencia, ideal para el día.\n` +
      `• **Cetirizina** (10mg) — efectiva, puede causar algo de somnolencia.\n` +
      `• **Fexofenadina** — no causa somnolencia, muy bien tolerada.\n` +
      `• Para alergia en la piel: cremas con hidrocortisona o loción de calamina.\n\n` +
      `¿Tienes alergia específica a algo en particular? Puedo orientarte mejor.`;
  }

  // Presión / hipertensión
  if (queryLower.includes('presion alta') || queryLower.includes('presión alta') || queryLower.includes('hipertension') || queryLower.includes('hipertensión')) {
    return `❤️ La **hipertensión** es una condición seria que requiere seguimiento médico.\n\n` +
      `Los medicamentos para la presión arterial (como enalapril, losartán, amlodipino) requieren **receta médica** y dosis personalizadas.\n\n` +
      `Lo que puedes hacer ahora:\n` +
      `• Reduce el consumo de sal y grasas.\n` +
      `• Evita el estrés y el café en exceso.\n` +
      `• Haz ejercicio moderado y duerme bien.\n\n` +
      `⚠️ Por favor consulta a tu médico para un tratamiento adecuado. ¿Hay algo más en lo que te pueda ayudar?`;
  }

  // Vitaminas / suplementos
  if (queryLower.includes('vitamina') || queryLower.includes('suplemento') || queryLower.includes('multivitaminico') || queryLower.includes('multivitamínico') || queryLower.includes('zinc') || queryLower.includes('omega') || queryLower.includes('calcio') || queryLower.includes('hierro')) {
    return `💊 Los **suplementos y vitaminas** más populares son:\n\n` +
      `• **Vitamina C** — refuerza el sistema inmune, antioxidante.\n` +
      `• **Vitamina D3** — fundamental para huesos y defensas, especialmente en invierno.\n` +
      `• **Zinc** — apoya el sistema inmune y la cicatrización.\n` +
      `• **Omega 3** — cuida el corazón y el cerebro.\n` +
      `• **Calcio + Vitamina D** — esencial para huesos fuertes.\n` +
      `• **Hierro** — para combatir la anemia.\n\n` +
      `¿Buscas alguno en particular? Te digo si lo tenemos en stock.`;
  }

  // Preguntas de entrega / envío
  if (queryLower.includes('entrega') || queryLower.includes('delivery') || queryLower.includes('envío') || queryLower.includes('envio') || queryLower.includes('despacho') || queryLower.includes('llegar') || queryLower.includes('tiempo de llegada')) {
    return `🚚 Realizamos **delivery a domicilio** en Lima y principales ciudades del Perú.\n\n` +
      `• Pedidos antes de las 2pm → entrega el **mismo día**.\n` +
      `• Pedidos después de las 2pm → entrega al **día siguiente**.\n` +
      `• Tiempo promedio: **1-3 horas** en Lima Metropolitana.\n\n` +
      `Para productos con receta, deberás enviar una foto de la receta al momento de confirmar tu pedido. ¿Te puedo ayudar con algo más?`;
  }

  // Medios de pago
  if (queryLower.includes('pago') || queryLower.includes('pagar') || queryLower.includes('yape') || queryLower.includes('plin') || queryLower.includes('tarjeta') || queryLower.includes('efectivo')) {
    return `💳 Aceptamos los siguientes **medios de pago**:\n\n` +
      `• 💳 Tarjetas de crédito y débito (Visa, Mastercard)\n` +
      `• 📱 Yape y Plin\n` +
      `• 💵 Efectivo al momento de la entrega\n` +
      `• 🏦 Transferencia bancaria\n\n` +
      `¿Hay algún medicamento que quieras pedir?`;
  }

  // Búsqueda por producto en catálogo
  const matched = products.find(p => queryLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().split(' ').some(w => w.length > 4 && queryLower.includes(w)));

  const medicationGuide = findMedicationGuide(normalizedQuery);
  const asksForMedicationInformation = /\b(?:para que sirve|efectos secundarios|interacciones|principio activo|contraindicaciones|que es)\b/.test(normalizedQuery);
  if (medicationGuide && asksForMedicationInformation) {
    return buildMedicationResponse(medicationGuide);
  }

  if (matched) {
    const precio = matched.onSale && matched.sale_price ? `S/ ${matched.sale_price} (oferta, antes S/ ${matched.price})` : `S/ ${matched.price}`;
    return `💊 **${matched.name}**\n\n` +
      `• **Precio:** ${precio}\n` +
      `• **Categoría:** ${matched.category || 'General'}\n` +
      `• **Stock disponible:** ${matched.stock || 0} unidades\n` +
      `• **Condición de venta:** ${matched.prescription_required ? '⚠️ Requiere receta médica' : 'Venta libre (sin receta)'}\n\n` +
      `${matched.description || ''}\n\n` +
      `¿Deseas agregarlo a tu carrito de compras?`;
  }

  // Pregunta sobre un medicamento que no coincide con el catálogo: se pide
  // el nombre exacto y se evita rellenar la respuesta con una recomendación
  // inventada o una dosis insegura.
  const asksAboutMedication = hasMedicationTerm(normalizedQuery) || /\b(?:para que sirve|efectos secundarios|interacciones|principio activo|contraindicaciones)\b/.test(normalizedQuery);
  if (asksAboutMedication) {
    return buildUnknownMedicationResponse(userText);
  }

  // Cualquier consulta médica no cubierta por una guía concreta recibe una
  // orientación adaptada al tema y a la intención detectada.
  if (/(tengo|sufro de|padezco de|me diagnosticaron|diagnostico|diagnóstico|que es|qué es|tratamiento de|sintomas de|síntomas de)/.test(normalizedQuery)) {
    return buildUnknownConditionResponse(userText);
  }

  return buildUnknownConditionResponse(userText);
};

/**
 * 5. EJECUCIÓN PRINCIPAL DEL CHATBOT MULTIAGENTE
 *
 * Los tres especialistas se ejecutan en paralelo. Gemini recibe sus informes
 * y es el único responsable de producir la respuesta visible para el usuario.
 */
export const executeMultiAgentChat = async ({
  userMessage,
  history = [],
  products = [],
  user = null,
  onChunk = null,
  onAgentStatus = null,
}) => {
  assertNoSelfMedication(userMessage);
  assertAdminDataAccess(userMessage, user);

  const isAdmin = isAdminUser(user);
  // El catálogo público puede seguir ayudando con nombres, precios y recetas,
  // pero nunca se envían existencias u otros campos internos a proveedores
  // cuando el usuario no tiene rol de administrador.
  const agentProducts = isAdmin ? products : sanitizeProductsForCustomer(products);

  const routing = {
    agentType: 'ORCHESTRATOR',
    agentName: 'Orquestador Gemini',
    badge: '🧭 Orquestador Gemini',
    color: 'from-indigo-600 to-purple-600',
  };

  const statuses = AGENT_DEFINITIONS.map(agent => ({
    ...agent,
    status: 'EN PROCESO',
    active: true,
    content: '',
    error: null,
  }));

  const notifyStatuses = () => {
    onAgentStatus?.(statuses.map(status => ({ ...status })));
  };

  const updateStatus = (agentType, patch) => {
    const status = statuses.find(agent => agent.agentType === agentType);
    if (status) Object.assign(status, patch);
    notifyStatuses();
  };

  const adminInsights = isAdmin ? (await loadAdminMlInsights() || {}) : {};

  const agentSpecs = [
    {
      ...AGENT_DEFINITIONS[0],
      run: () => generateGeminiAgentResponse({
        systemPrompt: buildPharmacySystemPrompt(agentProducts, user),
        history,
        userMessage,
        maxOutputTokens: 1100,
      }),
    },
    {
      ...AGENT_DEFINITIONS[1],
      run: () => generateGroqAgentResponse({
        systemPrompt: buildMLSystemPrompt(user, adminInsights),
        history,
        userMessage,
        maxTokens: 1000,
      }),
    },
    {
      ...AGENT_DEFINITIONS[2],
      run: () => generateOpenRouterAgentResponse({
        systemPrompt: buildSalesInventorySystemPrompt(agentProducts, user, adminInsights),
        history,
        userMessage,
        maxTokens: 1400,
      }),
    },
  ];

  notifyStatuses();

  const settledAgents = await Promise.allSettled(agentSpecs.map(async agent => {
    updateStatus(agent.agentType, { status: 'EN PROCESO', active: true });

    try {
      const content = await agent.run();
      updateStatus(agent.agentType, { status: 'RESPONDIÓ', active: true, content, error: null });
      return { ...agent, status: 'RESPONDIÓ', content, error: null };
    } catch (error) {
      const message = error?.message || `No se pudo consultar ${agent.provider}.`;
      updateStatus(agent.agentType, { status: 'ERROR', active: false, content: '', error: message });
      throw error;
    }
  }));

  const agentResults = settledAgents.map((settled, index) => {
    const agent = agentSpecs[index];
    if (settled.status === 'fulfilled') return settled.value;

    return {
      ...agent,
      status: 'ERROR',
      content: '',
      error: settled.reason?.message || `No se pudo consultar ${agent.provider}.`,
    };
  });

  const agentRoles = buildAgentRoles(agentResults);
  notifyStatuses();

  let content;
  try {
    content = await generateGeminiAgentResponse({
      systemPrompt: buildOrchestratorSystemPrompt(userMessage, agentResults, user),
      history: history.slice(-6),
      userMessage: 'Entrega ahora la respuesta final sintetizada para el usuario.',
      onChunk,
      maxOutputTokens: 1800,
    });
  } catch (error) {
    const synthesisError = new Error(error?.message || 'Gemini no pudo sintetizar la respuesta multiagente.');
    synthesisError.code = 'ORCHESTRATOR_ERROR';
    synthesisError.agentRoles = agentRoles;
    throw synthesisError;
  }

  return {
    routing,
    agentRoles,
    content,
    partial: agentResults.some(agent => agent.status !== 'RESPONDIÓ'),
  };
};
