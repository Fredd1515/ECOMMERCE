// Guías breves y prudentes para el fallback local de FarmaBot.
// No diagnostican ni sustituyen una evaluación médica: ayudan a orientar
// mientras el usuario decide si necesita consultar a un profesional.

export const normalizeMedicalText = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const guide = (name, emoji, aliases, summary, actions, alerts) => ({
  name,
  emoji,
  aliases,
  summary,
  actions,
  alerts,
});

// La búsqueda por alias permite responder tanto a "diabetes" como a frases
// cotidianas como "azúcar alta" o "me diagnosticaron asma".
export const DISEASE_GUIDES = [
  guide(
    'Diabetes',
    '🩺',
    ['diabetes', 'diabetes mellitus', 'azucar alta', 'glucosa alta'],
    'Es una enfermedad crónica en la que la glucosa en sangre permanece elevada. El tratamiento depende del tipo de diabetes, tus análisis y tu plan médico.',
    [
      'Sigue el plan indicado por tu médico y no inicies, suspendas ni cambies medicamentos por tu cuenta.',
      'Controla la glucosa según las indicaciones, mantén una alimentación equilibrada y realiza actividad física si es segura para ti.',
      'Programa controles periódicos de presión, pies, ojos y función renal.',
    ],
    'Busca atención urgente si hay confusión, desmayo, respiración rápida o difícil, vómitos persistentes o signos de deshidratación.',
  ),
  guide(
    'Asma',
    '🫁',
    ['asma', 'crisis asmatica', 'crisis asmática'],
    'Es una enfermedad inflamatoria de las vías respiratorias que puede causar silbidos, tos, opresión en el pecho y falta de aire.',
    [
      'Usa el inhalador de rescate o de control únicamente como te lo indicó un profesional y revisa la técnica.',
      'Evita humo, polvo, perfumes u otros desencadenantes que ya hayas identificado.',
      'Si las crisis se repiten, solicita un plan de acción y una revisión médica.',
    ],
    'Es una emergencia si no puedes hablar con normalidad, notas labios azulados, la falta de aire empeora o el inhalador indicado no ayuda.',
  ),
  guide(
    'Hipertensión arterial',
    '❤️',
    ['hipertension', 'presion alta', 'presión alta', 'tension alta', 'tensión alta'],
    'Es la elevación persistente de la presión arterial. A menudo no produce síntomas, por eso se confirma con mediciones correctas y seguimiento.',
    [
      'Mide la presión en reposo, anota los valores y lleva el registro a tu consulta.',
      'Reduce la sal, evita fumar y limita el alcohol; mantén actividad física según tu condición.',
      'Toma solo el tratamiento recetado y no dupliques dosis por una lectura aislada.',
    ],
    'Si la presión es muy alta y aparece dolor de pecho, falta de aire, debilidad de un lado, confusión o alteración de la visión, acude a emergencias.',
  ),
  guide(
    'Colesterol alto',
    '🧪',
    ['colesterol alto', 'colesterol elevado', 'hipercolesterolemia', 'trigliceridos', 'triglicéridos'],
    'Suele no causar síntomas y se detecta con un perfil de lípidos. El riesgo cardiovascular depende de varios factores, no solo de un número.',
    [
      'Solicita interpretación médica de tu perfil lipídico y de tu riesgo cardiovascular global.',
      'Prefiere fibra, frutas, verduras y grasas saludables; reduce grasas trans y ultraprocesados.',
      'No suspendas ni empieces estatinas u otro tratamiento sin indicación profesional.',
    ],
    'Dolor de pecho, falta de aire o signos repentinos de accidente cerebrovascular requieren atención urgente.',
  ),
  guide(
    'Anemia',
    '🩸',
    ['anemia', 'hemoglobina baja', 'falta de hierro', 'deficiencia de hierro'],
    'Es la disminución de hemoglobina o glóbulos rojos. Puede causar cansancio, palidez, mareos o falta de aire, pero su causa debe confirmarse con análisis.',
    [
      'Consulta para identificar la causa; no tomes hierro sin confirmar que lo necesitas.',
      'Incluye alimentos variados y ricos en hierro dentro de una alimentación segura para ti.',
      'Comenta si hay menstruaciones muy abundantes, sangrado digestivo, embarazo o enfermedades crónicas.',
    ],
    'Desmayo, dolor de pecho, falta de aire importante, palpitaciones intensas o sangrado visible requieren evaluación pronta.',
  ),
  guide(
    'Infección urinaria',
    '🚻',
    ['infeccion urinaria', 'infección urinaria', 'itu', 'cistitis', 'infeccion de orina', 'infección de orina'],
    'Puede producir ardor al orinar, urgencia, aumento de frecuencia o dolor bajo. La presencia de fiebre o dolor en la espalda puede indicar una infección más alta.',
    [
      'Solicita una evaluación, especialmente si es la primera vez, estás embarazada, eres hombre o es un niño.',
      'Bebe líquidos si no tienes una restricción médica y no retengas la orina.',
      'Los antibióticos solo deben usarse con indicación profesional y completando la pauta prescrita.',
    ],
    'Fiebre, escalofríos, vómitos, dolor en la espalda o costado, embarazo o decaimiento intenso requieren atención el mismo día.',
  ),
  guide(
    'Neumonía',
    '🫁',
    ['neumonia', 'neumonía', 'infeccion pulmonar', 'infección pulmonar'],
    'Es una infección de los pulmones que puede causar tos, fiebre, dolor al respirar, cansancio y dificultad para respirar. Puede necesitar pruebas y tratamiento específico.',
    [
      'Consulta pronto para que evalúen la respiración y determinen si se requieren pruebas o medicamentos.',
      'Descansa, hidrátate si puedes y evita fumar o exponerte a humo.',
      'No uses antibióticos sobrantes ni compartas medicamentos.',
    ],
    'Dificultad para respirar, labios azulados, confusión, dolor intenso en el pecho o somnolencia marcada son señales de emergencia.',
  ),
  guide(
    'COVID-19',
    '🦠',
    ['covid', 'covid 19', 'coronavirus', 'sars cov 2'],
    'Es una infección respiratoria que puede causar fiebre, tos, dolor de garganta, cansancio o cambios en el olfato y gusto. La intensidad y las recomendaciones dependen del riesgo individual.',
    [
      'Considera una prueba si tienes síntomas o una exposición reciente y sigue las indicaciones sanitarias vigentes.',
      'Si eres mayor, estás embarazada o tienes una enfermedad crónica, consulta pronto aunque los síntomas parezcan leves.',
      'Descansa, hidrátate y evita automedicarte con antibióticos.',
    ],
    'Busca ayuda urgente por dificultad para respirar, dolor persistente en el pecho, confusión, desmayo o labios azulados.',
  ),
  guide(
    'Bronquitis',
    '😮‍💨',
    ['bronquitis', 'bronquitis aguda'],
    'La bronquitis aguda suele causar tos y con frecuencia es viral. La tos puede durar varios días o semanas, por lo que no siempre requiere antibióticos.',
    [
      'Descansa, toma líquidos y evita humo, vapeo y ambientes irritantes.',
      'Consulta si la tos dura más de tres semanas, se repite o tienes una enfermedad pulmonar previa.',
      'No uses antibióticos sin una evaluación médica.',
    ],
    'Falta de aire importante, dolor de pecho, sangre al toser, fiebre persistente o labios azulados requieren evaluación urgente.',
  ),
  guide(
    'Sinusitis',
    '👃',
    ['sinusitis', 'infeccion de senos paranasales', 'infección de senos paranasales'],
    'Es la inflamación de los senos paranasales y puede causar congestión, presión facial, secreción nasal y disminución del olfato.',
    [
      'Los lavados nasales con solución salina pueden aliviar la congestión si se realizan con agua segura.',
      'Descansa y consulta si los síntomas duran más de diez días, empeoran después de mejorar o son muy intensos.',
      'Evita usar descongestionantes por más tiempo del indicado en su envase o por un profesional.',
    ],
    'Hinchazón alrededor de los ojos, cambios en la visión, dolor de cabeza muy intenso, rigidez de cuello o confusión requieren atención urgente.',
  ),
  guide(
    'Conjuntivitis',
    '👁️',
    ['conjuntivitis', 'ojo rojo', 'infeccion ocular', 'infección ocular'],
    'Puede ser causada por virus, bacterias, alergias u otros problemas. El ojo rojo por sí solo no permite saber cuál es la causa.',
    [
      'Lávate las manos, no compartas toallas y evita tocarte los ojos.',
      'Si usas lentes de contacto, retíralos y consulta antes de volver a usarlos.',
      'No uses gotas con antibiótico o corticoide sin una evaluación profesional.',
    ],
    'Dolor fuerte, pérdida de visión, mucha sensibilidad a la luz, lesión química, uso de lentes de contacto o un bebé con ojo rojo requieren atención rápida.',
  ),
  guide(
    'Dermatitis o eczema',
    '🧴',
    ['dermatitis', 'eczema', 'eccema', 'piel atopica', 'piel atópica'],
    'Es una inflamación de la piel que puede causar resequedad, picazón, enrojecimiento o descamación. Puede tener distintos desencadenantes.',
    [
      'Aplica una crema hidratante sin perfume varias veces al día y usa limpiadores suaves.',
      'Evita rascarte y anota productos, telas o sustancias que parezcan empeorar el brote.',
      'Consulta si es extenso, recurrente o no mejora, para elegir un tratamiento adecuado.',
    ],
    'Fiebre, dolor creciente, pus, calor intenso, ampollas extensas o afectación de ojos y cara necesitan evaluación pronta.',
  ),
  guide(
    'Psoriasis',
    '🧴',
    ['psoriasis', 'psoriasica', 'psoriásica'],
    'Es una enfermedad inflamatoria crónica que puede producir placas con descamación y también afectar uñas o articulaciones.',
    [
      'Mantén la piel hidratada y evita rascar o retirar las escamas a la fuerza.',
      'Consulta dermatología para confirmar el diagnóstico y seleccionar tratamiento; no uses corticoides fuertes por tu cuenta.',
      'Comenta dolor, hinchazón o rigidez articular, porque puede requerir atención adicional.',
    ],
    'Enrojecimiento generalizado, fiebre, pus, dolor intenso o deterioro rápido requieren atención médica.',
  ),
  guide(
    'Acné',
    '🙂',
    ['acne', 'acné', 'granos', 'espinillas'],
    'Es una alteración de los folículos de la piel que puede causar puntos negros, granos o nódulos. No se debe a falta de higiene.',
    [
      'Lava la cara suavemente, evita exprimir las lesiones y elige productos no comedogénicos.',
      'Consulta si hay nódulos dolorosos, cicatrices o impacto emocional; el tratamiento depende de la gravedad.',
      'Si estás embarazada o buscando embarazo, consulta antes de usar tratamientos para el acné.',
    ],
    'Dolor intenso, lesiones profundas con cicatriz o una reacción importante a un producto requieren valoración profesional.',
  ),
  guide(
    'Artritis o artrosis',
    '🦴',
    ['artritis', 'artrosis', 'osteoartritis', 'dolor articular', 'reuma', 'reumatismo'],
    'Agrupa problemas que producen dolor, rigidez o inflamación de las articulaciones. La causa puede ser degenerativa, inflamatoria o traumática.',
    [
      'Solicita evaluación si el dolor persiste, limita tus actividades o afecta varias articulaciones.',
      'El movimiento suave, la fisioterapia y el control del peso pueden ayudar según el caso.',
      'No uses antiinflamatorios si tienes contraindicaciones ni los combines sin consultar.',
    ],
    'Una articulación muy roja, caliente y dolorosa con fiebre, o una lesión con deformidad, requiere atención urgente.',
  ),
  guide(
    'Osteoporosis',
    '🦴',
    ['osteoporosis', 'huesos debiles', 'huesos débiles', 'densidad osea', 'densidad ósea'],
    'Es la disminución de la resistencia de los huesos y puede aumentar el riesgo de fracturas, a veces sin síntomas hasta que ocurre una lesión.',
    [
      'Consulta si necesitas una evaluación de densidad ósea y un plan para prevenir caídas.',
      'Procura calcio y vitamina D principalmente desde una alimentación adecuada, según tus necesidades.',
      'El tratamiento farmacológico requiere valoración médica y seguimiento.',
    ],
    'Dolor súbito tras una caída, incapacidad para apoyar una extremidad o deformidad visible requiere evaluación inmediata.',
  ),
  guide(
    'Migraña',
    '🤕',
    ['migraña', 'migrana', 'jaqueca'],
    'Es un tipo de dolor de cabeza que puede ser pulsátil y acompañarse de náuseas o sensibilidad a la luz y al ruido. No todo dolor de cabeza es migraña.',
    [
      'Registra duración, desencadenantes y síntomas asociados para comentarlos en consulta.',
      'Descansa en un ambiente tranquilo, hidrátate y usa solo el tratamiento recomendado para ti.',
      'Consulta si los episodios son frecuentes, nuevos o están cambiando.',
    ],
    'Un dolor súbito y máximo desde el inicio, debilidad, dificultad para hablar, fiebre con rigidez de cuello, desmayo o alteración visual requieren emergencia.',
  ),
  guide(
    'Reflujo gastroesofágico',
    '🍽️',
    ['reflujo', 'reflujo gastroesofagico', 'reflujo gastroesofágico', 'gerd', 'acidez frecuente'],
    'Ocurre cuando el contenido del estómago sube hacia el esófago y puede causar ardor, regurgitación o tos, especialmente después de comer.',
    [
      'Come porciones pequeñas, identifica alimentos que empeoran los síntomas y evita acostarte justo después de comer.',
      'Consulta si necesitas tratamiento o si los síntomas aparecen con frecuencia.',
      'No prolongues el uso de antiácidos o supresores de ácido sin orientación.',
    ],
    'Dificultad o dolor al tragar, vómito con sangre, heces negras, pérdida de peso o dolor de pecho requieren valoración rápida.',
  ),
  guide(
    'Gastritis o úlcera',
    '🫃',
    ['gastritis', 'ulcera', 'úlcera', 'ulcera gastrica', 'úlcera gástrica'],
    'La gastritis es inflamación del estómago y una úlcera es una lesión en su revestimiento o en el duodeno. Pueden tener causas distintas y requieren evaluación si persisten.',
    [
      'Evita alcohol, tabaco y antiinflamatorios sin consultar; algunos pueden empeorar la lesión.',
      'Solicita evaluación si el dolor se repite, hay acidez frecuente o necesitas antiácidos a menudo.',
      'No uses antibióticos ni tratamientos para Helicobacter pylori sin confirmación y receta.',
    ],
    'Vómito con sangre, heces negras, dolor intenso o desmayo son señales de emergencia.',
  ),
  guide(
    'Estreñimiento',
    '🚽',
    ['estreñimiento', 'constipacion', 'constipación', 'evacuacion dificil', 'evacuación difícil'],
    'Es la dificultad o menor frecuencia para evacuar. Puede relacionarse con alimentación, líquidos, medicamentos, poca actividad u otras causas.',
    [
      'Aumenta gradualmente fibra y líquidos si no tienes una restricción médica, y realiza movimiento suave.',
      'No retengas las ganas de evacuar y consulta si es nuevo, persistente o recurrente.',
      'Revisa con un profesional si algún medicamento podría estar causándolo.',
    ],
    'Dolor abdominal intenso, vómitos, abdomen muy distendido, sangre o imposibilidad para expulsar gases requieren atención urgente.',
  ),
  guide(
    'Trastornos de la tiroides',
    '🦋',
    ['tiroides', 'hipotiroidismo', 'hipertiroidismo', 'tiroides lenta', 'tiroides acelerada'],
    'La tiroides puede producir demasiadas o muy pocas hormonas. Los síntomas varían y se confirman con análisis, no solo por lo que se siente.',
    [
      'Solicita evaluación y análisis si tienes cambios persistentes de peso, pulso, sueño, ánimo o tolerancia al frío o calor.',
      'Toma el tratamiento exactamente como se indicó y no lo ajustes por tu cuenta.',
      'Comenta embarazo, suplementos de yodo o biotina y otros medicamentos en tu consulta.',
    ],
    'Palpitaciones intensas con dolor de pecho, falta de aire, desmayo, confusión o somnolencia extrema requieren atención urgente.',
  ),
  guide(
    'Gota',
    '🦶',
    ['gota', 'acido urico', 'ácido úrico'],
    'Es una inflamación articular asociada a cristales de ácido úrico. Suele causar dolor intenso, enrojecimiento y calor, a menudo en el dedo gordo del pie.',
    [
      'Consulta para confirmar la causa y recibir un plan; no todos los dolores articulares son gota.',
      'Hidrátate si no tienes restricción médica y revisa alcohol, bebidas azucaradas y otros desencadenantes.',
      'No suspendas ni comiences medicamentos para el ácido úrico sin indicación.',
    ],
    'Fiebre junto con una articulación roja, caliente y muy dolorosa requiere atención el mismo día para descartar infección.',
  ),
  guide(
    'Insomnio',
    '🌙',
    ['insomnio', 'no puedo dormir', 'problemas para dormir', 'trastorno del sueño'],
    'Es la dificultad persistente para conciliar o mantener el sueño, o un descanso poco reparador. Puede relacionarse con estrés, hábitos, medicamentos o enfermedades.',
    [
      'Mantén horarios regulares, reduce pantallas y cafeína por la noche y reserva la cama para dormir.',
      'Consulta si dura varias semanas, afecta tu día o se acompaña de ronquidos fuertes y pausas respiratorias.',
      'Evita automedicarte con sedantes o antihistamínicos para dormir.',
    ],
    'Somnolencia extrema con riesgo de accidentes, confusión o síntomas intensos de ansiedad o depresión requieren ayuda profesional pronta.',
  ),
];

