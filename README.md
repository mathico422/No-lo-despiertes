# No lo despiertes — Obra Interactiva de Arte Generativo

**"No lo despiertes"** es una obra de arte digital generativo e interactivo desarrollada exclusivamente con **HTML5, CSS3, JavaScript nativo, p5.js y p5.sound**.

La obra sitúa al usuario ante un científico durmiente inspirado en Bruce Banner en un laboratorio oscuro y cinematográfico. La entrada del micrófono en tiempo real y los clics directos sobre el personaje aumentan su nivel de ira (`ira` 0-100), desatando una metamorfosis continua y generativa hasta culminar en un puñetazo frontal que fractura la pantalla con física y algoritmos de grietas radiales.

Frente al personaje hay una mesa con objetos físicos interactivos. El usuario puede agarrarlos, arrastrarlos y lanzarlos sobre Bruce. Cada objeto produce un aumento diferente de ira; el paquete de **Weed Candies** reduce el nivel y permite intentar calmarlo.

---

## 🚀 Cómo ejecutar el proyecto

Para que `p5.AudioIn` funcione correctamente y tenga acceso al micrófono, el proyecto **debe servirse a través de un servidor local (`http://localhost`) o un protocolo seguro (`https://`)**. Los navegadores modernos bloquean el micrófono al abrir archivos directamente con el protocolo `file:///`.

### Opción rápida en Windows (recomendada)
1. Haz doble clic en **`INICIAR_JUEGO.bat`**.
2. El navegador abrirá automáticamente `http://localhost:5500`.
3. Mantén abierta la ventana negra mientras usas la obra.
4. Para terminar, cierra esa ventana o presiona `Ctrl + C`.

No abras `index.html` con doble clic si necesitas el micrófono: en ese caso el
navegador usa `file://` y bloquea el acceso al dispositivo por seguridad.

### Opción 1: Con la extensión Live Server (VS Code)
1. Abre la carpeta `no-lo-despiertes` en VS Code.
2. Haz clic derecho sobre el archivo `index.html`.
3. Selecciona **"Open with Live Server"** (o presiona `Alt + L, Alt + O`).
4. Se abrirá automáticamente en tu navegador predeterminado en `http://127.0.0.1:5500`.

### Opción 2: Con Node.js (`npx serve` o `http-server`)
En la terminal, dentro del directorio del proyecto, ejecuta:
```bash
npx serve .
# o también:
npx http-server . -p 8080
```
Luego abre `http://localhost:3000` (o `http://localhost:8080`) en tu navegador.

### Opción 3: Con Python
```bash
# Python 3
python -m http.server 8000
```
Luego abre `http://localhost:8000`.

---

## 🎙️ Permisos y Uso del Micrófono

1. Al abrir la obra, verás una pantalla de bienvenida con el botón **“Comenzar experiencia”**.
2. Al hacer clic, el navegador solicitará permiso para acceder al micrófono. **Haz clic en "Permitir"**.
3. **Calibración inicial de 2 segundos:** El sistema medirá el ruido ambiental de fondo para fijar el umbral base y evitar que sonidos normales activen la ira inmediatamente.
4. **Privacidad garantizada:** La aplicación *no graba, no almacena ni transmite ningún tipo de audio*. Únicamente analiza los niveles de volumen y amplitud en tiempo real.
5. **Modo alternativo (Fallback):** Si deniegas el micrófono o tu dispositivo no dispone de uno, puedes interactuar haciendo clic sobre el personaje.

---

## 🎮 Controles e Interacción

- **Voz / Sonidos del entorno:** Hablar, aplaudir o hacer ruido por encima del umbral ambiental incrementará la ira del personaje.
- **Silencio:** Mantener silencio permitirá que el personaje se calme y su nivel de ira decaiga progresivamente.
- **Clic con el ratón:** Hacer clic directamente sobre el cuerpo del científico perturbará su descanso y aumentará su ira.
- **Objetos de la mesa:** Mantén presionado el clic sobre un objeto, arrástralo rápidamente hacia Bruce y suéltalo para lanzarlo.
- **Objetos irritantes:** La alarma, el café, la probeta gamma y la pesa aumentan la ira con distinta intensidad.
- **Weed Candies:** Si el paquete impacta al personaje, reduce 24 puntos de ira.
- **Reiniciar experiencia:**
  - Presiona la tecla **`R`** o **`r`** en cualquier momento.
  - O haz clic en el botón **↺ REINICIAR** situado en la esquina superior derecha del HUD.

---

## 📁 Estructura de Archivos

```
no-lo-despiertes/
├── index.html              # Estructura semántica, modal de bienvenida y HUD biométrico
├── style.css               # Estética cinematográfica sci-fi, glassmorphism y responsive
├── sketch.js               # Lógica generativa, audio, sistema de partículas y destrucción
├── vendor/                 # Copias locales de p5.js y p5.sound para una carga confiable
├── memoria-descriptiva.txt # Memoria descriptiva universitaria (≤ 300 palabras)
└── README.md               # Guía de ejecución, permisos y controles
```
