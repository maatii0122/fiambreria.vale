# Fiambrerías Vale POS

## Setup rápido

### 1. Supabase
1. Crear proyecto en supabase.com (gratis)
2. SQL Editor → pegar `supabase/schema.sql` → Run
3. Authentication → crear usuario: tu email + contraseña
4. Settings → API → copiar Project URL y anon key

### 2. Variables de entorno
Crear archivo `.env` en la raíz del proyecto:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ANTHROPIC_API_KEY=sk-ant-... (opcional, solo para Scanner)
```

### 3. Deploy en Netlify
1. Subir carpeta a GitHub (tu repo existente)
2. netlify.com → Add new site → Import from Git
3. Site configuration → Environment variables → agregar las 3 variables
4. Deploy site → esperar 2 minutos

### 4. Dominio propio
Netlify → Domain management → Add custom domain → seguir instrucciones DNS

## Desarrollo local
```
npm install
npm run dev
```
