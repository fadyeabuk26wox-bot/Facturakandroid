// Pone el logo de FacturaK como icono de la app Android (se ejecuta después de "npx cap add android").
const fs = require('fs'), path = require('path');
const res = 'android/app/src/main/res', orig = 'resources/android';
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const dst = path.join(res, 'mipmap-' + d); fs.mkdirSync(dst, { recursive: true });
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'fk_icon_fg.png']) fs.copyFileSync(path.join(orig, 'mipmap-' + d, f), path.join(dst, f));
}
// icono adaptable (Android 8+): fondo azul de FacturaK + la "K" verde
fs.mkdirSync(path.join(res, 'values'), { recursive: true });
fs.writeFileSync(path.join(res, 'values/fk_icon.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="fk_icon_bg">#00468C</color></resources>\n');
const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/fk_icon_bg"/>\n  <foreground android:drawable="@mipmap/fk_icon_fg"/>\n</adaptive-icon>\n';
const any = path.join(res, 'mipmap-anydpi-v26'); fs.mkdirSync(any, { recursive: true });
fs.writeFileSync(path.join(any, 'ic_launcher.xml'), adaptive);
fs.writeFileSync(path.join(any, 'ic_launcher_round.xml'), adaptive);
console.log('Icono de FacturaK aplicado');
