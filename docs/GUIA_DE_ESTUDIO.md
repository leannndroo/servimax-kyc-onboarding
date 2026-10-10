# Guía de estudio · Prueba técnica Servimax

Esta guía es para que entiendas el proyecto de punta a punta y puedas **explicarlo y defenderlo** en la entrevista. Léela con el código abierto al lado.

> **Lo más importante:** antes de entregar, corre el proyecto tú mismo, prueba todos los escenarios y haz al menos uno de los ejercicios del final. En la entrevista te van a preguntar "¿por qué hiciste esto así?", y la mejor respuesta sale de haberlo tocado. Si te preguntan si usaste IA, di la verdad: que la usaste como apoyo y que entiendes y puedes modificar cada parte. Eso es lo que hoy se espera de un desarrollador.

---

## 1. La idea en una frase

Un tendero se registra desde el celular, toma foto de su cédula, el sistema la lee, él confirma los datos, el backend consulta servicios externos y devuelve una decisión (**Validado / Requiere revisión / No validado**) con un puntaje de 0 a 100 y **las razones**.

## 2. Recorrido de una petición (síguelo en el código)

Ejemplo: el usuario toca **"Confirmar datos"**.

1. `mobile/src/screens/OcrReviewScreen.tsx` → función `confirm()` valida con `validateConfirmation()` (`mobile/src/validation.ts`).
2. Llama a `confirmData()` en `mobile/src/api/onboarding.ts`, que usa `request()` de `mobile/src/api/client.ts` (fetch con timeout).
3. Llega al backend: `backend/src/routes/onboarding.routes.ts` → ruta `PUT /onboarding/:id/confirmation`.
4. La ruta valida otra vez con zod (`backend/src/domain/schemas.ts`). **Nunca se confía solo en el celular.**
5. Llama a `service.confirm()` en `backend/src/services/onboardingService.ts`: calcula qué campos corrigió el usuario, borra las fotos de memoria, escribe en la bitácora y guarda.
6. Responde JSON. En la app, `dispatch({ type: 'CONFIRMED' })` actualiza el estado (`mobile/src/state/OnboardingContext.tsx`) y la app pasa a la pantalla de consultas.

Si algo falla en cualquier punto, el error viaja como `{ error: { code, message } }` y la pantalla muestra el mensaje con una opción para seguir.

## 3. Conceptos que usa el proyecto (y dónde verlos)

| Concepto | Qué es, en simple | Dónde |
|---|---|---|
| **TypeScript** | JavaScript con tipos: el editor te avisa errores antes de ejecutar | Todo el proyecto; los tipos principales en `domain/types.ts` y `mobile/src/types.ts` |
| **Express** | Librería para crear un servidor HTTP con rutas | `backend/src/app.ts`, `routes/` |
| **Middleware** | Función que se ejecuta antes o después de cada petición (seguridad, logs, errores) | `app.ts` (helmet, rate limit), `middleware/errorHandler.ts` |
| **zod** | Valida que los datos tengan la forma correcta y da mensajes por campo | `domain/schemas.ts` |
| **Interfaz + implementaciones (patrón adaptador)** | Defines *qué* hace algo (`extractText`) y puedes tener varios *cómo* (OCR.space, mock) | `services/ocr/ocrProviders.ts` |
| **Patrón Repository** | La lógica guarda datos sin saber si es un archivo o una base de datos | `repositories/sessionRepository.ts` |
| **Inyección de dependencias** | Al servicio le *pasas* el OCR, el repositorio y el cliente KYC; por eso en los tests puedes pasar otros | `createApp()` en `app.ts` |
| **Función pura** | Misma entrada → misma salida, sin efectos secundarios. Fácil de probar | `services/scoring.ts` |
| **async/await + Promise.all** | Esperar operaciones lentas; `Promise.all` corre varias al tiempo | `kycClient.ts → runAll()` |
| **Timeout con AbortController** | Cancelar una petición que tarda demasiado | `utils/errors.ts → withTimeout()`, `mobile/src/api/client.ts` |
| **Reintento con espera** | Si falla por algo temporal (timeout, 503), intentar otra vez después de un momento | `kycClient.ts → post()` |
| **multipart/form-data** | Formato para enviar archivos (las fotos) | `uploadDocuments()` en la app, `multer` en el backend |
| **useReducer + Context** | Estado global de la app: todas las pantallas leen y modifican el mismo estado con acciones | `state/OnboardingContext.tsx` |
| **ErrorBoundary** | Componente que atrapa errores de pantalla y evita que la app se cierre | `components/ErrorBoundary.tsx` |

## 4. Las 5 decisiones que debes poder explicar

