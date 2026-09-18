/**
 * ============================================================================
 * PROYECTO: "No lo despiertes"
 * OBRA DE ARTE GENERATIVO INTERACTIVO
 * 
 * Tecnologías: HTML5, CSS3, JavaScript nativo, p5.js y p5.sound / Web Audio API.
 * 
 * Descripción:
 * Representación generativa procedural de un científico durmiente (Bruce Banner).
 * El micrófono capta el volumen ambiental en tiempo real y, junto con los clics
 * y los objetos lanzables, alimenta su nivel de ira (0 a 100), provocando
 * una metamorfosis física y cromática progresiva hacia una criatura colosal (Hulk).
 * Al alcanzar el 100% de ira, la criatura ejecuta un golpe demoledor hacia el frente
 * rompiendo proceduralmente la pantalla con ramificaciones fractales y física de vidrio.
 * ============================================================================
 */

// ============================================================================
// 1. VARIABLES GLOBALES Y ESTADOS DE LA APLICACIÓN
// ============================================================================

// Estados posibles: 'MODAL' | 'CALIBRANDO' | 'JUGANDO' | 'DESTRUCCION' | 'DESTRUIDO'
let estadoApp = 'MODAL';

// Variable central de ira (0.0 a 100.0)
let ira = 0.0;

// Variables para procesamiento de audio con p5.AudioIn
let mic = null;
let micIniciado = false;
let micDisponible = false;
let volumenActual = 0.0;
let volumenSuavizado = 0.0;
let eventosConfigurados = false;
let promesaCargaP5Sound = null;
let streamMicrofono = null;
let contextoAudioNativo = null;

// Parámetros de calibración ambiental (~2 segundos a 60 fps = 120 frames)
const FRAMES_CALIBRACION = 120;
let framesCalibrados = 0;
let muestrasRuido = [];
let umbralRuido = 0.025; // Umbral base de corte

// Parámetros de sensibilidad y decaimiento
const FACTOR_SENSIBILIDAD = 130.0; // Multiplicador de volumen sobre umbral
const TASA_DECAIMIENTO = 0.055;     // Decaimiento por frame en silencio
const INCREMENTO_CLIC = 8.5;        // Aumento de ira por clic sobre el personaje

// Variables de animación de destrucción y golpe final
let golpeEjecutado = false;
let frameGolpe = 0;
let destelloAlpha = 0;
let puntoImpacto = { x: 0, y: 0 };
let grietas = [];

// Sistema de partículas
let gestorParticulas;

// Mesa y objetos físicos que el usuario puede lanzar
let gestorObjetos;

// Mensaje visual que informa el efecto de cada impacto
let mensajeImpacto = {
  texto: '',
  alpha: 0,
  color: [255, 255, 255]
};

// Referencias a elementos del DOM
let dom = {};

// ============================================================================
// 2. CONFIGURACIÓN INICIAL (p5.js setup)
// ============================================================================

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('canvas-container');
  // Eliminar el indicador interno de p5 si hubiera quedado visible.
  const indicadorCarga = document.getElementById('p5_loading');
  if (indicadorCarga) indicadorCarga.remove();
  pixelDensity(min(2, window.devicePixelRatio || 1));
  frameRate(60);
  textFont('Rajdhani');

  // Inicializar gestor de partículas
  gestorParticulas = new GestorParticulas();

  // Inicializar la mesa con objetos interactivos
  gestorObjetos = new GestorObjetos();

  // Cachear elementos del DOM
  obtenerReferenciasDOM();

  // Configurar listeners
  configurarEventosUI();
}

// La interfaz HTML se enlaza sin depender de que setup() ya haya terminado.
// Esto evita que el botón quede inactivo si el usuario hace clic apenas carga la página.
document.addEventListener('DOMContentLoaded', () => {
  obtenerReferenciasDOM();
  configurarEventosUI();
});

/**
 * Obtiene y almacena las referencias a los elementos del DOM.
 */
function obtenerReferenciasDOM() {
  dom.modalInicio = document.getElementById('modal-inicio');
  dom.btnComenzar = document.getElementById('btn-comenzar');
  dom.hudOverlay = document.getElementById('hud-overlay');
  dom.hudMeterFill = document.getElementById('hud-meter-fill');
  dom.hudIraText = document.getElementById('hud-ira-text');
  dom.hudStatusBadge = document.getElementById('hud-status-badge');
  dom.micStatusDot = document.getElementById('mic-status-dot');
  dom.micStatusText = document.getElementById('mic-status-text');
  dom.hudAudioLevel = document.getElementById('hud-audio-level');
  dom.hudAudioThreshold = document.getElementById('hud-audio-threshold');
  dom.audioDbReadout = document.getElementById('audio-db-readout');
  dom.audioNote = document.getElementById('audio-note');
  dom.btnReiniciar = document.getElementById('btn-reiniciar');
  dom.audioFallbackAlert = document.getElementById('audio-fallback-alert');
}

/**
 * Registra los manejadores de eventos.
 */
function configurarEventosUI() {
  if (eventosConfigurados) return;

  if (dom.btnComenzar) {
    dom.btnComenzar.addEventListener('click', iniciarExperiencia);

    // En iPhone, p5.js captura los eventos táctiles globales del juego y puede
    // impedir que Safari genere el evento click. Escuchamos touchend directamente
    // en el botón para que el inicio siempre responda al toque del usuario.
    dom.btnComenzar.addEventListener('touchend', (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      iniciarExperiencia();
    }, { passive: false });
  }
  if (dom.btnReiniciar) dom.btnReiniciar.addEventListener('click', reiniciarExperiencia);

  eventosConfigurados = Boolean(dom.btnComenzar && dom.btnReiniciar);
}

// ============================================================================
// 3. ACTIVACIÓN Y CALIBRACIÓN DEL MICRÓFONO (Requisitos 2, 3, 4, 5, 6, 13)
// ============================================================================

/**
 * Inicia la experiencia tras el clic del usuario.
 * Oculta el modal, activa el HUD e inicia el micrófono.
 */
async function iniciarExperiencia() {
  if (estadoApp !== 'MODAL') return;

  obtenerReferenciasDOM();
  console.log("Iniciando experiencia...");

  if (dom.btnComenzar) {
    dom.btnComenzar.disabled = true;
    const textoBoton = dom.btnComenzar.querySelector('.btn-text');
    if (textoBoton) textoBoton.innerText = 'INICIANDO...';
  }

  // 1. Ocultar modal inicial inmediatamente
  if (dom.modalInicio) {
    dom.modalInicio.classList.add('fade-out');
    setTimeout(() => {
      if (dom.modalInicio) dom.modalInicio.style.display = 'none';
    }, 450);
  }

  // 2. Mostrar HUD superior
  if (dom.hudOverlay) {
    dom.hudOverlay.classList.remove('hidden');
    dom.hudOverlay.style.display = 'flex';
  }

  // 3. Establecer estado inicial
  estadoApp = 'CALIBRANDO';
  framesCalibrados = 0;
  muestrasRuido = [];

  // 4. Solicitar acceso al micrófono
  await activarMicrofono();
}

window.iniciarExperiencia = iniciarExperiencia;
window.reiniciarExperiencia = reiniciarExperiencia;

/**
 * Solicita primero el permiso con la API actual del navegador. Luego intenta
 * usar p5.AudioIn; si la versión de p5.sound no responde, conserva el stream
 * mediante Web Audio para que la interacción por volumen siga funcionando.
 */
async function activarMicrofono() {
  // El protocolo file:// no permite usar getUserMedia. En este modo la obra
  // sigue funcionando con clics y objetos, sin intentar cargar p5.sound.
  if (window.location.protocol === 'file:') {
    manejarErrorMicrofono("El navegador abrió el proyecto como archivo local. Usa INICIAR_JUEGO.bat o Live Server para habilitar el micrófono.");
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    manejarErrorMicrofono("Este navegador no permite acceder al micrófono.");
    return;
  }

  try {
    // Esta llamada directa es la que muestra el cuadro de permiso de Chrome.
    streamMicrofono = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });

    const soundDisponible = await cargarP5Sound();

    if (soundDisponible) {
      try {
        if (typeof userStartAudio === 'function') {
          await userStartAudio();
        } else if (p5?.prototype && typeof p5.prototype.userStartAudio === 'function') {
          await p5.prototype.userStartAudio();
        }

        const entradaP5 = new p5.AudioIn();
        await iniciarAudioInConTimeout(entradaP5, 2500);
        mic = entradaP5;

        // p5.AudioIn abrió su propio stream; cerramos el usado para solicitar permiso.
        streamMicrofono.getTracks().forEach((track) => track.stop());
        streamMicrofono = null;
        marcarMicrofonoActivo('p5.sound');
        return;
      } catch (errorP5) {
        console.warn("p5.AudioIn no respondió; se usa Web Audio:", errorP5);
      }
    }

    // Respaldo compatible con navegadores modernos. Mantiene la misma interfaz
    // getLevel() que utiliza el resto del sketch.
    mic = crearMedidorMicrofonoNativo(streamMicrofono);
    marcarMicrofonoActivo('Web Audio');
  } catch (error) {
    manejarErrorMicrofono(error?.message || "Permiso de micrófono no concedido.");
  }
}