export const findDiseaseGuide = (text = '') => {
  const normalizedText = normalizeMedicalText(text);
  return DISEASE_GUIDES.find((item) => item.aliases.some((alias) => {
    const normalizedAlias = normalizeMedicalText(alias);
    return normalizedText.includes(normalizedAlias);
  }));
};

const getDiseaseIntent = (question = '') => {
  const text = normalizeMedicalText(question);
  if (/\b(?:que es|que significa|definicion|explicame|explicame que)\b/.test(text)) return 'definition';
  if (/\b(?:sintoma|sintomas|como se manifiesta|como saber|como identificar)\b/.test(text)) return 'symptoms';
  if (/\b(?:medicamento|medicamentos|pastilla|pastillas|tratamiento|trata|cura|que puedo tomar|que me recomiendas|que hago)\b/.test(text)) return 'treatment';
  if (/\b(?:grave|peligro|urgencia|urgente|cuando debo ir|cuando consultar|senales de alarma|alerta|emergencia)\b/.test(text)) return 'alerts';
  return 'overview';
};

export const buildDiseaseResponse = (item, question = '') => {
  const intent = getDiseaseIntent(question);
  const title = `## ${item.emoji} ${item.name}`;
  const safety = '> Esta orientación es general y no confirma un diagnóstico. No inicies, combines, aumentes ni suspendas medicamentos sin una evaluación profesional.';

  if (intent === 'definition') {
    return [title, item.summary, '### Para tener en cuenta', '- El diagnóstico depende de la historia clínica y, cuando corresponde, de análisis o pruebas.', '- El tratamiento cambia según la edad, el embarazo, otras enfermedades y los medicamentos que uses.', safety].join('\n\n');
  }

  if (intent === 'symptoms') {
    return [title, item.summary, '### Qué observar', '- Los síntomas pueden variar entre personas y también pueden parecerse a los de otras enfermedades.', '- Anota cuándo comenzaron, qué los empeora y si aparecen fiebre, dolor, falta de aire o cambios importantes.', '### Consulta', 'Si son nuevos, intensos, persistentes o están empeorando, solicita una evaluación médica.', safety].join('\n\n');
  }

  if (intent === 'treatment') {
    return [title, '### Orientación general', item.actions.map((action) => `- ${action}`).join('\n'), '### Sobre medicamentos', 'Los medicamentos dependen de la causa y de tus antecedentes. Puedo revisar un nombre concreto y decirte para qué se usa o si aparece en el catálogo, pero no indicaré automedicación ni una dosis personalizada.', '### Cuándo consultar', `⚠️ ${item.alerts}`, safety].join('\n\n');
  }

  if (intent === 'alerts') {
    return [title, '### Señales de alarma', `⚠️ ${item.alerts}`, 'Si no tienes señales de alarma pero los síntomas persisten o se repiten, agenda una consulta para confirmar la causa.', safety].join('\n\n');
  }

  return [title, item.summary, '### Qué puedes hacer', item.actions.map((action) => `- ${action}`).join('\n'), '### Cuándo buscar ayuda', `⚠️ ${item.alerts}`, safety].join('\n\n');
};

