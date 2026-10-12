// =============================================================================
// SISTEMA DE CHATBOT MULTIAGENTE (FARMACIA + MACHINE LEARNING)
// =============================================================================
import mlInsights from '../data/ml_insights.json';
import { GROQ_MODEL } from './groqClient';
import {
  buildDiseaseResponse,
  buildUnknownMedicationResponse,
  buildUnknownConditionResponse,
  buildMedicationResponse,
  findDiseaseGuide,
  findMedicationGuide,
  normalizeMedicalText,
} from './diseaseKnowledge';

const IS_DEVELOPMENT = import.meta.env.DEV;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const GROQ_ENDPOINT = IS_DEVELOPMENT && GROQ_API_KEY
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : '/api/groq';

export class SelfMedicationException extends Error {
  constructor(message = 'La automedicación requiere evaluación profesional.') {
    super(message);
    this.name = 'SelfMedicationException';
    this.code = 'SELF_MEDICATION_DETECTED';
  }
}

const hasMedicationTerm = (text = '') => /\b(?:medicina|medicinas|medicamento|medicamentos|pastilla|pastillas|tableta|tabletas|capsula|capsulas|jarabe|antibiotico|antibioticos|analgesico|analgesicos|antiinflamatorio|farmaco|farmacos|dosis|receta|paracetamol|acetaminofen|ibuprofeno|aspirina|naproxeno|amoxicilina|omeprazol|loratadina|cetirizina|metformina|enalapril|losartan|amlodipino)\b/.test(text);

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

const buildAgentRoles = (routing) => [
  {
    agentType: 'PHARMACY',
    badge: '💊 FarmaBot',
    role: 'Atención farmacéutica y catálogo',
    status: routing.agentType === 'PHARMACY' ? 'RESPONDIÓ' : 'NO REQUERIDO',
    active: routing.agentType === 'PHARMACY',
  },
  {
    agentType: 'ML_ANALYST',
    badge: '📊 DataBot',
    role: 'Datos, predicciones y métricas',
    status: routing.agentType === 'ML_ANALYST' ? 'RESPONDIÓ' : 'NO REQUERIDO',
    active: routing.agentType === 'ML_ANALYST',
  },
];

/**
 * 2. PROMPT DE SISTEMA PARA EL AGENTE ANALISTA DE MACHINE LEARNING
 */
const buildMLSystemPrompt = () => {
  const kpis = mlInsights.kpis_generales;
  const metrics = mlInsights.metricas_modelo_ml;
  const forecasts = mlInsights.pronostico_demanda_30_dias;
  const rfm = mlInsights.segmentacion_clientes;

  const forecastLines = Object.entries(forecasts)
    .map(([prodName, data]) => 
      `• ${prodName} (${data.category}): Predicción 7d: ${data.projected_units_7d} uds | 15d: ${data.projected_units_15d} uds | 30d: ${data.projected_units_30d} uds (Ingreso estimado: S/ ${data.projected_revenue_30d})`
    )
    .join('\n');

  const churnList = rfm.clientes_en_riesgo_abandono
    .slice(0, 8)
    .map(c => `• ${c.full_name} (${c.city}): ${c.recency} días sin comprar, ${c.frequency} pedidos previos, gasto total S/ ${c.monetary}`)
    .join('\n');

  const vipList = rfm.clientes_vip
    .slice(0, 8)
    .map(c => `• ${c.full_name} (${c.city}): ${c.frequency} compras, gasto total acumulado S/ ${c.monetary}`)
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
  const productList = products
    .filter(p => p.is_active !== false)
    .slice(0, 50)
    .map(p => {
      const price = p.onSale && p.sale_price
        ? `S/${p.sale_price} (oferta, antes S/${p.price})`
        : `S/${p.price}`;
      return `• ${p.name} — ${price} — Stock: ${p.stock || 0} uds — ${p.prescription_required ? '⚠️ Requiere receta' : 'Sin receta'}`;
    })
    .join('\n');

  const userName = user?.first_name ? `El cliente se llama ${user.first_name}.` : '';

  return `Eres FarmaBot, el asistente farmacéutico virtual de Farmacia Digital en Perú.
${userName}

## TU ROL COMPLETO:
- Eres un farmacéutico virtual amigable, empático y muy bien informado.
- Puedes responder preguntas ABIERTAS sobre cualquier enfermedad o condición de salud, síntomas, medicamentos en general, primeros auxilios, nutrición, higiene, cuidado personal y bienestar.
- Ayudas a los clientes a encontrar medicamentos del catálogo, con precios y stock.
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
 * 4. MOTOR DE RESPUESTA AUTÓNOMA LOCAL (Fallback inteligente si la API de Groq no responde)
 */
export const generateDeterministicResponse = (userText, routing, products = []) => {
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
 */
export const executeMultiAgentChat = async ({
  userMessage,
  history = [],
  products = [],
  user = null,
  onChunk = null
}) => {
  // 1. Orquestación / Routing
  const routing = routeUserQuery(userMessage);

  // La seguridad se valida antes de llamar a la API o al fallback local.
  // La interfaz captura esta excepción y la convierte en una advertencia visible.
  assertNoSelfMedication(userMessage);

  // 2. Preparar el Prompt del Sistema según el agente asignado
  const systemPrompt = routing.agentType === 'ML_ANALYST'
    ? buildMLSystemPrompt()
    : buildPharmacySystemPrompt(products, user);

  // 3. Intentar streaming mediante LLM (Groq)
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(IS_DEVELOPMENT && GROQ_API_KEY ? { Authorization: `Bearer ${GROQ_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        max_tokens: 650,
        stream: Boolean(onChunk),
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq HTTP ${response.status}`);
    }

    if (!onChunk) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('Groq devolvió una respuesta vacía');
      return { routing, agentRoles: buildAgentRoles(routing), content };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const payload = JSON.parse(dataStr);
          const chunk = payload.choices?.[0]?.delta?.content || '';
          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // ignore parsing error
        }
      }
      if (done) break;
    }

    if (!fullText.trim()) throw new Error('Groq devolvió una respuesta vacía');
    return { routing, agentRoles: buildAgentRoles(routing), content: fullText };

  } catch (err) {
    // 4. Fallback: El motor determinístico inteligente responde con datos reales
    console.warn('[MultiAgent] Usando motor analítico determinístico:', err.message);
    const content = generateDeterministicResponse(userMessage, routing, products);
    
    // Simular streaming suave para una UX fluida
    if (onChunk) {
      const words = content.split(' ');
      for (let i = 0; i < words.length; i++) {
        await new Promise(r => setTimeout(r, 18));
        onChunk((i === 0 ? '' : ' ') + words[i]);
      }
    }

    return { routing, agentRoles: buildAgentRoles(routing), content };
  }
};
