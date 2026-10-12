# Farmacia Salud Total

Aplicación web de comercio electrónico para una farmacia. Permite consultar productos, filtrar el catálogo, administrar un carrito, registrar clientes, crear pedidos, calcular rutas de entrega y utilizar FarmaBot como asistente virtual.

El proyecto está construido con React, Vite, Tailwind CSS, Supabase, Google Maps/OpenStreetMap y Groq. Puede ejecutarse localmente para desarrollo y desplegarse en Vercel para que los usuarios accedan desde cualquier dispositivo mediante una URL pública.

## Contenido

1. [Requisitos](#requisitos)
2. [Instalación desde un archivo RAR](#instalación-desde-un-archivo-rar)
3. [Instalación de dependencias](#instalación-de-dependencias)
4. [Configuración de variables de entorno](#configuración-de-variables-de-entorno)
5. [Configuración de Supabase](#configuración-de-supabase)
6. [Ejecución local](#ejecución-local)
7. [Configuración de Groq y FarmaBot](#configuración-de-groq-y-farmabot)
8. [Configuración opcional de Google Maps](#configuración-opcional-de-google-maps)
9. [Despliegue en Vercel](#despliegue-en-vercel)
10. [Pruebas posteriores a la instalación](#pruebas-posteriores-a-la-instalación)
11. [Solución de problemas](#solución-de-problemas)
12. [Seguridad](#seguridad)
13. [Contenido recomendado del archivo RAR](#contenido-recomendado-del-archivo-rar)
14. [Estructura principal](#estructura-principal)

## Requisitos

Para instalar el proyecto en Windows se recomienda:

- Windows 10 u 11.
- Node.js 20.19.1 o una versión compatible de Node.js 20. El proyecto incluye esta versión en <code>.nvmrc</code>.
- pnpm 9 o una versión compatible.
- Una cuenta de Supabase.
- Una cuenta de Vercel para publicar la aplicación.
- Una cuenta de Groq si se desea utilizar FarmaBot.
- Una cuenta de Google Cloud únicamente si se desea utilizar Google Maps.
- WinRAR o 7-Zip para extraer el archivo comprimido.

Verifica Node.js y npm desde PowerShell:

~~~powershell
node --version
npm --version
~~~

La primera versión debe ser 20.19.1 o compatible con Node.js 20.

## Instalación desde un archivo RAR

1. Extrae el archivo RAR en una carpeta de trabajo, por ejemplo:

   <code>C:\Proyectos\ECOMMERCE</code>

2. Evita rutas con caracteres especiales o permisos restringidos.

3. Abre PowerShell dentro de la carpeta del proyecto:

~~~powershell
cd C:\Proyectos\ECOMMERCE
~~~

4. Comprueba que existan como mínimo estos elementos:

   - <code>package.json</code>
   - <code>pnpm-lock.yaml</code>
   - <code>src</code>
   - <code>public</code>
   - <code>api</code>
   - <code>supabase</code>
   - <code>.env.example</code>
   - <code>vite.config.js</code>
   - <code>index.html</code>

No es necesario incluir <code>node_modules</code> en el RAR. Esa carpeta se vuelve a generar con la instalación de dependencias.

No incluyas nunca <code>.env.local</code> en el archivo RAR, especialmente si contiene claves de servicios externos.

## Instalación de dependencias

Este proyecto tiene como administrador recomendado a pnpm porque incluye <code>pnpm-lock.yaml</code> y <code>pnpm-workspace.yaml</code>.

Si pnpm no está instalado, ejecuta PowerShell como usuario normal y escribe:

~~~powershell
npm install --global pnpm@9
~~~

Comprueba la instalación:

~~~powershell
pnpm --version
~~~

Instala las dependencias desde la raíz del proyecto:

~~~powershell
pnpm install --frozen-lockfile
~~~

Si <code>--frozen-lockfile</code> muestra un error porque las versiones de <code>package.json</code> no coinciden con el lockfile, ejecuta una vez:

~~~powershell
pnpm install
~~~

Después de esa instalación, usa nuevamente:

~~~powershell
pnpm install --frozen-lockfile
~~~

No mezcles <code>npm install</code> y <code>pnpm install</code> continuamente. El repositorio contiene también <code>package-lock.json</code>, pero el flujo recomendado para este proyecto es pnpm.

## Configuración de variables de entorno

### Crear el archivo local

En la raíz del proyecto existe <code>.env.example</code>. Crea una copia con el nombre exacto <code>.env.local</code>:

~~~powershell
Copy-Item .env.example .env.local
~~~

Abre el archivo con un editor de texto:

~~~powershell
notepad .env.local
~~~

Completa los valores de acuerdo con la siguiente tabla.

| Variable | Obligatoria | Uso |
|---|---:|---|
| <code>VITE_SUPABASE_URL</code> | Sí | URL del proyecto Supabase. |
| <code>VITE_SUPABASE_ANON_KEY</code> | Sí | Clave pública anon/publishable de Supabase. |
| <code>VITE_GROQ_API_KEY</code> | Solo desarrollo local | Permite que el chat local llame directamente a Groq. |
| <code>GROQ_API_KEY</code> | Producción | Clave privada utilizada por la función <code>/api/groq</code> en Vercel. |
| <code>VITE_GOOGLE_MAPS_API_KEY</code> | Opcional | Carga Google Maps y rutas. |
| <code>VITE_PHARMACY_ORIGIN</code> | Opcional | Dirección de origen de la farmacia. |
| <code>VITE_PHARMACY_ORIGIN_LAT</code> | Opcional | Latitud de la farmacia. |
| <code>VITE_PHARMACY_ORIGIN_LNG</code> | Opcional | Longitud de la farmacia. |
| <code>VITE_GEMINI_API_KEY</code> | Opcional | Integración anterior de Gemini, si alguna funcionalidad la utiliza. |

### Supabase

En Supabase, abre:

<code>Project Settings → API</code>

Usa:

- <code>Project URL</code> como valor de <code>VITE_SUPABASE_URL</code>.
- La clave pública <code>anon</code> o <code>publishable</code> como valor de <code>VITE_SUPABASE_ANON_KEY</code>.

No uses la clave <code>service_role</code> en el navegador, en <code>.env.local</code> con prefijo <code>VITE_</code> ni en Vercel como variable pública.

### Groq en desarrollo local

Para ejecutar <code>pnpm dev</code>, el cliente local utiliza:

<code>VITE_GROQ_API_KEY</code>

Esta clave se utiliza únicamente para facilitar el desarrollo local. No la publiques, no la subas al repositorio y no la configures en Vercel con el prefijo <code>VITE_</code>.

### Ejemplo de archivo local

El archivo debe conservar los nombres exactos. Sustituye únicamente los valores de ejemplo:

~~~env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publica-de-supabase
VITE_GROQ_API_KEY=tu-clave-de-groq-solo-para-desarrollo
VITE_GOOGLE_MAPS_API_KEY=tu-clave-de-google-maps
VITE_PHARMACY_ORIGIN=Dirección de la farmacia
VITE_PHARMACY_ORIGIN_LAT=-10.500000
VITE_PHARMACY_ORIGIN_LNG=-76.566700
~~~

Después de modificar <code>.env.local</code>, detén y vuelve a iniciar Vite. Las variables se leen al iniciar el servidor.

## Configuración de Supabase

La aplicación utiliza Supabase para:

- Autenticación de clientes.
- Perfiles de usuarios.
- Productos.
- Pedidos.
- Elementos de cada pedido.
- Consultas administrativas y datos analíticos.

### 1. Crear o seleccionar el proyecto

1. Entra a [Supabase](https://supabase.com/).
2. Crea un proyecto nuevo o selecciona el proyecto que ya utilizas.
3. Espera a que la base de datos termine de inicializarse.
4. Copia la URL y la clave pública en <code>.env.local</code>.

### 2. Crear las tablas de la aplicación

El archivo <code>bd.txt.txt</code> contiene el esquema y consultas históricas del proyecto. No ejecutes todo el archivo de manera automática: contiene secciones repetidas, políticas de diferentes versiones y una instrucción que puede eliminar tablas.

Si tu base de datos ya está funcionando, no vuelvas a ejecutar <code>bd.txt.txt</code>. Conserva el archivo como referencia y ejecuta únicamente migraciones necesarias.

Si estás creando una base de datos desde cero, primero realiza una copia de seguridad y revisa con cuidado los bloques de creación de las tablas que necesita la aplicación, como:

- <code>profiles</code>
- <code>products</code>
- <code>orders</code>
- <code>order_items</code>
- Tablas de dimensiones <code>dim_*</code>
- Tablas de hechos <code>fact_*</code>

Antes de poner el sitio en producción, verifica que las tablas existan desde <code>Table Editor</code> de Supabase o mediante una consulta de solo lectura:

~~~sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
~~~

### 3. Crear el perfil automáticamente al registrarse

El archivo recomendado para el registro es:

<code>supabase/migrations/20260906000000_create_profile_on_signup.sql</code>

Para ejecutarlo:

1. Abre <code>Supabase → SQL Editor</code>.
2. Crea una consulta nueva.
3. Copia el contenido completo de ese archivo.
4. Pulsa <code>Run</code>.
5. Comprueba que aparezca un resultado similar a <code>Success. No rows returned</code>.

Ese resultado es normal: el script crea tablas, políticas, una función y un trigger; no es una consulta que devuelva filas.

El script crea el trigger <code>on_auth_user_created</code>. Cuando Supabase crea un usuario en <code>auth.users</code>, el trigger crea automáticamente su registro en <code>public.profiles</code> con:

- El mismo identificador del usuario.
- Correo electrónico.
- Nombre y apellido enviados desde el formulario.
- Rol inicial <code>customer</code>.

Puedes comprobar que el trigger existe con:

~~~sql
select trigger_name, event_manipulation, event_object_table
from information_schema.triggers
where trigger_name = 'on_auth_user_created';
~~~

### 4. Desactivar la verificación de correo

El proyecto está preparado para registrar al usuario sin esperar un correo de confirmación.

En Supabase abre:

<code>Authentication → Sign In / Providers → Email</code>

Desactiva:

<code>Confirm email</code>

Guarda los cambios.

Con esta opción desactivada, <code>supabase.auth.signUp</code> devuelve una sesión inmediatamente y el usuario entra a la aplicación. Si la opción permanece activada, el código mostrará un mensaje indicando que el registro está esperando confirmación.

Esta configuración permite que cualquiera cree una cuenta con un correo no verificado. Antes de una publicación comercial conviene agregar CAPTCHA, límites de registro y otras medidas contra cuentas automatizadas.

### 5. Configurar las URL de autenticación

En:

<code>Authentication → URL Configuration</code>

Configura:

- <code>Site URL</code>: la URL pública de Vercel.
- <code>Redirect URLs</code>: agrega la URL pública y, si necesitas probar localmente, <code>http://localhost:3000</code>.

Aunque el registro sin verificación no depende del correo, estas URL son importantes para recuperación de contraseña y futuras funciones de autenticación.

### 6. Comprobar que se creó el perfil

Después de registrar un usuario desde la aplicación, ejecuta en Supabase:

~~~sql
select id, email, first_name, last_name, role, created_at
from public.profiles
order by created_at desc
limit 10;
~~~

Nunca muestres contraseñas ni intentes leerlas desde la base de datos. Supabase Auth administra las contraseñas en <code>auth.users</code>.

## Ejecución local

Desde la raíz del proyecto:

~~~powershell
pnpm dev
~~~

Abre en el navegador:

<code>http://localhost:3000</code>

El servidor está configurado para escuchar en IPv6. Si el navegador no abre la dirección automáticamente, prueba también:

<code>http://127.0.0.1:3000</code>

Para detener el servidor, presiona <code>Ctrl + C</code>.

### Compilar para producción localmente

~~~powershell
pnpm build
~~~

La compilación genera la carpeta <code>dist</code>.

Para previsualizar la compilación:

~~~powershell
pnpm preview
~~~

El modo local sirve para desarrollar. Para que los usuarios entren desde cualquier dispositivo necesitas desplegar la aplicación en Vercel u otro proveedor de hosting.

## Configuración de Groq y FarmaBot

### Desarrollo local

En <code>.env.local</code> configura:

~~~env
VITE_GROQ_API_KEY=tu-clave-de-groq
~~~

Reinicia Vite y abre el chat. En desarrollo, <code>src/lib/groqClient.js</code> llama directamente a la API de Groq.

### Producción en Vercel

En producción, la clave no debe enviarse al navegador. El flujo es:

1. El navegador llama a <code>/api/groq</code>.
2. Vercel ejecuta <code>api/groq.js</code>.
3. La función lee <code>GROQ_API_KEY</code> en el servidor.
4. La función se comunica con Groq.
5. La respuesta vuelve al navegador sin exponer la clave.

Configura en Vercel:

| Nombre | Tipo | Entorno |
|---|---|---|
| <code>GROQ_API_KEY</code> | Secret | Production |

No configures <code>VITE_GROQ_API_KEY</code> en Vercel. Las variables con prefijo <code>VITE_</code> pueden terminar incluidas en el JavaScript del navegador.

Después de guardar la variable:

1. Verifica que el archivo <code>api/groq.js</code> esté en la raíz del repositorio.
2. Haz un nuevo despliegue en Vercel.
3. Abre la URL pública.
4. Envía un mensaje desde FarmaBot.
5. En DevTools → Network comprueba que la solicitud vaya a <code>/api/groq</code> y que responda correctamente.

No abras ni publiques la clave en capturas de pantalla. Si una clave se muestra públicamente, revócala en Groq y crea otra.

### Protección del endpoint

El endpoint de Groq funciona para el chat público, pero cualquier persona podría intentar enviar solicitudes directamente a <code>/api/groq</code>. Para una versión comercial se recomienda agregar:

- Límite de solicitudes por IP o usuario.
- CAPTCHA o protección anti-bot.
- Validación de tamaño de mensajes.
- Autenticación si el chat debe ser exclusivo para clientes registrados.
- Monitoreo del consumo de Groq.

## Configuración opcional de Google Maps

La clave se utiliza en el navegador para cargar Google Maps:

~~~env
VITE_GOOGLE_MAPS_API_KEY=tu-clave-de-google-maps
~~~

En Google Cloud habilita como mínimo:

- Maps JavaScript API.
- Funcionalidad de rutas utilizada por tu proyecto.

Restringe la clave por sitios web autorizados. En producción agrega el dominio de Vercel y el dominio definitivo. En desarrollo puedes autorizar:

<code>http://localhost:3000/*</code>

La aplicación también dispone de una alternativa con OpenStreetMap, Nominatim y OSRM para el cálculo de rutas cuando Google Maps no está disponible. Esa alternativa depende de servicios externos y sus límites de uso.

Configura el origen de la farmacia:

~~~env
VITE_PHARMACY_ORIGIN=Dirección exacta de la farmacia
VITE_PHARMACY_ORIGIN_LAT=-10.500000
VITE_PHARMACY_ORIGIN_LNG=-76.566700
~~~

Si no configuras estas variables, se utilizan los valores de demostración incluidos en el código.

## Despliegue en Vercel

### Opción recomendada: repositorio Git

1. Sube el proyecto a GitHub, GitLab o Bitbucket.
2. Entra a [Vercel](https://vercel.com/).
3. Selecciona <code>Add New → Project</code>.
4. Importa el repositorio.
5. Selecciona la carpeta raíz del proyecto.
6. Usa la configuración:

   - Framework: Vite.
   - Build command: <code>pnpm run build</code>.
   - Output directory: <code>dist</code>.
   - Install command: <code>pnpm install --frozen-lockfile</code>.

Vercel suele detectar automáticamente Vite y <code>pnpm-lock.yaml</code>. Si no lo detecta, introduce los valores anteriores manualmente.

### Variables en Vercel

En:

<code>Project Settings → Environment Variables</code>

Agrega para <code>Production</code>:

~~~text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
GROQ_API_KEY
VITE_GOOGLE_MAPS_API_KEY
VITE_PHARMACY_ORIGIN
VITE_PHARMACY_ORIGIN_LAT
VITE_PHARMACY_ORIGIN_LNG
~~~

Las variables de Google Maps y la dirección son opcionales. <code>GROQ_API_KEY</code> debe ser privada. No agregues <code>VITE_GROQ_API_KEY</code> en Vercel.

Para variables que también necesites en previews, selecciona además <code>Preview</code>. No es necesario copiar claves privadas a todos los entornos.

### Volver a desplegar

Los cambios de variables de entorno no siempre modifican una implementación ya generada. Después de guardar las variables:

1. Abre <code>Deployments</code>.
2. Selecciona <code>Redeploy</code>, o crea un nuevo commit.
3. Espera a que el despliegue termine correctamente.
4. Prueba la URL pública en una ventana privada del navegador.

Si solo tienes el archivo RAR y no usas Git, puedes crear un nuevo proyecto desde Vercel y subir/importar el código mediante el flujo disponible en tu cuenta. Para actualizaciones frecuentes, Git es más recomendable.

## Pruebas posteriores a la instalación

Realiza las siguientes pruebas en este orden:

### Prueba 1: carga pública

- Abre la URL de Vercel desde una ventana privada.
- Confirma que se muestre la portada.
- Comprueba que el catálogo cargue productos.
- Revisa que no aparezca un error de variables de Supabase.

### Prueba 2: crear cuenta

- Abre <code>Inicia sesión</code>.
- Selecciona <code>Regístrate</code>.
- Completa nombre, correo y contraseña.
- Pulsa <code>Crear Cuenta</code>.
- Comprueba que no solicite verificación de correo.
- Comprueba que la sesión se mantenga después de actualizar la página.

### Prueba 3: perfil automático

- Revisa en Supabase que exista el usuario en <code>Authentication → Users</code>.
- Revisa que exista el mismo identificador en <code>public.profiles</code>.
- Confirma que el rol inicial sea <code>customer</code>.

### Prueba 4: sesión

- Cierra sesión.
- Inicia sesión con el mismo correo y contraseña.
- Confirma que los pedidos del usuario se carguen correctamente.

### Prueba 5: carrito y pedido

- Agrega un producto al carrito.
- Abre el checkout.
- Prueba la dirección de entrega.
- Crea un pedido de prueba.
- Confirma en Supabase que existan el pedido y sus elementos.

### Prueba 6: FarmaBot

- Abre FarmaBot.
- Envía una pregunta sobre un producto.
- En producción confirma que la solicitud use <code>/api/groq</code>.
- No debe aparecer una clave en la consola, en la URL ni en el código descargado.

### Prueba 7: móvil

- Abre la URL pública desde un teléfono conectado a Internet.
- Prueba registro, inicio de sesión, catálogo, carrito y pedido.
- Confirma que no se utilice una URL <code>localhost</code>.

## Solución de problemas

### Error: variables de Supabase no configuradas

Comprueba:

1. Que <code>.env.local</code> esté en la raíz, junto a <code>package.json</code>.
2. Que los nombres sean exactamente <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
3. Que no existan comillas sobrantes o espacios extra.
4. Que hayas reiniciado <code>pnpm dev</code>.
5. En Vercel, que las variables estén creadas en el entorno correcto y que hayas hecho redeploy.

### Error: email rate limit exceeded

Ese error proviene del envío repetido de correos de Supabase. Para el flujo sin verificación:

1. Ve a <code>Authentication → Sign In / Providers → Email</code>.
2. Desactiva <code>Confirm email</code>.
3. Guarda.
4. Espera unos minutos si ya agotaste el límite.
5. Prueba con un correo nuevo.

Si deseas recuperación de contraseña por correo, entonces sí necesitas configurar un proveedor SMTP y sus registros DNS. El registro sin verificación no necesita SMTP.

### Error: Error sending confirmation email

La confirmación de correo sigue activada o Supabase intentó enviar un correo sin un proveedor SMTP configurado. Desactiva <code>Confirm email</code> si deseas el registro inmediato.

### FarmaBot muestra API Key requerida

En local:

- Configura <code>VITE_GROQ_API_KEY</code> en <code>.env.local</code>.
- Reinicia Vite.

En Vercel:

- Configura <code>GROQ_API_KEY</code>, sin prefijo <code>VITE_</code>.
- Selecciona <code>Production</code>.
- Confirma que <code>api/groq.js</code> esté publicado.
- Ejecuta un nuevo deploy.
- Elimina la variable antigua <code>VITE_GROQ_API_KEY</code> de Vercel.

### Error 404 en /api/groq

Comprueba que:

- <code>api/groq.js</code> esté en la raíz y no dentro de <code>src</code>.
- El proyecto esté desplegado en Vercel o en un proveedor compatible con funciones serverless.
- El frontend y la función pertenezcan al mismo proyecto de Vercel.
- Se haya realizado un nuevo despliegue después de agregar el archivo.

El modo <code>pnpm dev</code> utiliza la llamada directa de desarrollo y no levanta automáticamente la función serverless de Vercel.

### Error: relation products does not exist

La tabla <code>products</code> todavía no existe en la base de datos seleccionada por <code>VITE_SUPABASE_URL</code>. Revisa el esquema en Supabase y confirma que las variables no apunten a otro proyecto.

### El perfil no aparece después del registro

Comprueba:

1. Que ejecutaste <code>supabase/migrations/20260906000000_create_profile_on_signup.sql</code>.
2. Que el trigger <code>on_auth_user_created</code> exista.
3. Que la tabla <code>public.profiles</code> exista.
4. Que la consola de Supabase no muestre un error del trigger.
5. Que no exista una restricción incompatible en <code>profiles</code>.

### Google Maps no carga

Comprueba la clave, las APIs habilitadas y las restricciones por dominio. La aplicación intenta utilizar OpenStreetMap/OSRM como alternativa para las rutas, pero ese servicio también puede tener límites o indisponibilidad.

## Seguridad

Antes de compartir la aplicación públicamente:

- Nunca incluyas <code>.env.local</code> en el RAR.
- Nunca subas claves reales al repositorio.
- Nunca uses <code>service_role</code> en el navegador.
- Mantén <code>GROQ_API_KEY</code> como secreto en Vercel.
- Si una clave aparece en una captura, revócala y genera otra.
- Restringe la clave de Google Maps por dominio y APIs.
- Revisa las políticas RLS de <code>profiles</code>, <code>orders</code> y <code>order_items</code>.
- No permitas que un cliente normal cambie su propio campo <code>role</code>.
- No mantengas una política pública de lectura sobre <code>profiles</code>, porque puede exponer correos y nombres.
- Agrega límites de uso al endpoint de Groq.
- Agrega CAPTCHA o protección anti-bot si el registro queda abierto sin confirmación de correo.
- Haz copias de seguridad antes de modificar el esquema de Supabase.

El archivo <code>bd.txt.txt</code> contiene una instrucción <code>DROP TABLE</code> en una sección histórica. No ejecutes el archivo completo en producción sin revisarlo y sin copia de seguridad.

## Contenido recomendado del archivo RAR

Incluye:

- <code>api/</code>
- <code>public/</code>
- <code>src/</code>
- <code>supabase/</code>
- <code>.env.example</code>
- <code>.gitignore</code>
- <code>.nvmrc</code>
- <code>index.html</code>
- <code>package.json</code>
- <code>pnpm-lock.yaml</code>
- <code>pnpm-workspace.yaml</code>
- <code>postcss.config.js</code>
- <code>tailwind.config.js</code>
- <code>vite.config.js</code>
- <code>README.md</code>

No incluyas:

- <code>.env.local</code>
- Claves API reales.
- <code>node_modules/</code>
- <code>.git/</code>, salvo que necesites conservar el historial Git.
- <code>dist/</code>, porque se genera con <code>pnpm build</code>.
- Carpetas temporales o archivos de credenciales.

Antes de comprimir, revisa el contenido del archivo:

~~~powershell
Get-ChildItem -Force
~~~

Comprueba específicamente que no exista <code>.env.local</code> en lo que vas a compartir.

## Estructura principal

| Ruta | Descripción |
|---|---|
| <code>src/App.jsx</code> | Componente principal y flujo general de la tienda. |
| <code>src/components/</code> | Componentes de tienda, autenticación, checkout, administración y chat. |
| <code>src/contexts/SupabaseAuthContext.jsx</code> | Registro, inicio y cierre de sesión con Supabase. |
| <code>src/lib/customSupabaseClient.js</code> | Cliente público de Supabase. |
| <code>src/lib/datawarehouseQueries.js</code> | Consultas de productos, perfiles y pedidos. |
| <code>src/lib/adminQueries.js</code> | Consultas del panel administrativo. |
| <code>src/lib/groqClient.js</code> | Cliente de FarmaBot; usa Groq directo en desarrollo y proxy en producción. |
| <code>api/groq.js</code> | Función serverless que protege la clave de Groq en producción. |
| <code>src/lib/googleMapsClient.js</code> | Google Maps y alternativa de rutas con OpenStreetMap/OSRM. |
| <code>supabase/migrations/</code> | Migraciones SQL ejecutables en Supabase. |
| <code>bd.txt.txt</code> | Referencia histórica del esquema; debe revisarse antes de ejecutar. |
| <code>public/</code> | Imágenes y archivos públicos. |
| <code>dist/</code> | Archivos generados por la compilación de producción. |

## Comandos disponibles

~~~powershell
pnpm dev       # Inicia el servidor de desarrollo en el puerto 3000
pnpm build     # Genera la compilación de producción en dist
pnpm preview   # Previsualiza la compilación local
~~~

Actualmente el proyecto no incluye un script automatizado de pruebas ni una configuración de ESLint. Por eso, antes de publicar se recomienda realizar las pruebas manuales descritas en este documento y revisar la consola del navegador y los registros de Vercel/Supabase.

## Flujo resumido de instalación

~~~text
Extraer RAR
    ↓
Instalar Node.js 20 y pnpm
    ↓
Ejecutar pnpm install --frozen-lockfile
    ↓
Crear .env.local
    ↓
Configurar Supabase y ejecutar la migración del perfil
    ↓
Desactivar Confirm email si se desea registro inmediato
    ↓
Ejecutar pnpm dev para probar localmente
    ↓
Configurar GROQ_API_KEY y variables públicas en Vercel
    ↓
Desplegar y probar la URL pública desde otro dispositivo
~~~