function iniciarAudioInConTimeout(entrada, tiempoMaximo) {
  return new Promise((resolve, reject) => {
    let finalizado = false;
    const timeout = setTimeout(() => {
      if (!finalizado) {
        finalizado = true;
        reject(new Error('p5.AudioIn excedió el tiempo de espera.'));
      }
    }, tiempoMaximo);

    entrada.start(
      () => {
        if (finalizado) return;
        finalizado = true;
        clearTimeout(timeout);
        resolve();
      },
      (error) => {
        if (finalizado) return;
        finalizado = true;
        clearTimeout(timeout);
        reject(error || new Error('p5.AudioIn no pudo iniciarse.'));
      }
    );
  });
}

function crearMedidorMicrofonoNativo(stream) {
  const AudioContextNativo = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextNativo) throw new Error('Web Audio no está disponible.');

  contextoAudioNativo = new AudioContextNativo();
  const fuente = contextoAudioNativo.createMediaStreamSource(stream);
  const analizador = contextoAudioNativo.createAnalyser();
  analizador.fftSize = 1024;
  analizador.smoothingTimeConstant = 0.25;
  fuente.connect(analizador);
  const muestras = new Float32Array(analizador.fftSize);

  if (contextoAudioNativo.state === 'suspended') {
    contextoAudioNativo.resume().catch(() => {});
  }

  return {
    getLevel() {
      analizador.getFloatTimeDomainData(muestras);
      let sumaCuadrados = 0;
      for (let i = 0; i < muestras.length; i++) {
        sumaCuadrados += muestras[i] * muestras[i];
      }
      return Math.sqrt(sumaCuadrados / muestras.length);
    }
  };
}

function marcarMicrofonoActivo(motorAudio) {
  micIniciado = true;
  micDisponible = true;
  estadoApp = 'CALIBRANDO';
  framesCalibrados = 0;
  muestrasRuido = [];
  if (dom.audioFallbackAlert) dom.audioFallbackAlert.classList.add('hidden');
  console.log(`¡Micrófono activado con ${motorAudio}! Calibrando durante 2 segundos...`);
}

/**
 * Carga p5.sound solo después de una acción del usuario. Esto evita que la
 * creación temprana del AudioContext deje el sketch detenido en "Loading...".
 */
function cargarP5Sound() {
  if (typeof p5 !== 'undefined' && typeof p5.AudioIn !== 'undefined') {
    return Promise.resolve(true);
  }

  if (promesaCargaP5Sound) return promesaCargaP5Sound;

  promesaCargaP5Sound = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'vendor/p5.sound.min.js';
    script.async = true;
    script.onload = () => resolve(typeof p5 !== 'undefined' && typeof p5.AudioIn !== 'undefined');
    script.onerror = () => resolve(false);
    document.head.appendChild(script);

    setTimeout(() => resolve(false), 6000);
  });

  return promesaCargaP5Sound;
}

/**
 * Maneja situaciones en las que el micrófono no está disponible o es rechazado.
 */
function manejarErrorMicrofono(error) {
  console.warn("Micrófono no activo (se puede interactuar por clics):", error);
  micIniciado = false;
  micDisponible = false;
  estadoApp = 'JUGANDO';

  if (dom.micStatusDot) {
    dom.micStatusDot.className = 'status-dot disabled';
  }
  if (dom.micStatusText) {
    dom.micStatusText.innerText = 'MICRÓFONO DESACTIVADO';
  }
  if (dom.audioNote) {
    dom.audioNote.innerText = 'Modo Clics';
  }
  if (dom.audioFallbackAlert) {
    dom.audioFallbackAlert.classList.remove('hidden');
    dom.audioFallbackAlert.style.display = 'flex';
  }
}

/**
 * Calibra el ruido ambiental durante ~2 segundos (120 frames a 60 fps).
 */
function procesarCalibracion() {
  if (!micDisponible) {
    framesCalibrados++;
    if (framesCalibrados >= 60) {
      estadoApp = 'JUGANDO';
    }
    return;
  }

  const nivel = mic ? mic.getLevel() : 0.0;

  muestrasRuido.push(nivel);
  framesCalibrados++;

  const porcentaje = Math.floor((framesCalibrados / FRAMES_CALIBRACION) * 100);
  if (dom.micStatusText) {
    dom.micStatusText.innerText = `CALIBRANDO... ${porcentaje}%`;
  }
  if (dom.audioNote) {
    dom.audioNote.innerText = `Mantén silencio (${framesCalibrados}/${FRAMES_CALIBRACION})`;
  }

  if (framesCalibrados >= FRAMES_CALIBRACION) {
    let suma = muestrasRuido.reduce((a, b) => a + b, 0);
    let promedio = suma / max(1, muestrasRuido.length);
    umbralRuido = max(0.012, promedio * 1.35 + 0.008);
    
    estadoApp = 'JUGANDO';
    
    if (dom.micStatusDot) {
      dom.micStatusDot.className = 'status-dot active';
    }
    if (dom.micStatusText) {
      dom.micStatusText.innerText = 'MICRÓFONO ACTIVO';
    }
    if (dom.audioNote) {
      dom.audioNote.innerText = `Umbral: ${umbralRuido.toFixed(3)}`;
    }
    if (dom.hudAudioThreshold) {
      dom.hudAudioThreshold.style.left = `${min(100, umbralRuido * 250)}%`;
    }
    console.log(`Calibración completada. Umbral de ruido base: ${umbralRuido.toFixed(4)}`);
  }
}

// ============================================================================
// 4. BUCLE PRINCIPAL DE DIBUJO Y ACTUALIZACIÓN (draw)
// ============================================================================

function draw() {
  // 1. Procesamiento de audio y cálculo de ira
  if (estadoApp === 'CALIBRANDO') {
    procesarCalibracion();
  }
  
  if (estadoApp === 'JUGANDO' || estadoApp === 'CALIBRANDO') {
    actualizarAudioEira();
  }

  // 2. Aplicar efecto de vibración / cámara shake
  push();
  aplicarTemblorCamara();

  // 3. Dibujar escenario del laboratorio
  dibujarEscenario();

  // 4. Dibujar y transformar al personaje generativo
  dibujarPersonaje();

  // 5. Actualizar y renderizar sistema de partículas
  if (gestorParticulas) {
    gestorParticulas.actualizarYRenderizar();
  }

  // 6. Dibujar la mesa en primer plano y actualizar los objetos lanzables
  if (gestorObjetos) {
    gestorObjetos.actualizarYDibujar();
  }

  pop();

  // 7. Mensajes de impacto por encima de la escena
  dibujarMensajeImpacto();

  // 8. Efectos de destrucción final
  if (estadoApp === 'DESTRUCCION' || estadoApp === 'DESTRUIDO') {
    procesarDestruccionFinal();
  }

  // 9. Efecto de destello blanco gamma
  if (destelloAlpha > 0) {
    noStroke();
    fill(240, 255, 240, destelloAlpha);
    rect(0, 0, width, height);
    destelloAlpha = max(0, destelloAlpha - 20);
  }

  // 10. Actualizar indicadores del HUD
  actualizarHUD();
}

// ============================================================================
// 5. LECTURA DE AUDIO Y MATEMÁTICA DE LA IRA (Requisitos 7, 8, 9, 11, 12)
// ============================================================================

function actualizarAudioEira() {
  if (micDisponible && micIniciado) {
    volumenActual = mic ? mic.getLevel() : 0.0;

    volumenSuavizado = lerp(volumenSuavizado, volumenActual, 0.15);

    if (volumenSuavizado > umbralRuido) {
      let exceso = volumenSuavizado - umbralRuido;
      let incremento = exceso * FACTOR_SENSIBILIDAD;
      incremento = min(incremento, 2.0);
      ira += incremento;
    } else {
      ira = max(0.0, ira - TASA_DECAIMIENTO);
    }
  } else {
    ira = max(0.0, ira - (TASA_DECAIMIENTO * 0.7));
  }

  ira = constrain(ira, 0.0, 100.0);

  if (gestorParticulas) {
    gestorParticulas.generarSegunIra(ira);
  }

  verificarIraMaxima();
}

/**
 * Comprueba el límite de ira inmediatamente después de cualquier interacción.
 * Así el modo sin micrófono no reduce la ira antes de iniciar el golpe final.
 */
function verificarIraMaxima() {
  if (ira >= 100.0 && !golpeEjecutado && estadoApp !== 'DESTRUCCION' && estadoApp !== 'DESTRUIDO') {
    ira = 100.0;
    iniciarSecuenciaDestruccion();
  }
}

// ============================================================================
// 6. DIBUJO DEL ESCENARIO PROCEDURAL (Laboratorio Nocturno Sci-Fi)
// ============================================================================

function dibujarEscenario() {
  background(6, 9, 14);

  stroke(18, 30, 42, 100);
  strokeWeight(1);
  let sueloY = height * 0.72;
  
  for (let y = sueloY; y < height; y += (y - sueloY) * 0.25 + 14) {
    line(0, y, width, y);
  }
  for (let x = -width * 0.5; x <= width * 1.5; x += width * 0.08) {
    line(width * 0.5, sueloY - 40, x, height);
  }

  noStroke();
  fill(10, 15, 22);
  rect(0, 0, width, sueloY);

  dibujarMonitoresFondo(sueloY);
  dibujarQuimicosFondo(sueloY);
  dibujarLuzCenital();
  dibujarPlataformaBiomedica(sueloY);
}