export const buildUnknownMedicationResponse = (question = '') => {
  const topic = extractMedicalTopic(question) || 'ese medicamento';
  return [
  `## 💊 Consulta sobre ${topic}`,
  `Puedo analizar **${topic}**, sus precauciones y si está en el catálogo, pero necesito el nombre exacto y la presentación para no confundirlo con otro producto.`,
  '### Seguridad',
  '- No tomes un medicamento por tu cuenta ni combines productos con el mismo principio activo.',
  '- Indica tu edad, alergias, embarazo, enfermedades previas y medicamentos actuales.',
  '- Si ya lo tomaste y tienes dificultad para respirar, hinchazón, desmayo, confusión o vómitos persistentes, acude a emergencias.',
  ].join('\n\n');
};

const MEDICATION_GUIDES = [
  { name: 'Paracetamol', aliases: ['paracetamol', 'acetaminofen'], purpose: 'Es un analgésico y antipirético usado para dolor leve o moderado y fiebre.', safety: 'La seguridad depende de la dosis total y de la función del hígado; revisa que otros antigripales no lo contengan también.' },
  { name: 'Ibuprofeno', aliases: ['ibuprofeno'], purpose: 'Es un antiinflamatorio no esteroideo que puede aliviar dolor, inflamación y fiebre.', safety: 'Puede ser riesgoso con úlceras, enfermedad renal, algunos anticoagulantes, embarazo o ciertas enfermedades cardiovasculares.' },
  { name: 'Amoxicilina', aliases: ['amoxicilina'], purpose: 'Es un antibiótico de la familia de las penicilinas y solo sirve para algunas infecciones bacterianas.', safety: 'No trata virus y debe usarse únicamente con receta; informa antecedentes de alergia a penicilinas.' },
  { name: 'Omeprazol', aliases: ['omeprazol'], purpose: 'Reduce la producción de ácido del estómago y se usa en algunas enfermedades digestivas.', safety: 'El uso prolongado o repetido debe revisarse con un profesional, especialmente si hay pérdida de peso, sangrado o dificultad al tragar.' },
  { name: 'Loratadina', aliases: ['loratadina'], purpose: 'Es un antihistamínico usado para síntomas de alergia como estornudos, picazón y moqueo.', safety: 'Consulta si tienes otras enfermedades, tomas sedantes o los síntomas son intensos o persistentes.' },
  { name: 'Cetirizina', aliases: ['cetirizina'], purpose: 'Es un antihistamínico usado para rinitis alérgica y urticaria.', safety: 'Puede causar somnolencia en algunas personas; evita conducir hasta saber cómo te afecta.' },
  { name: 'Metformina', aliases: ['metformina'], purpose: 'Es un medicamento usado con frecuencia en ciertos planes para diabetes tipo 2.', safety: 'Requiere valoración de la función renal y no debe iniciarse, suspenderse o ajustarse sin seguimiento médico.' },
  { name: 'Enalapril', aliases: ['enalapril'], purpose: 'Es un medicamento de prescripción utilizado en algunos planes para hipertensión o insuficiencia cardíaca.', safety: 'Puede no ser adecuado en embarazo o con ciertas enfermedades renales; requiere control profesional.' },
  { name: 'Amlodipino', aliases: ['amlodipino'], purpose: 'Es un medicamento de prescripción utilizado para controlar la presión arterial y algunos tipos de angina.', safety: 'Puede causar mareos o hinchazón y no debe ajustarse sin controlar la presión y consultar.' },
  { name: 'Salbutamol', aliases: ['salbutamol', 'albuterol'], purpose: 'Es un broncodilatador de acción rápida que se usa en algunos planes para aliviar broncoespasmo.', safety: 'Si la falta de aire es intensa o el inhalador no ayuda, busca atención urgente en lugar de repetirlo por tu cuenta.' },
];

