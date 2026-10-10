# Checklist de entrega

## 1. Probar en tu computador
- [ ] `cd backend && npm install && npm test` → todos los tests pasan
- [ ] `npm run typecheck` en `backend` y en `mobile` sin errores
- [ ] Backend con `npm run dev` y `/docs` abre Swagger
- [ ] App en Expo Go conectada (la bienvenida dice "Conectado")
- [ ] Flujo con documento terminado en 9 → Validado
- [ ] Flujo con documento terminado en 4 → Requiere revisión → "Reintentar consultas"
- [ ] Flujo con documento terminado en 6 → OCR sin resultados → opciones de salida
- [ ] Descarga del informe en PDF, JSON y CSV
- [ ] (Opcional) OCR real con tu key de OCR.space y una cédula de verdad

## 2. Evidencias (carpeta `docs/evidencias/`)
Toma capturas del celular y guárdalas con estos nombres (son los que muestra el README):
- [ ] `01-registro.png`
- [ ] `02-captura.png`
- [ ] `03-ocr.png`
- [ ] `04-consultas.png`
- [ ] `05-resultado.png`

> Si usas tu cédula real en las capturas o el video, **tapa o difumina el número y la foto**. Mejor aún: usa una cédula de ejemplo o los datos de prueba.

## 3. Video
- [ ] Grabado siguiendo `docs/GUION_VIDEO.md`, máximo 2 minutos
- [ ] Subido como "No listado" (YouTube) o con enlace (Drive)
- [ ] Enlace pegado en el README, sección 12

## 4. Publicar en GitHub
```bash
cd servimax-kyc-onboarding
git init
git add .
git status            # revisa que NO aparezcan archivos .env ni node_modules
git commit -m "MVP onboarding KYC para tenderos"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/servimax-kyc-onboarding.git
git push -u origin main
```
- [ ] El repositorio es **público**
- [ ] Están `backend/package-lock.json` y `mobile/package-lock.json` (se crean con `npm install`)
- [ ] La pestaña **Actions** de GitHub muestra el CI en verde
- [ ] Ningún archivo `.env` subido (solo `.env.example`)

## 5. Antes de enviar el enlace
- [ ] Leíste la `GUIA_DE_ESTUDIO.md` y puedes explicar las 5 decisiones de la sección 4
- [ ] Hiciste al menos un ejercicio de la sección 7 de la guía