function dibujarMonitoresFondo(sueloY) {
  let monitorX = width * 0.15;
  let monitorY = height * 0.28;
  let monitorW = min(width * 0.22, 220);
  let monitorH = monitorW * 0.65;

  fill(12, 20, 28);
  stroke(30, 60, 80);
  strokeWeight(2);
  rect(monitorX - monitorW * 0.5, monitorY - monitorH * 0.5, monitorW, monitorH, 6);

  noFill();
  stroke(ira > 50 ? color(255, 60, 60) : color(57, 255, 20), 200);
  strokeWeight(1.5);
  beginShape();
  let velocidadECG = frameCount * (0.05 + (ira / 100.0) * 0.15);
  for (let x = 0; x < monitorW - 10; x += 3) {
    let px = (monitorX - monitorW * 0.5 + 5) + x;
    let t = (x * 0.08) - velocidadECG;
    let pulso = sin(t) * 3;
    if (sin(t * 1.5) > 0.85) {
      pulso += sin(t * 10) * (10 + ira * 0.15);
    }
    let py = monitorY + pulso;
    vertex(px, py);
  }
  endShape();

  let mon2X = width * 0.85;
  let mon2Y = height * 0.28;
  let mon2W = monitorW;
  let mon2H = monitorH;

  fill(12, 20, 28);
  stroke(30, 60, 80);
  strokeWeight(2);
  rect(mon2X - mon2W * 0.5, mon2Y - mon2H * 0.5, mon2W, mon2H, 6);

  noStroke();
  for (let i = 0; i < 8; i++) {
    let bx = mon2X - mon2W * 0.45 + i * (mon2W * 0.11);
    let ruidoBarra = noise(frameCount * 0.05 + i * 10);
    let alturaBarra = (mon2H * 0.2) + (ruidoBarra * mon2H * 0.5) * (0.4 + (ira / 100.0) * 0.8);
    let colBarra = lerpColor(color(56, 189, 248), color(57, 255, 20), ira / 100);
    if (ira > 75) colBarra = lerpColor(color(57, 255, 20), color(239, 68, 68), (ira - 75) / 25);
    fill(colBarra);
    rect(bx, mon2Y + mon2H * 0.35 - alturaBarra, mon2W * 0.08, alturaBarra, 2);
  }
}

function dibujarQuimicosFondo(sueloY) {
  let posX = width * 0.28;
  let posY = sueloY - 40;

  stroke(40, 55, 70);
  strokeWeight(2);
  line(posX - 30, posY, posX + 30, posY);
  line(posX - 25, posY, posX - 25, posY + 35);
  line(posX + 25, posY, posX + 25, posY + 35);

  noStroke();
  fill(57, 255, 20, 180 + sin(frameCount * 0.05) * 40);
  rect(posX - 18, posY - 25, 10, 25, 0, 0, 5, 5);
  stroke(100, 200, 255, 120);
  noFill();
  rect(posX - 18, posY - 30, 10, 30, 0, 0, 5, 5);

  fill(56, 189, 248, 160);
  noStroke();
  triangle(posX + 5, posY, posX + 25, posY, posX + 15, posY - 20);
  rect(posX + 12, posY - 30, 6, 12);
}

function dibujarLuzCenital() {
  let centroX = width * 0.5;
  let t = ira / 100.0;
  
  let colLuz = lerpColor(color(180, 220, 255, 22), color(57, 255, 20, 45 + sin(frameCount * 0.1) * 15), t);
  
  noStroke();
  fill(colLuz);
  beginShape();
  vertex(centroX - 40, 0);
  vertex(centroX + 40, 0);
  vertex(centroX + width * 0.28 + (t * 60), height * 0.78);
  vertex(centroX - width * 0.28 - (t * 60), height * 0.78);
  endShape(CLOSE);

  fill(30, 42, 56);
  stroke(60, 80, 100);
  strokeWeight(2);
  ellipse(centroX, 10, 120, 25);
  fill(220, 240, 255, 200);
  noStroke();
  ellipse(centroX, 15, 80, 12);
}

function dibujarPlataformaBiomedica(sueloY) {
  let centroX = width * 0.5;
  let baseW = min(width * 0.6, 550);
  let baseH = 50;
  let baseY = height * 0.65;

  fill(20, 28, 38);
  stroke(45, 65, 85);
  strokeWeight(2);
  rect(centroX - baseW * 0.5, baseY, baseW, baseH, 8);

  fill(35, 48, 62);
  rect(centroX - baseW * 0.35, baseY + baseH, 30, sueloY - (baseY + baseH));
  rect(centroX + baseW * 0.35 - 30, baseY + baseH, 30, sueloY - (baseY + baseH));

  fill(15, 22, 30);
  noStroke();
  rect(centroX - baseW * 0.48, baseY - 12, baseW * 0.96, 16, 6);

  let ledCol = lerpColor(color(56, 189, 248), color(57, 255, 20), ira / 100);
  if (ira > 75) ledCol = lerpColor(color(57, 255, 20), color(239, 68, 68), (ira - 75) / 25);
  stroke(ledCol);
  strokeWeight(2);
  line(centroX - baseW * 0.45, baseY + baseH * 0.5, centroX + baseW * 0.45, baseY + baseH * 0.5);
}

// ============================================================================
// 7. RENDERIZADO Y METAMORFOSIS PROCEDURAL DEL PERSONAJE
// (Requisitos: 0-24 Dormido, 25-49 Molesto, 50-74 Transformación, 75-99 Hulk, 100 Golpe)
// ============================================================================

function dibujarPersonaje() {
  push();
  
  let centroX = width * 0.5;
  let centroY = height * 0.52;
  let t = ira / 100.0;

  // 1. Respiración senoidal
  let frecRespiracion = 0.035 + (t * 0.12);
  let ampRespiracion = 5.0 + (t * 14.0);
  let respiracion = sin(frameCount * frecRespiracion) * ampRespiracion;

  // 2. Micro-temblor muscular
  let temblorX = 0;
  let temblorY = 0;
  if (ira > 20) {
    let escalaTemblor = (t * 6.5);
    temblorX = (noise(frameCount * 0.35, 10) - 0.5) * escalaTemblor;
    temblorY = (noise(frameCount * 0.35, 90) - 0.5) * escalaTemblor;
  }

  translate(centroX + temblorX, centroY + temblorY + respiracion);

  // Escala muscular
  let escalaMuscular = 1.0 + (t * 0.65);
  scale(escalaMuscular);

  // 3. Interpolación generativa de color de piel
  let pielHumana = color(230, 190, 170);
  let pielSombraHumana = color(195, 150, 130);
  let pielHulk = color(40, 175, 45);
  let pielSombraHulk = color(18, 95, 25);

  let colPielBase = lerpColor(pielHumana, pielHulk, t);
  let colPielSombra = lerpColor(pielSombraHumana, pielSombraHulk, t);

  // 4. Sombra en la camilla
  noStroke();
  fill(0, 0, 0, 120 + t * 60);
  ellipse(0, 85, 220 + t * 90, 45 + t * 20);

  // 5. Aura / Resplandor Gamma en ira alta
  if (ira > 35) {
    let auraAlpha = (t - 0.35) * 140 + sin(frameCount * 0.1) * 25;
    fill(57, 255, 20, max(0, auraAlpha));
    ellipse(0, -10, 180 + t * 80, 190 + t * 90);
  }

  // 6. Torso y Músculos
  dibujarTorsoYMusculos(colPielBase, colPielSombra, t);

  // 7. Ropa
  dibujarRopa(t);

  // 8. Brazos
  dibujarBrazos(colPielBase, colPielSombra, t);

  // 9. Cabeza y Rostro
  dibujarCabezaYFacial(colPielBase, colPielSombra, t);

  // 10. Venas gamma pulsantes
  if (ira > 45) {
    dibujarVenasGamma(t);
  }

  pop();
}

function dibujarTorsoYMusculos(colBase, colSombra, t) {
  let torsoW = 100 + (t * 75);
  let torsoH = 95 + (t * 40);

  fill(colBase);
  stroke(colSombra);
  strokeWeight(2 + t * 1.5);
  
  beginShape();
  vertex(-torsoW * 0.5, -torsoH * 0.4);
  bezierVertex(-torsoW * 0.65, 0, -torsoW * 0.45, torsoH * 0.6, 0, torsoH * 0.65);
  bezierVertex(torsoW * 0.45, torsoH * 0.6, torsoW * 0.65, 0, torsoW * 0.5, -torsoH * 0.4);
  endShape(CLOSE);

  noFill();
  stroke(colSombra);
  strokeWeight(2 + t * 2);
  
  arc(-torsoW * 0.22, -torsoH * 0.05, torsoW * 0.35, torsoH * 0.35, 0, PI * 0.85);
  arc(torsoW * 0.22, -torsoH * 0.05, torsoW * 0.35, torsoH * 0.35, PI * 0.15, PI);
  line(0, -torsoH * 0.25, 0, torsoH * 0.45);

  if (t > 0.4) {
    let alphaAbs = (t - 0.4) * 400;
    stroke(red(colSombra), green(colSombra), blue(colSombra), alphaAbs);
    strokeWeight(2);
    line(-torsoW * 0.18, torsoH * 0.15, torsoW * 0.18, torsoH * 0.15);
    line(-torsoW * 0.16, torsoH * 0.32, torsoW * 0.16, torsoH * 0.32);
  }
}

