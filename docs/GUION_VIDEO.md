# Guion del video (máximo 2 minutos)

**Preparación:** backend corriendo, app abierta en el celular, grabación de pantalla del celular activada (Android: "Grabar pantalla" en ajustes rápidos · iPhone: Centro de control). Ten una cédula real o de ejemplo a mano. Usa un número terminado en **9** para el caso favorable y en **4** para el caso con error. Ensaya una vez antes de grabar.

| Tiempo | En pantalla | Qué decir (resumido) |
|---|---|---|
| 0:00–0:12 | Pantalla de inicio (muestra "Conectado · OCR") | "Este es el MVP de onboarding KYC para tenderos: app en React Native con Expo y backend en Node con TypeScript." |
| 0:12–0:30 | Registro: deja un campo mal para que aparezca el error, corrígelo y continúa | "Valido obligatoriedad y formato en la app y otra vez en el servidor." |
| 0:30–0:50 | Captura: cancela la cámara una vez (aparece el aviso), luego toma frente y reverso | "Si el usuario cancela, falta una foto o la imagen es de baja calidad, se explica y se ofrece una salida." |
| 0:50–1:08 | OCR: muestra el switch, toca "Leer documento", corrige un campo | "El OCR está desacoplado y se puede apagar. El usuario revisa y corrige; las correcciones quedan registradas." |
| 1:08–1:20 | Consultas → Resultado "Validado" con el score | "El backend consulta el proveedor KYC con timeout y reintento, y calcula un score explicable." |
| 1:20–1:35 | Baja por el resultado: factores, alertas, consultas, bitácora; toca PDF | "La pantalla final es auditable y se puede descargar el informe en PDF, JSON o CSV." |
| 1:35–1:52 | (Corte) Resultado de un documento terminado en 4: "Requiere revisión" + "Reintentar consultas" | "Si el proveedor se cae, la app no se cierra: el caso queda en revisión y se puede reintentar." |
| 1:52–2:00 | Swagger o métricas | "Incluye tests, Swagger, Docker, CI y la sección 'Antes de producción' en el README." |

**Consejos:** habla tranquilo, sin leer; si te pasas de 2 minutos, recorta el registro. Sube el video a YouTube como **No listado** o a Google Drive con acceso por enlace, y pega el enlace en el README (sección 12).
