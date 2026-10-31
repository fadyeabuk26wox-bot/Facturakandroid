// Agrega permisos de cámara/Bluetooth y visibilidad de WhatsApp al manifiesto
// que genera "npx cap add android". Se ejecuta en la nube antes de compilar.
const fs = require('fs');
const p = 'android/app/src/main/AndroidManifest.xml';
let s = fs.readFileSync(p, 'utf8');
// La PC central se contacta por http:// dentro de la red local: Android lo bloquea salvo que se permita.
if (!s.includes('usesCleartextTraffic')) s = s.replace('<application', '<application android:usesCleartextTraffic="true"');
if (s.includes('android.permission.CAMERA')) { fs.writeFileSync(p, s); process.exit(0); }
const extra = `    <queries><package android:name="com.whatsapp" /><package android:name="com.whatsapp.w4b" /></queries>
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.bluetooth" android:required="false" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />`;
s = s.replace('    <uses-permission android:name="android.permission.INTERNET" />', extra);
fs.writeFileSync(p, s);
console.log('Manifiesto actualizado');