function dibujarRopa(t) {
  let torsoW = 100 + (t * 75);
  let torsoH = 95 + (t * 40);

  if (t < 0.85) {
    let colCamisa = color(100, 45, 125);
    fill(colCamisa);
    stroke(60, 20, 80);
    strokeWeight(1.5);
    
    if (t > 0.45) {
      let apertura = (t - 0.45) * torsoW * 0.6;
      beginShape();
      vertex(-torsoW * 0.45, -torsoH * 0.3);
      vertex(-apertura * 0.5, 0);
      vertex(-apertura * 0.8, torsoH * 0.3);
      vertex(-torsoW * 0.35, torsoH * 0.55);
      vertex(torsoW * 0.35, torsoH * 0.55);
      vertex(apertura * 0.8, torsoH * 0.3);
      vertex(apertura * 0.5, 0);
      vertex(torsoW * 0.45, -torsoH * 0.3);
      endShape(CLOSE);
    } else {
      quad(-torsoW * 0.45, -torsoH * 0.3, torsoW * 0.45, -torsoH * 0.3, torsoW * 0.35, torsoH * 0.55, -torsoW * 0.35, torsoH * 0.55);
    }

    let colBata = color(225, 230, 240);
    let sombraBata = color(170, 180, 195);
    fill(colBata);
    stroke(sombraBata);
    strokeWeight(2);

    beginShape();
    vertex(-torsoW * 0.55, -torsoH * 0.35);
    vertex(-torsoW * 0.25, -torsoH * 0.1);
    vertex(-torsoW * 0.3 - (t * 15), torsoH * 0.5);
    vertex(-torsoW * 0.58, torsoH * 0.45);
    endShape(CLOSE);

    beginShape();
    vertex(torsoW * 0.55, -torsoH * 0.35);
    vertex(torsoW * 0.25, -torsoH * 0.1);
    vertex(torsoW * 0.3 + (t * 15), torsoH * 0.5);
    vertex(torsoW * 0.58, torsoH * 0.45);
    endShape(CLOSE);
  } else {
    fill(90, 35, 115);
    stroke(50, 15, 70);
    strokeWeight(2);
    beginShape();
    vertex(-torsoW * 0.45, torsoH * 0.4);
    vertex(-torsoW * 0.2, torsoH * 0.6);
    vertex(0, torsoH * 0.45);
    vertex(torsoW * 0.25, torsoH * 0.62);
    vertex(torsoW * 0.48, torsoH * 0.42);
    vertex(torsoW * 0.4, torsoH * 0.35);
    vertex(-torsoW * 0.4, torsoH * 0.35);
    endShape(CLOSE);
  }
}

function dibujarBrazos(colBase, colSombra, t) {
  let torsoW = 100 + (t * 75);
  let radioHombro = 28 + (t * 32);

  fill(colBase);
  stroke(colSombra);
  strokeWeight(2 + t * 1.5);

  ellipse(-torsoW * 0.52, -15, radioHombro * 2, radioHombro * 1.6);
  ellipse(torsoW * 0.52, -15, radioHombro * 2, radioHombro * 1.6);

  let brazoAncho = 22 + (t * 26);
  rect(-torsoW * 0.68, -10, brazoAncho, 65 + t * 25, 10);
  ellipse(-torsoW * 0.68 + brazoAncho * 0.5, 60 + t * 25, brazoAncho * 1.2, brazoAncho * 1.1);

  rect(torsoW * 0.68 - brazoAncho, -10, brazoAncho, 65 + t * 25, 10);
  ellipse(torsoW * 0.68 - brazoAncho * 0.5, 60 + t * 25, brazoAncho * 1.2, brazoAncho * 1.1);
}

function dibujarCabezaYFacial(colBase, colSombra, t) {
  let cabezaY = -75 - (t * 15);
  let cabezaW = 54 + (t * 32);
  let cabezaH = 68 + (t * 26);

  let cuelloW = 40 + (t * 55);
  fill(colBase);
  stroke(colSombra);
  strokeWeight(2 + t * 1.5);
  quad(-cuelloW * 0.5, -45, cuelloW * 0.5, -45, cuelloW * 0.42, cabezaY + 20, -cuelloW * 0.42, cabezaY + 20);

  // Forma del cráneo y mandíbula (cerrando correctamente las figuras)
  if (t < 0.4) {
    fill(colBase);
    stroke(colSombra);
    strokeWeight(2 + t * 1.5);
    ellipse(0, cabezaY, cabezaW, cabezaH);
  } else {
    fill(colBase);
    stroke(colSombra);
    strokeWeight(2 + t * 1.5);
    beginShape();
    vertex(-cabezaW * 0.48, cabezaY - cabezaH * 0.4);
    vertex(cabezaW * 0.48, cabezaY - cabezaH * 0.4);
    vertex(cabezaW * 0.55, cabezaY + cabezaH * 0.1);
    vertex(cabezaW * 0.42, cabezaY + cabezaH * 0.48);
    vertex(-cabezaW * 0.42, cabezaY + cabezaH * 0.48);
    vertex(-cabezaW * 0.55, cabezaY + cabezaH * 0.1);
    endShape(CLOSE);
  }

  fill(colBase);
  stroke(colSombra);
  ellipse(-cabezaW * 0.52, cabezaY + 2, 10 + t * 5, 16 + t * 6);
  ellipse(cabezaW * 0.52, cabezaY + 2, 10 + t * 5, 16 + t * 6);

  dibujarCabello(cabezaY, cabezaW, cabezaH, t);

  let ojoDistX = 14 + (t * 9);
  let ojoY = cabezaY - 2 + (t * 4);

  if (ira < 25) {
    // 0-24: DORMIDO
    stroke(50, 40, 40);
    strokeWeight(2.2);
    noFill();
    arc(-ojoDistX, ojoY, 12, 8, 0.1, PI - 0.1);
    arc(ojoDistX, ojoY, 12, 8, 0.1, PI - 0.1);

    stroke(45, 30, 25);
    line(-ojoDistX - 7, ojoY - 7, -ojoDistX + 7, ojoY - 7);
    line(ojoDistX - 7, ojoY - 7, ojoDistX + 7, ojoY - 7);

    stroke(colSombra);
    strokeWeight(1.8);
    line(0, ojoY - 2, 0, ojoY + 12);
    arc(0, ojoY + 12, 8, 5, 0, PI);

    stroke(160, 90, 90);
    strokeWeight(2);
    line(-7, cabezaY + 22, 7, cabezaY + 22);

  } else if (ira < 50) {
    // 25-49: DESPERTANDO Y MOLESTO
    fill(255);
    stroke(40, 30, 30);
    strokeWeight(1.5);
    ellipse(-ojoDistX, ojoY, 13, 6);
    ellipse(ojoDistX, ojoY, 13, 6);

    fill(60, 35, 20);
    noStroke();
    ellipse(-ojoDistX, ojoY, 5, 5);
    ellipse(ojoDistX, ojoY, 5, 5);

    stroke(35, 20, 15);
    strokeWeight(2.8);
    line(-ojoDistX - 8, ojoY - 9, -ojoDistX + 6, ojoY - 5);
    line(ojoDistX + 8, ojoY - 9, ojoDistX - 6, ojoY - 5);

    stroke(colSombra);
    strokeWeight(2);
    line(0, ojoY, 0, ojoY + 12);

    stroke(140, 70, 70);
    strokeWeight(2.2);
    line(-9, cabezaY + 23, 9, cabezaY + 21);

  } else if (ira < 75) {
    // 50-74: TRANSFORMACIÓN ACTIVA
    fill(57, 255, 20);
    stroke(20, 100, 20);
    strokeWeight(1.5);
    ellipse(-ojoDistX, ojoY, 15, 9);
    ellipse(ojoDistX, ojoY, 15, 9);

    fill(255);
    noStroke();
    ellipse(-ojoDistX, ojoY, 4, 4);
    ellipse(ojoDistX, ojoY, 4, 4);

    stroke(15, 70, 18);
    strokeWeight(4);
    line(-ojoDistX - 9, ojoY - 11, -ojoDistX + 6, ojoY - 4);
    line(ojoDistX + 9, ojoY - 11, ojoDistX - 6, ojoY - 4);

    fill(20, 30, 20);
    stroke(15, 70, 18);
    strokeWeight(2);
    rect(-13, cabezaY + 18, 26, 10, 3);
    fill(240, 245, 230);
    noStroke();
    rect(-10, cabezaY + 19, 20, 4);
    rect(-10, cabezaY + 23, 20, 4);

  } else {
    // 75-100: HULK TOTAL
    let brilloOjo = 200 + sin(frameCount * 0.3) * 55;
    fill(57, brilloOjo, 20);
    stroke(10, 60, 10);
    strokeWeight(2);
    ellipse(-ojoDistX, ojoY, 18, 12);
    ellipse(ojoDistX, ojoY, 18, 12);

    fill(220, 255, 200);
    noStroke();
    ellipse(-ojoDistX, ojoY, 7, 7);
    ellipse(ojoDistX, ojoY, 7, 7);

    stroke(10, 45, 12);
    strokeWeight(5.5);
    line(-ojoDistX - 11, ojoY - 13, -ojoDistX + 7, ojoY - 4);
    line(ojoDistX + 11, ojoY - 13, ojoDistX - 7, ojoY - 4);

    fill(10, 15, 10);
    stroke(10, 50, 15);
    strokeWeight(2.5);
    beginShape();
    vertex(-17, cabezaY + 16);
    vertex(17, cabezaY + 16);
    vertex(15, cabezaY + 34);
    vertex(-15, cabezaY + 34);
    endShape(CLOSE);

    fill(245, 250, 235);
    noStroke();
    triangle(-14, cabezaY + 16, -10, cabezaY + 16, -12, cabezaY + 22);
    triangle(-8, cabezaY + 16, -4, cabezaY + 16, -6, cabezaY + 21);
    triangle(4, cabezaY + 16, 8, cabezaY + 16, 6, cabezaY + 21);
    triangle(10, cabezaY + 16, 14, cabezaY + 16, 12, cabezaY + 22);
    triangle(-12, cabezaY + 34, -8, cabezaY + 34, -10, cabezaY + 28);
    triangle(8, cabezaY + 34, 12, cabezaY + 34, 10, cabezaY + 28);
  }
}

