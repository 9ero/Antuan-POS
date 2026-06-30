// PIN de acceso al panel de administración.
// Se lee de EXPO_PUBLIC_ADMIN_PIN (definida en .env, horneada en build time) para
// poder cambiarlo sin tocar código. Fallback a '1234' si no está seteada.
// Centralizado aquí para no desincronizar los lugares que lo verifican
// (admin/_layout.tsx, history.tsx).
// Nota: EXPO_PUBLIC_ queda embebida en el APK en texto plano — no es un secreto fuerte,
// solo una barrera básica de acceso al panel.
export const ADMIN_PIN = process.env.EXPO_PUBLIC_ADMIN_PIN || '1234';
