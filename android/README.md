# App Android «Bodega Komatsu»

La app es la tienda web a pantalla completa, con el ícono 小松 y el nombre **Bodega Komatsu**
(tecnología *Trusted Web Activity* de Google). Todo lo que cambies en la web o en el panel
de administración aparece en la app al instante: **no hace falta publicar una versión nueva
por cada cambio de precios, fotos o degustaciones.**

- Paquete: `com.bodegakomatsu.app`
- Ícono, pantalla de inicio y gráficos de la ficha: `android/store/`
- Dominio de la tienda: `komatsuHost` en `android/gradle.properties`

## 0. Antes de empezar

1. **La tienda tiene que estar publicada en internet** (por ejemplo en Render, ver el README principal).
   La app abre esa dirección.
2. Poné esa dirección en `android/gradle.properties` → `komatsuHost=tu-dominio.com` (sin `https://`).

## 1. Cargar la llave de firma en GitHub (una sola vez)

En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**, y creá:

| Nombre | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | el contenido de `ANDROID_KEYSTORE_BASE64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | el contenido de `ANDROID_KEYSTORE_PASSWORD.txt` |

Guardá la carpeta de la llave en un lugar seguro: sin ella no se pueden subir actualizaciones con la misma firma.

## 2. Compilar

Pestaña **Actions → App Android → Run workflow**. En unos minutos, abajo de la ejecución aparecen:

- `bodega-komatsu-apk`: APK para instalar y probar en un celular Android.
- `bodega-komatsu-aab`: el archivo `.aab` para subir a Google Play (sólo si cargaste la llave).

## 3. Publicar en Google Play

1. Creá una cuenta en **Google Play Console** (pago único de USD 25).
2. **Crear app** → nombre *Bodega Komatsu*, idioma español (Argentina), app gratuita.
3. Ficha de la tienda: ícono `store/play-icon-512.png`, gráfico destacado `store/feature-graphic-1024x500.png`
   y capturas del celular.
4. Clasificación de contenido: declarar **referencias a alcohol / venta de alcohol** (la app es +18).
   Público objetivo: **mayores de 18**.
5. **Producción → Crear versión** → subí el `.aab`. Google Play activa *Play App Signing*.
6. En **Configuración → Integridad de la app → Firma de apps** copiá la huella **SHA-256 de la llave de firma
   de apps** y cargala en el servidor como variable de entorno `ANDROID_SHA256`
   (podés poner varias separadas por coma, por ejemplo la de Google y la de subida).
   Así la app se abre sin barra de dirección.

## Actualizar la app

Sólo hace falta cuando cambia el ícono, el nombre o el dominio: subí `komatsuVersionCode` en 1
en `gradle.properties`, compilá y subí el nuevo `.aab`.

## iPhone

La tienda ya se puede instalar desde Safari: **Compartir → Agregar a inicio** (queda con el ícono 小松
y el nombre Komatsu). Para la App Store de Apple hace falta una cuenta de Apple Developer (USD 99/año)
y una Mac con Xcode.