function dibujarCabello(cabezaY, cabezaW, cabezaH, t) {
  fill(30, 22, 18);
  if (t > 0.6) {
    fill(15, 30, 18);
  }
  noStroke();

  let topeY = cabezaY - cabezaH * 0.45;

  beginShape();
  vertex(-cabezaW * 0.48, cabezaY - 10);
  vertex(-cabezaW * 0.52, topeY + 5);
  let numPuntas = 7;
  for (let i = 0; i <= numPuntas; i++) {
    let px = map(i, 0, numPuntas, -cabezaW * 0.45, cabezaW * 0.45);
    let altPunta = (t * 16) * noise(i * 5, frameCount * 0.05);
    vertex(px, topeY - 6 - altPunta);
  }
  vertex(cabezaW * 0.52, topeY + 5);
  vertex(cabezaW * 0.48, cabezaY - 10);
  vertex(cabezaW * 0.35, cabezaY - 15);
  vertex(0, topeY + 10);
  vertex(-cabezaW * 0.35, cabezaY - 15);
  endShape(CLOSE);
}

function dibujarVenasGamma(t) {
  let pulsoVena = sin(frameCount * 0.25) * 0.5 + 0.5;
  stroke(80, 255, 90, (t * 180 + pulsoVena * 75));
  strokeWeight(1.8);
  noFill();

  beginShape();
  vertex(-28 * (1 + t * 0.5), -85);
  vertex(-34 * (1 + t * 0.5), -92);
  vertex(-31 * (1 + t * 0.5), -100);
  endShape();

  beginShape();
  vertex(28 * (1 + t * 0.5), -85);
  vertex(34 * (1 + t * 0.5), -92);
  vertex(31 * (1 + t * 0.5), -100);
  endShape();

  strokeWeight(2.4);
  line(-35, -35, -48, -15);
  line(35, -35, 48, -15);
}

function aplicarTemblorCamara() {
  if (ira > 15) {
    let intensidad = map(ira, 15, 100, 0, 14);
    if (estadoApp === 'DESTRUCCION') intensidad = 26;
    let sx = (noise(frameCount * 0.85, 0) - 0.5) * intensidad;
    let sy = (noise(frameCount * 0.85, 50) - 0.5) * intensidad;
    translate(sx, sy);
  }
}

// ============================================================================
// 8. SISTEMA AVANZADO DE PARTÍCULAS (POO y Física Generativa)
// ============================================================================

class Particula {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.gravedad = 0.0;
    this.tam = 4;
    this.col = color(255);
    this.alpha = 255;
    this.vidaMax = 100;
    this.vida = this.vidaMax;
    this.rotacion = random(TWO_PI);
    this.velRotacion = random(-0.05, 0.05);
    this.muerta = false;
  }

  aplicarFuerza(fuerza) {
    this.acc.add(fuerza);
  }

  actualizar() {
    this.vel.y += this.gravedad;
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.acc.mult(0);
    this.rotacion += this.velRotacion;

    this.vida--;
    if (this.vida <= 0 || this.pos.y > height + 100 || this.pos.x < -100 || this.pos.x > width + 100) {
      this.muerta = true;
    }
  }

  dibujar() {}

  estaMuerta() {
    return this.muerta;
  }
}

class ParticulaPolvo extends Particula {
  constructor(x, y) {
    super(x, y);
    this.vel = createVector(random(-0.3, 0.3), random(-0.2, -0.6));
    this.tam = random(1.5, 3.5);
    this.col = color(200, 230, 255);
    this.vidaMax = floor(random(120, 240));
    this.vida = this.vidaMax;
  }

  actualizar() {
    let angulo = noise(this.pos.x * 0.005, this.pos.y * 0.005, frameCount * 0.01) * TWO_PI * 2;
    this.pos.x += cos(angulo) * 0.4;
    this.pos.y += sin(angulo) * 0.4 + this.vel.y;
    this.vida--;
    if (this.vida <= 0) this.muerta = true;
  }

  dibujar() {
    let fade = sin((this.vida / this.vidaMax) * PI);
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), fade * 90);
    ellipse(this.pos.x, this.pos.y, this.tam, this.tam);
  }
}

class ParticulaZzz extends Particula {
  constructor(x, y) {
    super(x, y);
    this.vel = createVector(random(0.4, 0.9), random(-0.8, -1.4));
    this.tam = random(16, 26);
    this.vidaMax = 130;
    this.vida = this.vidaMax;
    this.desfase = random(100);
  }

  actualizar() {
    this.pos.y += this.vel.y;
    this.pos.x += this.vel.x + sin((frameCount + this.desfase) * 0.05) * 0.8;
    this.vida--;
    if (this.vida <= 0) this.muerta = true;
  }

  dibujar() {
    let fade = sin((this.vida / this.vidaMax) * PI);
    push();
    textFont('Orbitron');
    textSize(this.tam);
    textAlign(CENTER, CENTER);
    noStroke();
    fill(140, 200, 255, fade * 200);
    text('Z', this.pos.x, this.pos.y);
    pop();
  }
}

class ParticulaHumoGamma extends Particula {
  constructor(x, y) {
    super(x, y);
    this.vel = createVector(random(-1.2, 1.2), random(-1.5, -3.2));
    this.tam = random(18, 40);
    this.tamFinal = this.tam * random(2.2, 3.8);
    this.vidaMax = floor(random(50, 90));
    this.vida = this.vidaMax;
    this.col = color(57, 255, 20);
  }

  actualizar() {
    this.pos.add(this.vel);
    this.vel.mult(0.97);
    this.tam = lerp(this.tam, this.tamFinal, 0.03);
    this.vida--;
    if (this.vida <= 0) this.muerta = true;
  }

  dibujar() {
    let fade = sin((this.vida / this.vidaMax) * PI);
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), fade * 65);
    ellipse(this.pos.x, this.pos.y, this.tam, this.tam);
  }
}

class ParticulaChispa extends Particula {
  constructor(x, y) {
    super(x, y);
    let ang = random(TWO_PI);
    let rap = random(3, 8);
    this.vel = createVector(cos(ang) * rap, sin(ang) * rap);
    this.tam = random(2, 4);
    this.vidaMax = floor(random(15, 35));
    this.vida = this.vidaMax;
    this.col = random() > 0.5 ? color(57, 255, 20) : color(255, 240, 100);
  }

  actualizar() {
    this.pos.add(this.vel);
    this.vel.mult(0.94);
    this.vida--;
    if (this.vida <= 0) this.muerta = true;
  }

  dibujar() {
    let fade = (this.vida / this.vidaMax);
    stroke(this.col);
    strokeWeight(this.tam * fade);
    line(this.pos.x, this.pos.y, this.pos.x - this.vel.x * 2.5, this.pos.y - this.vel.y * 2.5);
  }
}

class ParticulaRopa extends Particula {
  constructor(x, y) {
    super(x, y);
    this.vel = createVector(random(-4, 4), random(-3, -7));
    this.gravedad = 0.22;
    this.tamW = random(8, 18);
    this.tamH = random(6, 14);
    this.col = random() > 0.4 ? color(220, 225, 235) : color(100, 45, 125);
    this.vidaMax = floor(random(70, 120));
    this.vida = this.vidaMax;
  }

  dibujar() {
    let fade = constrain(this.vida / 30, 0, 1);
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.rotacion);
    fill(red(this.col), green(this.col), blue(this.col), fade * 255);
    noStroke();
    beginShape();
    vertex(-this.tamW * 0.5, -this.tamH * 0.5);
    vertex(this.tamW * 0.5, -this.tamH * 0.3);
    vertex(this.tamW * 0.3, this.tamH * 0.5);
    vertex(-this.tamW * 0.4, this.tamH * 0.4);
    endShape(CLOSE);
    pop();
  }
}

class ParticulaVidrio extends Particula {
  constructor(x, y, angulo) {
    super(x, y);
    let rapidez = random(8, 26);
    let dispersion = angulo + random(-0.4, 0.4);
    this.vel = createVector(cos(dispersion) * rapidez, sin(dispersion) * rapidez);
    this.gravedad = 0.38;
    this.tam = random(6, 24);
    this.vidaMax = floor(random(140, 220));
    this.vida = this.vidaMax;
    this.col = color(200, 240, 255);
    this.puntos = [
      createVector(random(-this.tam, 0), random(-this.tam, 0)),
      createVector(random(0, this.tam), random(-this.tam * 0.5, this.tam * 0.5)),
      createVector(random(-this.tam * 0.5, this.tam * 0.5), random(0, this.tam))
    ];
  }

  dibujar() {
    let fade = constrain(this.vida / 40, 0, 1);
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.rotacion);
    
    fill(210, 245, 255, fade * 110);
    stroke(255, 255, 255, fade * 230);
    strokeWeight(1.2);
    