1. **"¿Por qué el móvil no llama directo a OCR.space?"** Porque necesitaría la API key, y todo lo que va dentro de la app se puede extraer. Las keys viven en el backend (`config/env.ts`) y la app solo conoce la URL del backend.
2. **"¿Por qué usaste mocks?"** La prueba lo permite y no hay acceso a bases gubernamentales. Simulé lo que no controlo (proveedores externos) detrás de interfaces, para cambiarlos por los reales solo con variables de entorno. El mock KYC es un servicio HTTP de verdad, así que la integración (API key, timeout, reintento, validación) es real. Lo que sí es mío, el score, lo implementé y probé.
3. **"¿Cómo funciona el score?"** 7 factores que suman 100 (ver README, sección 7) y alertas con severidad. Una alerta crítica (listas, documento cancelado, menor de edad) → No validado. Una alta (servicio caído, datos que no coinciden, sin OCR) → máximo Requiere revisión. Si no hay alertas que limiten: ≥80 validado, 50–79 revisión, <50 no validado.
4. **"¿Qué pasa si el proveedor KYC se cae?"** El cliente espera hasta 4 s, reintenta una vez y, si sigue fallando, devuelve un resultado `ERROR` en lugar de lanzar una excepción. El score lo convierte en "Requiere revisión" y la app ofrece "Reintentar consultas". Nunca se aprueba algo que no se pudo verificar, y tampoco se rechaza injustamente.
5. **"¿Qué datos guardas?"** Las fotos solo en RAM y se borran al confirmar (o a los 30 min). En disco quedan registro, datos confirmados, consultas, score y bitácora durante 72 h para auditoría. Los logs no tienen datos personales gracias a la función `redact()`.

## 5. Preguntas probables en la entrevista

- **¿Qué es una API REST?** Un servidor que expone recursos por URL y métodos HTTP (GET leer, POST crear/acción, PUT reemplazar). Aquí el recurso es la "sesión de onboarding".
- **¿Diferencia entre 400, 404, 409 y 500?** 400 datos inválidos · 404 no existe · 409 el paso no corresponde todavía (ej. consultar sin confirmar) · 500 error interno del servidor.
- **¿Por qué validas en la app y en el servidor?** En la app para que el usuario vea el error al instante; en el servidor porque cualquiera puede llamar la API sin usar la app.
- **¿Qué harías para producción?** Lee la sección 13 del README; menciona al menos autenticación por OTP, cifrado, base de datos real, cola de trabajos y Habeas Data (Ley 1581).
- **¿Cómo probaste?** Tests con `node:test`: unitarios del score y del lector de cédula, de resiliencia del cliente KYC, y uno de integración que recorre todo el flujo por HTTP.
- **¿Qué fue lo más difícil?** Respuesta honesta sugerida: que los errores nunca dejaran al usuario sin salida, y leer la cédula porque el OCR no es perfecto y hay dos formatos.
- **¿Qué mejorarías con más tiempo?** Detección de vida (selfie), comparación facial, pruebas end-to-end en la app y calibrar el score con datos reales.

## 6. Plan para practicar (2–3 horas)

1. Levanta el backend y abre `http://localhost:3000/docs`. Ejecuta el flujo desde Swagger: crear sesión → (las fotos súbelas desde la app) → ver la sesión.
2. Levanta la app y haz el flujo con un documento terminado en **9** (validado), luego en **4** (servicio caído) y en **6** (OCR sin resultados).
3. Corre `npm test` en `backend` y lee `scoring.test.ts`: cada test es una regla del negocio.
4. Pon un `console.log` temporal en `computeScore()` para ver los factores mientras usas la app. Quítalo después.

## 7. Ejercicios para hacerlo tuyo (elige al menos uno)

1. **Fácil:** agrega `trashmail.com` a la lista de dominios de correo temporal en `kycClient.ts` y escribe un test.
2. **Fácil:** cambia los umbrales a 85/55 en `scoring.ts`, corre los tests y explica cuáles cambian y por qué.
3. **Medio:** agrega una regla: si la ciudad registrada es distinta al lugar de expedición, alerta `LOW`. Pista: en el bloque "D. Coherencia" de `scoring.ts`, usando `normalizeName()`.
4. **Medio:** agrega un escenario al mock KYC (`mockKycScenarios.ts`) para documentos que empiecen por `999` que devuelva `found: false` y mira cómo lo trata el score.
5. **Reto:** guarda las sesiones en MySQL (lo conoces) creando una clase `MySqlSessionRepository` que implemente la misma interfaz `SessionRepository`.

## 8. Glosario rápido

- **KYC** (*Know Your Customer*): proceso para verificar que una persona es quien dice ser antes de darle un servicio.
- **OCR** (*Optical Character Recognition*): convertir texto de una imagen en texto digital.
- **Mock**: implementación simulada de un servicio, para desarrollar y probar sin depender del real.
- **Timeout**: tiempo máximo que esperas una respuesta.
- **Falso positivo / negativo**: validar a alguien que no debía (positivo) o rechazar a alguien legítimo (negativo).
- **Listas restrictivas**: listas de personas con las que una empresa no debe hacer negocios (por ejemplo, OFAC).
- **Habeas Data**: derecho de las personas a conocer, actualizar y rectificar sus datos (Ley 1581 de 2012 en Colombia).
