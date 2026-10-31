# FacturaK v1.7.0 — Cliente Android (Capacitor)

Misma interfaz que el .exe (`www/`), dentro de un contenedor Android. Se **vincula a la PC central**
escaneando el QR de la pestaña "Red y dispositivos" (cámara con ML Kit), o escribiendo IP + código.

## Opción A — GitHub Actions (sin instalar nada)
1. Crea un repositorio privado en GitHub y sube TODO el contenido de esta carpeta (incluye `.github/`).
2. Pestaña **Actions → "Build APK" → Run workflow** (también corre con cada push).
3. Al terminar (~8 min) descarga el artefacto **FacturaK-APK** → `app-debug.apk`.

## Opción B — En tu PC (Node 20+, JDK 21, Android SDK / Android Studio)
```bash
npm install
npm run build:bridge          # empaqueta native-src/bridge.js -> www/js/native-bridge.js
npx cap add android           # solo la primera vez
node scripts/patch-manifest.js  # permite http en LAN (usesCleartextTraffic)
npx cap sync android
cd android && ./gradlew assembleDebug      # Windows: gradlew.bat assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
APK firmado para distribución: `./gradlew assembleRelease` + keystore, o Android Studio → Build → Generate Signed APK.

## Instalar en el teléfono
Copia el .apk (USB, WhatsApp, Drive) → ábrelo → permite "Instalar apps desconocidas" → Instalar.

## Primer uso
1. En la PC (FacturaK 1.7.0): **Red y dispositivos → Encender servidor**.
2. En el teléfono, en la misma WiFi: **🔗 Conectar a una PC central → Escanear QR** (o IP:puerto + código de 6 dígitos).
3. Para fuera de casa: en la PC elige un túnel (Cloudflare recomendado) y se añade al QR; el teléfono prueba LAN y luego el túnel.

## No probado en dispositivo real
Compilación del APK, escáner de cámara y túneles contra Internet real no se pudieron ejecutar en el entorno de desarrollo.