    beginShape();
    for (let pt of this.puntos) {
      vertex(pt.x, pt.y);
    }
    endShape(CLOSE);

    stroke(255, 255, 255, fade * 255);
    strokeWeight(1.8);
    line(this.puntos[0].x, this.puntos[0].y, this.puntos[1].x, this.puntos[1].y);
    pop();
  }
}

class GestorParticulas {
  constructor() {
    this.particulas = [];
    this.polvo = [];
    for (let i = 0; i < 40; i++) {
      this.polvo.push(new ParticulaPolvo(random(width * 0.25, width * 0.75), random(height)));
    }
  }

  reiniciar() {
    this.particulas = [];
  }

  generarSegunIra(nivelIra) {
    let centroX = width * 0.5;
    let centroY = height * 0.48;

    // 1. Letras "Zzz" en estado dormido (0-24)
    if (nivelIra < 25 && frameCount % 45 === 0) {
      this.particulas.push(new ParticulaZzz(centroX + random(10, 30), centroY - 80));
    }

    // 2. Humo Gamma a partir de ira 35
    if (nivelIra > 35) {
      let tasa = map(nivelIra, 35, 100, 4, 1);
      if (frameCount % max(1, floor(tasa)) === 0) {
        let posX = centroX + random(-70, 70) * (nivelIra / 50.0);
        let posY = centroY + random(-30, 40);
        this.particulas.push(new ParticulaHumoGamma(posX, posY));
      }
    }

    // 3. Chispas de energía en ira alta (>60)
    if (nivelIra > 60) {
      if (random() > 0.4) {
        this.particulas.push(new ParticulaChispa(centroX + random(-90, 90), centroY + random(-60, 40)));
      }
    }

    // 4. Jirones de ropa desprendiéndose (50-80)
    if (nivelIra > 50 && nivelIra < 80 && random() > 0.82) {
      this.particulas.push(new ParticulaRopa(centroX + random(-50, 50), centroY + random(-20, 30)));
    }
  }

  agregarVidrio(x, y, angulo) {
    this.particulas.push(new ParticulaVidrio(x, y, angulo));
  }

  actualizarYRenderizar() {
    for (let p of this.polvo) {
      p.actualizar();
      p.dibujar();
      if (p.estaMuerta()) {
        p.pos.set(random(width * 0.25, width * 0.75), height + 10);
        p.vida = p.vidaMax;
        p.muerta = false;
      }
    }

    for (let i = this.particulas.length - 1; i >= 0; i--) {
      let p = this.particulas[i];
      p.actualizar();
      p.dibujar();
      if (p.estaMuerta()) {
        this.particulas.splice(i, 1);
      }
    }
  }
}

// ============================================================================
// 9. MESA INTERACTIVA Y OBJETOS LANZABLES
// ============================================================================

class ObjetoInteractivo {
  constructor(configuracion) {
    this.tipo = configuracion.tipo;
    this.nombre = configuracion.nombre;
    this.deltaIra = configuracion.deltaIra;
    this.ratioX = configuracion.ratioX;
    this.ancho = configuracion.ancho;
    this.alto = configuracion.alto;
    this.colorBase = configuracion.colorBase;
    this.x = 0;
    this.y = 0;
    this.baseX = 0;
    this.baseY = 0;
    this.velX = 0;
    this.velY = 0;
    this.rotacion = 0;
    this.velRotacion = 0;
    this.sostenido = false;
    this.enMesa = true;
    this.visible = true;
    this.framesEnVuelo = 0;
    this.framesReaparicion = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.reiniciar();
  }

  reiniciar() {
    const mesaY = height * 0.76;
    this.baseX = width * this.ratioX;
    this.baseY = mesaY - this.alto * 0.5 - 12;
    this.x = this.baseX;
    this.y = this.baseY;
    this.velX = 0;
    this.velY = 0;
    this.rotacion = 0;
    this.velRotacion = 0;
    this.sostenido = false;
    this.enMesa = true;
    this.visible = true;
    this.framesEnVuelo = 0;
    this.framesReaparicion = 0;
  }

  contiene(px, py) {
    if (!this.visible) return false;
    const margenX = this.ancho * 0.7 + 8;
    const margenY = this.alto * 0.7 + 8;
    return abs(px - this.x) <= margenX && abs(py - this.y) <= margenY;
  }

  agarrar(px, py) {
    this.sostenido = true;
    this.enMesa = false;
    this.framesEnVuelo = 0;
    this.offsetX = this.x - px;
    this.offsetY = this.y - py;
    this.velX = 0;
    this.velY = 0;
  }

  arrastrar(px, py) {
    if (!this.sostenido) return;
    const destinoX = px + this.offsetX;
    const destinoY = py + this.offsetY;
    this.velX = constrain((destinoX - this.x) * 1.35, -28, 28);
    this.velY = constrain((destinoY - this.y) * 1.35, -28, 28);
    this.x = destinoX;
    this.y = destinoY;
    this.rotacion += this.velX * 0.003;
  }

  soltar() {
    if (!this.sostenido) return;
    this.sostenido = false;
    this.framesEnVuelo = 1;
    this.velX *= 1.2;
    this.velY *= 1.2;
    if (abs(this.velX) + abs(this.velY) < 1.2) {
      this.velY = -2.5;
    }
    this.velRotacion = constrain(this.velX * 0.018, -0.35, 0.35);
  }

  ocultarYReaparecer() {
    this.visible = false;
    this.sostenido = false;
    this.enMesa = false;
    this.framesReaparicion = 105;
    this.velX = 0;
    this.velY = 0;
  }

  actualizar() {
    if (!this.visible) {
      this.framesReaparicion--;
      if (this.framesReaparicion <= 0) this.reiniciar();
      return;
    }

    if (this.sostenido) return;

    if (this.enMesa) {
      this.x = this.baseX;
      this.y = this.baseY + sin(frameCount * 0.035 + this.ratioX * 20) * 1.2;
      return;
    }

    this.x += this.velX;
    this.y += this.velY;
    this.velY += 0.48;
    this.velX *= 0.994;
    this.rotacion += this.velRotacion;
    this.framesEnVuelo++;

    const fueraDeEscena = this.x < -120 || this.x > width + 120 || this.y > height + 120;
    if (fueraDeEscena || this.framesEnVuelo > 260) {
      this.ocultarYReaparecer();
    }
  }

  dibujar() {
    if (!this.visible) return;

    push();
    translate(this.x, this.y);

    if (this.sostenido) {
      noStroke();
      fill(120, 255, 130, 45 + sin(frameCount * 0.2) * 20);
      ellipse(0, 0, this.ancho * 1.7, this.alto * 1.7);
    }

    rotate(this.rotacion);
    this.dibujarForma();
    pop();

    if (this.enMesa || this.sostenido) {
      this.dibujarEtiqueta();
    }
  }

  dibujarForma() {
    switch (this.tipo) {
      case 'despertador':
        this.dibujarDespertador();
        break;
      case 'taza':
        this.dibujarTaza();
        break;
      case 'probeta':
        this.dibujarProbeta();
        break;
      case 'pesa':
        this.dibujarPesa();
        break;
      case 'candies':
        this.dibujarCandies();
        break;
    }
  }

  dibujarDespertador() {
    stroke(90, 12, 18);
    strokeWeight(3);
    fill(...this.colorBase);
    ellipse(0, 2, 42, 38);
    fill(235, 245, 250);
    stroke(60, 70, 80);
    ellipse(0, 2, 29, 29);
    stroke(30, 35, 40);
    strokeWeight(2);
    line(0, 2, 0, -7);
    line(0, 2, 7, 6);
    fill(...this.colorBase);
    stroke(90, 12, 18);
    arc(-13, -17, 19, 12, PI, TWO_PI);
    arc(13, -17, 19, 12, PI, TWO_PI);
    line(-11, 20, -16, 26);
    line(11, 20, 16, 26);
  }

  dibujarTaza() {
    fill(...this.colorBase);
    stroke(40, 80, 110);
    strokeWeight(2.5);
    rect(-18, -18, 32, 38, 5, 5, 9, 9);
    noFill();
    stroke(...this.colorBase);
    strokeWeight(7);
    arc(14, 0, 25, 24, -PI * 0.48, PI * 0.48);
    stroke(240, 250, 255, 150);
    strokeWeight(2);
    line(-12, -13, 8, -13);
    stroke(210, 230, 240, 90);
    line(-8, -24, -5, -31);
    line(3, -24, 6, -32);
  }

  dibujarProbeta() {
    fill(210, 245, 255, 70);
    stroke(150, 230, 255);
    strokeWeight(2);
    rect(-9, -29, 18, 57, 3, 3, 8, 8);
    noStroke();
    fill(...this.colorBase, 220);
    rect(-7, 3, 14, 23, 0, 0, 7, 7);
    fill(160, 255, 120, 190);
    ellipse(0, 3, 14, 5);
    stroke(220, 250, 255, 150);
    strokeWeight(1);
    line(2, -20, 8, -20);
    line(3, -10, 8, -10);
    line(3, 0, 8, 0);
  }

  dibujarPesa() {
    stroke(175, 185, 200);
    strokeWeight(7);
    line(-25, 0, 25, 0);
    fill(...this.colorBase);
    stroke(25, 30, 38);
    strokeWeight(2);
    rect(-31, -17, 13, 34, 3);
    rect(18, -17, 13, 34, 3);
    rect(-38, -13, 8, 26, 3);
    rect(30, -13, 8, 26, 3);
  }