export const findMedicationGuide = (text = '') => {
  const normalizedText = normalizeMedicalText(text);
  return MEDICATION_GUIDES.find((item) => item.aliases.some((alias) => normalizedText.includes(normalizeMedicalText(alias))));
};

export const buildMedicationResponse = (item) => [
  `## 💊 ${item.name}`,
  item.purpose,
  '### Precauciones importantes',
  `- ${item.safety}`,
  '- La indicación y la dosis dependen de la persona, el diagnóstico, otros medicamentos y sus antecedentes.',
  '- Si quieres usarlo por tu cuenta, no lo hagas: consulta primero a un médico o químico farmacéutico.',
].join('\n\n');

const MEDICAL_STOP_WORDS = new Set([
  'que', 'es', 'son', 'una', 'un', 'el', 'la', 'los', 'las', 'de', 'del', 'para', 'por', 'con', 'sobre',
  'tengo', 'sufro', 'padezco', 'diagnosticaron', 'diagnostico', 'diagnóstico', 'me', 'mi', 'mis', 'yo',
  'puedo', 'puede', 'hacer', 'hago', 'tiene', 'tienen', 'como', 'cómo', 'cual', 'cuales', 'cuáles',
  'cuando', 'cuándo', 'donde', 'dónde', 'necesito', 'quiero', 'saber', 'informacion', 'información',
  'tratamiento', 'sintomas', 'síntomas', 'medicamento', 'medicamentos', 'medicina', 'medicinas',
  'enfermedad', 'enfermedades', 'conozco', 'desconozco', 'usar', 'uso', 'consulta', 'consultar',
  'desde', 'hace', 'ayer', 'hoy', 'anoche', 'dias', 'días', 'dia', 'día', 'tiene', 'tienen', 'duele',
]);