  dibujarCandies() {
    fill(...this.colorBase);
    stroke(12, 85, 35);
    strokeWeight(2.5);
    rect(-27, -31, 54, 62, 8);
    fill(215, 255, 220, 90);
    noStroke();
    rect(-22, -26, 44, 9, 4);
    fill(5, 50, 22);
    textFont('Orbitron');
    textAlign(CENTER, CENTER);
    textSize(7);
    text('WEED', 0, -7);
    textSize(6);
    text('CANDIES', 0, 2);
    fill(255, 120, 190);
    ellipse(-12, 16, 10, 8);
    fill(255, 210, 70);
    ellipse(0, 18, 10, 8);
    fill(120, 210, 255);
    ellipse(12, 15, 10, 8);
    fill(225, 255, 230);
    textSize(8);
    text('☘', 0, -19);
  }

  dibujarEtiqueta() {
    push();
    textFont('Orbitron');
    textAlign(CENTER, CENTER);
    textSize(8);
    const etiquetaY = this.y + this.alto * 0.5 + 13;
    const etiquetaW = max(58, this.nombre.length * 6.2);
    noStroke();
    fill(6, 11, 16, 215);
    rect(this.x - etiquetaW * 0.5, etiquetaY - 8, etiquetaW, 16, 4);
    fill(this.deltaIra < 0 ? color(100, 255, 135) : color(215, 230, 245));
    text(this.nombre, this.x, etiquetaY);
    pop();
  }
}

class GestorObjetos {
  constructor() {
    this.objetoAgarrado = null;
    this.objetos = [
      new ObjetoInteractivo({ tipo: 'despertador', nombre: 'ALARMA', deltaIra: 12, ratioX: 0.20, ancho: 48, alto: 48, colorBase: [225, 55, 65] }),
      new ObjetoInteractivo({ tipo: 'taza', nombre: 'CAFÉ', deltaIra: 8, ratioX: 0.35, ancho: 48, alto: 52, colorBase: [75, 175, 235] }),
      new ObjetoInteractivo({ tipo: 'probeta', nombre: 'GAMMA', deltaIra: 16, ratioX: 0.50, ancho: 34, alto: 65, colorBase: [55, 255, 35] }),
      new ObjetoInteractivo({ tipo: 'pesa', nombre: 'PESA', deltaIra: 20, ratioX: 0.65, ancho: 78, alto: 42, colorBase: [75, 82, 96] }),
      new ObjetoInteractivo({ tipo: 'candies', nombre: 'WEED CANDIES', deltaIra: -24, ratioX: 0.81, ancho: 60, alto: 68, colorBase: [55, 190, 85] })
    ];
  }

  reiniciar() {
    this.objetoAgarrado = null;
    for (const objeto of this.objetos) objeto.reiniciar();
  }

  interaccionHabilitada() {
    return estadoApp === 'JUGANDO' || estadoApp === 'CALIBRANDO';
  }

  intentarAgarrar(px, py) {
    if (!this.interaccionHabilitada()) return false;

    for (let i = this.objetos.length - 1; i >= 0; i--) {
      const objeto = this.objetos[i];
      if (objeto.contiene(px, py)) {
        this.objetoAgarrado = objeto;
        objeto.agarrar(px, py);
        return true;
      }
    }
    return false;
  }

  arrastrar(px, py) {
    if (this.objetoAgarrado) this.objetoAgarrado.arrastrar(px, py);
  }

  soltar() {
    if (!this.objetoAgarrado) return;
    this.objetoAgarrado.soltar();
    this.objetoAgarrado = null;
  }

  objetoGolpeaPersonaje(objeto) {
    if (!objeto.visible || objeto.sostenido || objeto.enMesa || objeto.framesEnVuelo <= 0) return false;

    const centroX = width * 0.5;
    const centroY = height * 0.52;
    const t = ira / 100.0;
    const radioX = 78 + t * 82 + objeto.ancho * 0.25;
    const radioY = 108 + t * 70 + objeto.alto * 0.2;
    const dx = (objeto.x - centroX) / radioX;
    const dy = (objeto.y - centroY) / radioY;
    return dx * dx + dy * dy <= 1;
  }

  resolverImpacto(objeto) {
    const iraAnterior = ira;
    ira = constrain(ira + objeto.deltaIra, 0, 100);

    if (objeto.deltaIra < 0) {
      mostrarMensajeImpacto(`${objeto.nombre}: ${Math.round(ira - iraAnterior)} IRA`, [105, 255, 145]);
      if (gestorParticulas) {
        for (let i = 0; i < 18; i++) {
          gestorParticulas.particulas.push(new ParticulaHumoGamma(objeto.x + random(-18, 18), objeto.y + random(-15, 15)));
        }
      }
    } else {
      mostrarMensajeImpacto(`${objeto.nombre}: +${Math.round(ira - iraAnterior)} IRA`, [255, 110, 90]);
      if (gestorParticulas) {
        for (let i = 0; i < 18; i++) {
          gestorParticulas.particulas.push(new ParticulaChispa(objeto.x, objeto.y));
        }
      }
    }

    objeto.ocultarYReaparecer();
    this.objetoAgarrado = null;
    verificarIraMaxima();
  }

  actualizarYDibujar() {
    dibujarMesaInteractiva();

    for (const objeto of this.objetos) {
      objeto.actualizar();
      if (this.interaccionHabilitada() && this.objetoGolpeaPersonaje(objeto)) {
        this.resolverImpacto(objeto);
      }
      objeto.dibujar();
    }
  }
}

function dibujarMesaInteractiva() {
  const mesaX = width * 0.08;
  const mesaY = height * 0.76;
  const mesaW = width * 0.84;
  const frenteH = min(95, height * 0.12);

  noStroke();
  fill(0, 0, 0, 110);
  ellipse(width * 0.5, mesaY + frenteH, mesaW * 0.9, 45);

  fill(32, 43, 53);
  stroke(78, 104, 122);
  strokeWeight(2.5);
  rect(mesaX, mesaY, mesaW, 24, 8, 8, 2, 2);

  fill(19, 27, 35);
  stroke(45, 65, 80);
  rect(mesaX + 12, mesaY + 23, mesaW - 24, frenteH, 2, 2, 10, 10);

  stroke(57, 255, 20, 120);
  strokeWeight(1.5);
  line(mesaX + 24, mesaY + 40, mesaX + mesaW - 24, mesaY + 40);

  noStroke();
  fill(135, 160, 175);
  textFont('Orbitron');
  textAlign(CENTER, CENTER);
  textSize(constrain(width * 0.009, 8, 12));
  text('AGARRÁ • ARRASTRÁ • SOLTÁ SOBRE BRUCE', width * 0.5, mesaY + 62);
}

function mostrarMensajeImpacto(texto, colorMensaje) {
  mensajeImpacto.texto = texto;
  mensajeImpacto.color = colorMensaje;
  mensajeImpacto.alpha = 255;
}

function dibujarMensajeImpacto() {
  if (mensajeImpacto.alpha <= 0) return;

  push();
  const mensajeY = max(135, height * 0.28);
  textFont('Orbitron');
  textAlign(CENTER, CENTER);
  textSize(constrain(width * 0.015, 14, 22));
  const anchoMensaje = min(width * 0.78, max(280, mensajeImpacto.texto.length * 15));
  fill(5, 10, 14, mensajeImpacto.alpha * 0.78);
  stroke(...mensajeImpacto.color, mensajeImpacto.alpha);
  strokeWeight(1.5);
  rect(width * 0.5 - anchoMensaje * 0.5, mensajeY - 27, anchoMensaje, 54, 8);
  noStroke();
  fill(...mensajeImpacto.color, mensajeImpacto.alpha);
  text(mensajeImpacto.texto, width * 0.5, mensajeY);
  pop();

  mensajeImpacto.alpha = max(0, mensajeImpacto.alpha - 4.5);
}

// ============================================================================
// 10. DESTRUCCIÓN FINAL Y GRIETAS PROCEDURALES (Requisitos: 100 de Ira)
// ============================================================================

function iniciarSecuenciaDestruccion() {
  estadoApp = 'DESTRUCCION';
  frameGolpe = 0;
  puntoImpacto = { x: width * 0.5, y: height * 0.48 };
  console.log("¡IRA MÁXIMA ALCANZADA! Ejecutando puñetazo y rotura de pantalla...");
}

function generarGrietasProcedurales(cx, cy) {
  grietas = [];
  let numRamasPrincipales = floor(random(10, 16));

  for (let i = 0; i < numRamasPrincipales; i++) {
    let anguloBase = (TWO_PI / numRamasPrincipales) * i + random(-0.25, 0.25);
    generarRamaGrieta(cx, cy, anguloBase, 0, random(width * 0.4, width * 0.75), 4.5);
  }

  for (let r = 25; r <= min(width, height) * 0.35; r += random(25, 45)) {
    let numPuntos = floor(r * 0.35);
    let verticesAnillo = [];
    for (let j = 0; j <= numPuntos; j++) {
      let a = (TWO_PI / numPuntos) * j;
      let radioVar = r + random(-8, 8);
      verticesAnillo.push({ x: cx + cos(a) * radioVar, y: cy + sin(a) * radioVar });
    }
    for (let k = 0; k < verticesAnillo.length - 1; k++) {
      grietas.push({
        x1: verticesAnillo[k].x,
        y1: verticesAnillo[k].y,
        x2: verticesAnillo[k + 1].x,
        y2: verticesAnillo[k + 1].y,
        grosor: random(1.2, 2.5),
        opacidad: random(180, 255)
      });
    }
  }
}

function generarRamaGrieta(x, y, angulo, nivel, longitudMax, grosor) {
  let segLength = random(18, 38);
  let currX = x;
  let currY = y;
  let distAcumulada = 0;

  while (distAcumulada < longitudMax) {
    angulo += random(-0.35, 0.35);
    let nextX = currX + cos(angulo) * segLength;
    let nextY = currY + sin(angulo) * segLength;

    grietas.push({
      x1: currX,
      y1: currY,
      x2: nextX,
      y2: nextY,
      grosor: grosor,
      opacidad: map(distAcumulada, 0, longitudMax, 255, 120)
    });

    if (nivel < 2 && random() > 0.65 && distAcumulada > 40) {
      let anguloBifurcacion = angulo + (random() > 0.5 ? 1 : -1) * random(0.4, 0.9);
      generarRamaGrieta(nextX, nextY, anguloBifurcacion, nivel + 1, longitudMax * 0.45, grosor * 0.6);
    }

    currX = nextX;
    currY = nextY;
    distAcumulada += segLength;
    grosor = max(0.8, grosor * 0.92);
  }
}

function procesarDestruccionFinal() {
  frameGolpe++;

  // Fase 1: Puño avanzando hacia la cámara
  if (frameGolpe < 12) {
    let avance = map(frameGolpe, 0, 12, 0, 1);
    let tamPuño = map(avance, 0, 1, 80, min(width, height) * 0.95);
    
    push();
    translate(puntoImpacto.x, puntoImpacto.y);
    fill(35, 175, 40);
    stroke(15, 90, 20);
    strokeWeight(8);
    ellipse(0, 0, tamPuño, tamPuño * 0.9);
    fill(55, 230, 60);
    ellipse(-tamPuño * 0.25, -tamPuño * 0.1, tamPuño * 0.35, tamPuño * 0.35);
    ellipse(0, -tamPuño * 0.15, tamPuño * 0.38, tamPuño * 0.38);
    ellipse(tamPuño * 0.25, -tamPuño * 0.1, tamPuño * 0.35, tamPuño * 0.35);
    pop();
  }

  // Fase 2: Impacto exacto
  if (frameGolpe === 12 && !golpeEjecutado) {
    golpeEjecutado = true;
    estadoApp = 'DESTRUIDO';
    destelloAlpha = 255;
    
    generarGrietasProcedurales(puntoImpacto.x, puntoImpacto.y);

    for (let i = 0; i < 160; i++) {
      let angulo = random(TWO_PI);
      gestorParticulas.agregarVidrio(puntoImpacto.x, puntoImpacto.y, angulo);
    }
  }

  // Fase 3: Pantalla rota permanente
  if (estadoApp === 'DESTRUIDO') {
    push();
    for (let g of grietas) {
      stroke(0, 0, 0, g.opacidad * 0.8);
      strokeWeight(g.grosor + 1.5);
      line(g.x1 + 1, g.y1 + 1, g.x2 + 1, g.y2 + 1);

      stroke(240, 255, 255, g.opacidad);
      strokeWeight(g.grosor);
      line(g.x1, g.y1, g.x2, g.y2);
    }

    noStroke();
    fill(0, 0, 0, 210);
    ellipse(puntoImpacto.x, puntoImpacto.y, 45, 45);
    stroke(255, 255, 255, 240);
    strokeWeight(2);
    noFill();
    ellipse(puntoImpacto.x, puntoImpacto.y, 50, 50);

    dibujarCartelReinicio();
    pop();
  }
}

function dibujarCartelReinicio() {
  push();
  textFont('Orbitron');
  textAlign(CENTER, CENTER);
  
  let cuadroW = min(width * 0.7, 460);
  let cuadroH = 65;
  let cuadroY = height * 0.88;

  fill(10, 15, 20, 220);
  stroke(239, 68, 68, 180);
  strokeWeight(1.5);
  rect(width * 0.5 - cuadroW * 0.5, cuadroY - cuadroH * 0.5, cuadroW, cuadroH, 8);

  fill(255, 80, 80);
  textSize(14);
  text('¡SUJETO FUERA DE CONTROL! - PANTALLA DESTRUIDA', width * 0.5, cuadroY - 10);
  
  fill(200, 220, 240);
  textSize(12);
  text('Presiona la tecla [ R ] o usa el botón para reiniciar el experimento', width * 0.5, cuadroY + 12);
  pop();
}

// ============================================================================
// 11. INTERACCIONES: CLICS, TOQUES Y TECLADO (Requisitos 10, 13)
// ============================================================================

function manejarInteraccion(px, py) {
  if (estadoApp === 'MODAL' || estadoApp === 'DESTRUCCION') return;

  if (estadoApp === 'DESTRUIDO') {
    return;
  }

  let centroX = width * 0.5;
  let centroY = height * 0.52;
  let radioInteraccion = min(width * 0.35, 220);

  let distancia = dist(px, py, centroX, centroY);

  if (distancia < radioInteraccion) {
    ira = min(100.0, ira + INCREMENTO_CLIC);
    
    if (gestorParticulas) {
      for (let i = 0; i < 10; i++) {
        gestorParticulas.particulas.push(new ParticulaChispa(px, py));
      }
    }
    console.log(`¡Interacción en el sujeto! Ira: ${ira.toFixed(1)}%`);
    verificarIraMaxima();
  }
}

function mousePressed() {
  if (gestorObjetos && gestorObjetos.intentarAgarrar(mouseX, mouseY)) {
    return false;
  }
  manejarInteraccion(mouseX, mouseY);
  return false;
}

function mouseDragged() {
  if (gestorObjetos) gestorObjetos.arrastrar(mouseX, mouseY);
  return false;
}

function mouseReleased() {
  if (gestorObjetos) gestorObjetos.soltar();
  return false;
}

function toqueSobreInterfaz(evento) {
  const objetivo = evento && evento.target;
  return Boolean(objetivo && objetivo.closest && objetivo.closest('button, .modal-overlay, .hud-container'));
}

function touchStarted(evento) {
  if (toqueSobreInterfaz(evento)) return true;

  if (touches && touches.length > 0) {
    if (gestorObjetos && gestorObjetos.intentarAgarrar(touches[0].x, touches[0].y)) {
      return false;
    }
    manejarInteraccion(touches[0].x, touches[0].y);
  }
  return false;
}

function touchMoved(evento) {
  if (toqueSobreInterfaz(evento)) return true;

  if (gestorObjetos && touches && touches.length > 0) {
    gestorObjetos.arrastrar(touches[0].x, touches[0].y);
  }
  return false;
}

function touchEnded(evento) {
  if (toqueSobreInterfaz(evento)) return true;

  if (gestorObjetos) gestorObjetos.soltar();
  return false;
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    reiniciarExperiencia();
  }
}

function reiniciarExperiencia() {
  obtenerReferenciasDOM();
  ira = 0.0;
  volumenActual = 0.0;
  volumenSuavizado = 0.0;
  golpeEjecutado = false;
  frameGolpe = 0;
  destelloAlpha = 0;
  grietas = [];
  estadoApp = 'JUGANDO';
  if (gestorParticulas) {
    gestorParticulas.reiniciar();
  }
  if (gestorObjetos) {
    gestorObjetos.reiniciar();
  }
  mensajeImpacto.alpha = 0;
  console.log("Experiencia reiniciada.");
}

// ============================================================================
// 12. ACTUALIZACIÓN DEL HUD
// ============================================================================

function actualizarHUD() {
  if (estadoApp === 'MODAL') return;

  if (dom.hudMeterFill) {
    dom.hudMeterFill.style.width = `${ira}%`;
  }
  if (dom.hudIraText) {
    dom.hudIraText.innerText = `IRA: ${Math.floor(ira)}%`;
  }

  if (dom.hudStatusBadge) {
    if (ira < 25) {
      dom.hudStatusBadge.className = 'badge-calm';
      dom.hudStatusBadge.innerText = 'DORMIDO';
    } else if (ira < 50) {
      dom.hudStatusBadge.className = 'badge-annoyed';
      dom.hudStatusBadge.innerText = 'MOLESTO';
    } else if (ira < 75) {
      dom.hudStatusBadge.className = 'badge-transforming';
      dom.hudStatusBadge.innerText = 'TRANSFORMÁNDOSE';
    } else {
      dom.hudStatusBadge.className = 'badge-raged';
      dom.hudStatusBadge.innerText = ira >= 100 ? 'DESTRUCCIÓN' : 'COLOSO GAMMA';
    }
  }

  if (micDisponible && dom.hudAudioLevel) {
    let porcentajeVol = min(100, volumenSuavizado * 280);
    dom.hudAudioLevel.style.width = `${porcentajeVol}%`;
    if (dom.audioDbReadout) {
      dom.audioDbReadout.innerText = `Nivel: ${(volumenSuavizado * 100).toFixed(1)}`;
    }
  }
}

// ============================================================================
// 13. ADAPTABILIDAD RESPONSIVE (windowResized)
// ============================================================================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (gestorObjetos) gestorObjetos.reiniciar();
  if (estadoApp === 'DESTRUIDO') {
    puntoImpacto = { x: width * 0.5, y: height * 0.48 };
  }
}