const extractMedicalTopic = (question = '') => normalizeMedicalText(question)
  .split(' ')
  .filter((word) => word.length > 2 && !MEDICAL_STOP_WORDS.has(word))
  .slice(0, 5)
  .join(' ');

const getGeneralMedicalIntent = (question = '') => {
  const text = normalizeMedicalText(question);
  if (/\b(?:que es|que significa|definicion|explicame)\b/.test(text)) return 'definition';
  if (/\b(?:sintoma|sintomas|como se manifiesta|como identificar)\b/.test(text)) return 'symptoms';
  if (/\b(?:tratamiento|cura|que hago|que puedo hacer|como se trata|prevencion|prevenir)\b/.test(text)) return 'care';
  if (/\b(?:medicamento|medicamentos|medicina|pastilla|dosis|receta|efectos secundarios|interacciones)\b/.test(text)) return 'medication';
  if (/\b(?:grave|peligro|urgencia|urgente|cuando consultar|senales de alarma|emergencia)\b/.test(text)) return 'alerts';
  return 'general';
};

export const buildUnknownConditionResponse = (question = '') => {
  const topic = extractMedicalTopic(question) || 'tu consulta médica';
  const intent = getGeneralMedicalIntent(question);
  const title = `## 🩺 Consulta sobre ${topic}`;
  const safety = '> No puedo confirmar diagnósticos ni indicar un tratamiento personalizado sin una evaluación profesional.';

  const responses = {
    definition: `Puedo orientarte sobre **${topic}**, pero el nombre o la descripción por sí solos no confirman un diagnóstico. Para explicarlo con precisión necesito saber si ya existe un diagnóstico y qué síntomas tienes.`,
    symptoms: `Los síntomas de **${topic}** pueden variar y pueden coincidir con otras enfermedades. Anota cuándo comenzaron, su intensidad y qué los empeora o alivia.`,
    care: `El cuidado de **${topic}** depende de la causa, la edad, el embarazo, los antecedentes y los medicamentos actuales. No inicies ni suspendas un tratamiento solo con información de internet.`,
    medication: `Sobre medicamentos relacionados con **${topic}**, no es seguro recomendar uno sin conocer el diagnóstico y tus antecedentes. Puedo revisar un nombre exacto y explicarte su uso general, precauciones e interacciones.`,
    alerts: `Si la consulta sobre **${topic}** incluye dificultad para respirar, dolor de pecho, desmayo, confusión, convulsiones, sangrado abundante o empeoramiento rápido, acude a emergencias.`,
    general: `Puedo analizar tu consulta sobre **${topic}**. Para darte una orientación útil, necesito saber qué quieres conocer: definición, síntomas, tratamiento, prevención, medicamento o señales de alarma.`,
  };

  return [
    title,
    responses[intent],
    '### Datos que ayudan',
    '- Edad y tiempo de evolución.',
    '- Síntomas principales, intensidad y cambios recientes.',
    '- Embarazo, alergias, enfermedades previas y medicamentos actuales.',
    '### Seguridad',
    'Si ya tomaste algo y presentas dificultad para respirar, hinchazón, desmayo, confusión o vómitos persistentes, busca atención urgente.',
    safety,
  ].join('\n\n');
};
