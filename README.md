# Visualizador de sonido

**Probalo online:** https://morapercaz-rgb.github.io/visualizador-de-sonido/
(en Chrome o Safari; necesita internet; tus audios y videos se abren en tu
propia compu, no se suben a ningún lado)

Escucha un audio, dibuja formas generativas (auras, círculos, degradados,
remolinos) que reaccionan a graves/medios/agudos, y permite cargar videos
como capa de fondo con efectos. Todo se controla en vivo desde el panel de
sliders (arriba a la derecha), y se puede grabar el resultado sin el mouse
ni los paneles.

## El panel de controles

Está arriba a la derecha y **tiene scroll propio** (rueda del mouse o trackpad sobre el panel). Arranca con todas las carpetas cerradas menos "Formas generativas"; se abren y se cierran con un click en el título.

## Conjuntos (varias piezas a la vez)

Podés tener **varios conjuntos** en pantalla al mismo tiempo, cada uno **independiente**: con su propio modo (anillo, remolino, aura de colores…), su cantidad, colores, estilo, opacidad, deformación y física. Por ejemplo: un aura de colores de fondo + un remolino en el medio + un anillo de contornos arriba.

Carpeta **"Conjuntos"** (arriba de todo en el panel):
- **editando**: elegís qué conjunto estás modificando. Todas las demás carpetas del panel (Formas generativas, Cada cosa, Deformar, Aura de colores, Agarrar y mover, Paleta…) editan **ese** conjunto.
- **nombre** y **visible** (ocultar un conjunto sin borrarlo).
- **+ conjunto nuevo**, **duplicar este conjunto** (copia toda la configuración, un poco corrida), **eliminar este conjunto** (siempre queda al menos uno).
- **traer al frente**: el orden de la lista es el orden de dibujo (el último queda arriba); esto manda el seleccionado al final.

El mouse recorre los conjuntos de arriba hacia abajo: si agarrás algo, se mueve en el conjunto que lo tiene más arriba, y los demás no se tocan. Doble click sobre algo agarrable actúa solo en ese conjunto; doble click en un lugar vacío recentra todos.

**Es global (no cambia por conjunto):** "Capa de video", "Efectos de video" y "Fondo", que están al final del panel y valen para toda la pieza.

Al cambiar de conjunto el panel se rearma pero **conserva qué carpetas tenías abiertas** y la posición del scroll.

## Transformar, mover y animar un conjunto

Cada conjunto tiene su propia transformación (carpetas "Transformar y mover", "Movimiento continuo" y "Animación (keyframes)"):

- **Posición, rotación, escala, opacidad y pivote.** Con **"manijas en pantalla"** aparece un gizmo sobre el conjunto seleccionado: la cruz lo mueve (con **Alt** mueve solo el pivote, sin que el dibujo se desplace), el círculo lo rota y el cuadradito lo escala.
- **"gira sobre"** elige el eje de giro: **su propio eje** (el centro de la pieza, aunque la hayas arrastrado), **el centro del lienzo** (si el conjunto está corrido, orbita alrededor del centro) o **pivote manual** (el que pongas con pivote X / Y).
- **Movimiento continuo:** giro en °/seg (positivo o negativo, o con los graves), vaivén, órbita elíptica, deriva y pulso de tamaño.
- **Giro propio de cada elemento** (carpeta "Deformar" → "giro propio"): cada círculo/mancha deformado gira sobre su propio eje. Se nota solo si el elemento no es redondo (estirar distinto de 1 u ondulación mayor que 0).
- **Keyframes** al estilo After: "+ keyframe" guarda posición, rotación, escala y opacidad en el momento actual; al reproducir o mover "ir a (s)" se interpola entre ellos ("suave" arranca y frena despacio, "lineal" va parejo). Mientras está en pausa podés editar libremente; los valores solo se pisan cuando el tiempo cambia.
- Toda la animación usa **tiempo real**: dura lo mismo en una pantalla de 60 Hz que en una de 120 Hz.

## Ecos de aura: la cola sigue el movimiento

Con "cola detrás del movimiento" (carpeta "Copias (ecos de aura)"), la fila de copias chicas se acomoda **detrás de la dirección en que movés la copia grande**, como la cola de un cometa, y **se queda ahí** cuando frenás. "qué tan rápido gira la cola" regula cuánto tarda en acomodarse; "volver al ángulo fijo" (en 0 no vuelve nunca) hace que regrese sola al ángulo de "dirección (ecos)". Apagando "cola detrás del movimiento", la fila apunta siempre al ángulo fijo.

## Lienzo, grabación y exportación

**Lienzo (carpeta "Lienzo")** — el tamaño de lo que se ve y se graba, como la composición de After. Presets: ventana (se adapta), Full HD 1920×1080, HD 1280×720, 4K 3840×2160, vertical 1080×1920 (reels), cuadrado 1080×1080 y 4:5 1080×1350, o medidas personalizadas, y un botón para girarlo (intercambiar ancho y alto). Se puede cambiar sobre la marcha; se muestra achicado para que entre en la ventana, pero todo (posiciones en píxeles, grabación, exportación) está en el tamaño real. No se puede cambiar mientras graba: se aplica al terminar. El 4K en vivo puede ir pesado.

**Grabar en vivo (botón ● Grabar)** — carpeta "Grabación: formato y calidad":
- **MP4 H.264**: lo abren After Effects, Premiere y las redes.
- **WebM VP9** (liviano) y **WebM VP8** (compatible): solo navegador; After no los abre.
- **cuadros/seg** (24, 30 o 60) y **calidad** en Mbps. Si el navegador no soporta el formato pedido, avisa cuál usa.
- Graba el canvas: sin mouse, sin panel y sin manijas del gizmo (las manijas del aura de colores sí salen si no las apagás).

**Exportar secuencia de PNG** — carpeta "Exportar secuencia de PNG (para After)": una imagen por cuadro, **con fondo transparente** si querés. No es en vivo: cada cuadro se arma con el tiempo exacto (1/fps), así que sale perfecto aunque la compu tarde, y el audio se analiza cuadro por cuadro sin reproducirlo. Se exporta lo que determinan la línea de tiempo, el movimiento continuo y el audio; **lo que movés con el mouse en vivo no se graba**.
- En **Chrome** te pide una carpeta y escribe ahí los PNG. En otros navegadores descarga un **ZIP**.
- Incluye un `LEEME.txt` con el tamaño, los cuadros por segundo y cómo importarlo en After (Archivo > Importar > Archivo, marcar "PNG Sequence"). El audio se importa aparte, con el archivo original.
- Mientras exporta, el dibujo en vivo se pausa; el mismo botón pasa a "■ Cancelar exportación".

## Cómo correrlo

No hace falta instalar nada (no usa Node). Solo necesita un servidor local
porque el navegador bloquea los módulos de JS si abrís el `index.html`
directo con doble clic.

Desde esta carpeta, en la terminal:

```bash
python3 -m http.server 8000
```

Y abrís `http://localhost:8000` en el navegador. Para cortar el servidor:
`Ctrl+C` en la terminal.

## Estructura

- `index.html` / `style.css` — el wireframe y el estilo de la interfaz (botones, panel de archivos).
- `js/audioEngine.js` — escucha el audio y en cada frame devuelve graves/medios/agudos promediados, más el espectro completo repartido en franjas (para los modos tipo ecualizador).
- `js/visualEngine.js` — dibuja la visualización generativa. Tiene **6 modos** intercambiables desde el panel ("modo" en la carpeta "Formas generativas"): anillo, grilla, picos radiales, barras, espiral y auras/gotas. Agregar un modo nuevo es escribir una función acá y sumarla al `switch` de `VisualEngine.draw()` — el resto del sistema (audio, color, controles) no cambia.
- `js/colorUtils.js` — convierte los colores hex que elegís en el panel a HSL, para poder interpolarlos en el modo degradado.
- `js/videoLayer.js` — carga y dibuja los videos de fondo, con opacidad/blend y los efectos (espejo, pixelado, separación RGB, glitch, flash).
- `js/controls.js` — arma el panel de sliders (Tweakpane) y los valores por defecto de cada parámetro.
- `js/main.js` — conecta todo y corre el loop de dibujo.

## Color

En "Formas generativas" hay dos selectores de color (**color A** y **color B**) y un "modo color":

- **reactivo**: usa color A, pero el tono se corre solo con los agudos de la música.
- **fijo**: usa color A quieto. "Dispersión arcoíris" controla si todas las formas comparten el mismo color o se reparten como un arcoíris alrededor de A.
- **degradado**: interpola de color A a color B a lo largo de las formas (por ejemplo, en el anillo, un lado es A y el opuesto es B).
- **según frecuencia**: el color de toda la visualización se mueve solo, en vivo, a lo largo de la paleta de la carpeta "Paleta" — cuando el sonido está más cargado de graves se acerca a un extremo de la paleta, cuando está más cargado de agudos se acerca al otro.

Saturación y luminosidad son sliders aparte que se aplican siempre, sea cual sea el modo — así podés mantener tu paleta pero subir/bajar qué tan "pastel" o "saturado" se ve.

"Resplandor (blur)" difumina toda la visualización generativa (útil para que las formas se vean como luz en vez de figuras con bordes duros — combina muy bien con el modo "auras / gotas").

### Paleta ("según frecuencia")

Es una carpeta aparte con 6 colores, cada uno con su check para prenderlo o apagarlo — podés usar 2, 3, o los 6 a la vez. El modo "según frecuencia" recorre en orden los que estén prendidos: si el audio suena más grave, el color se acerca al primero de la lista que esté activo; si suena más agudo, se acerca al último. Los que apagás quedan totalmente afuera de la mezcla.

## Círculos, auras y degradados

Carpeta "Círculos, auras y degradados" del panel. Tres modos nuevos inspirados en referencias de arte generativo, más controles que valen para varios modos:

- **remolino de círculos** — decenas de aros finos que se van corriendo y dibujan un ocho torcido, con un núcleo de luz en cada lóbulo. Los graves separan los dos extremos, los medios lo hacen serpentear, "rotación" lo hace girar. "Cantidad" (arriba) = cuántos aros; "núcleo (remolino)" = intensidad de las luces.
- **ecos de aura** — una forma con degradado que se repite hacia un costado, cada copia más chica y tenue, como la estela de una luz. "forma (ecos)" elige mancha blanda (cambia con el espectro), medio círculo o círculo; "copias" cuántas; "dirección" hacia dónde se abren. **Movimiento fluido:** cada copia persigue a la de adelante con retraso, así que al mover la copia grande (o cuando cambia la dirección o el largo de la fila) llegan una detrás de otra, como una cola que se arrastra, y no todas juntas y duras. "**retraso entre copias**" (carpeta "Cada cosa" → "Copias (ecos de aura)") lo regula: 0 = rígidas, cerca de 1 = muy fluidas.
- **aura envolvente** — manchas enormes y blandas que cubren la pantalla. De izquierda a derecha cada una escucha una franja del espectro (graves a la izquierda, agudos a la derecha) y se infla cuando suena fuerte. "manchas" = cuántas.
- **estilo círculo** (anillo, grilla y espiral): sólido, *aura* (degradado radial que se funde con el fondo) o *aro hueco*.
- **degradado de tono**: cuánto cambia el color del centro al borde de cada círculo/mancha (0 = un solo color).

## Cada cosa: cantidad, relleno y opacidad

Carpeta "Cada cosa: cantidad, relleno y opacidad". Cada tipo de elemento tiene su propia subcarpeta con tres controles:

- **cantidad**: círculos (anillo/grilla/espiral), aros del remolino, núcleos de luz (0 a 2), copias de los ecos, manchas del aura envolvente, picos y barras, máximo de gotas a la vez, círculos libres.
- **estilo**: **relleno**, **contorno** o **relleno + contorno** (los círculos tienen además **aura**, el degradado difuso). En las gotas, el contorno son aros que se expanden como ondas en el agua.
- **opacidad**: de ese tipo de cosa, que se multiplica con la "opacidad general" de "Formas generativas".

Arriba de todo hay dos controles que valen para todo: **"estilo de TODO"** (pisa los estilos de cada uno y pasa toda la pieza a relleno, contorno o ambos de un golpe; "cada uno el suyo" los respeta) y **"grosor contorno"**.

## Deformar

Carpeta "Deformar". Aplica a las cosas redondas (círculos, gotas/auras, aros del remolino, copias en forma de círculo, manchas y círculos libres):

- **estirar** (1 = redondo, más = alargado, menos = achatado) y **ángulo** (hacia dónde apunta el estiramiento): las vuelve elipses.
- **ondulación**: el borde se vuelve irregular, como una mancha orgánica. En las auras (que son halos difusos) el borde sigue siendo blando. **ondulación x audio** hace que crezca con el volumen; **velocidad** controla qué tan rápido ondula.
- Los checks "aplicar: …" eligen a qué cosas se aplica (por ejemplo, deformar las gotas pero no los círculos).

Con todo en su valor inicial (estirar 1, ondulación 0) no se deforma nada.

## Aura de colores (mezcla)

Modo **"aura de colores (mezcla)"**: un aura grande hecha de varias luces de distinto color que se funden donde se juntan.

- Cada luz tiene una **manija** (un puntito con aro blanco): la agarrás y la movés, y los colores se mezclan distinto según dónde queden.
- **cantidad de colores** (1 a 8) y un selector de color para cada una (color 1 a 8). Para "agregar un color" subí la cantidad; los selectores de colores que sobran no se usan.
- **cómo se mezclan**: "mezclar (normal)" mantiene los colores vivos (el mejor para ver la mezcla); "pantalla" y "luz (suma)" aclaran y con muchos colores se queman a blanco.
- **atracción al centro**: una leve fuerza que va juntando las luces hacia el centro del grupo, para que se sigan mezclando (en 0 se quedan donde las sueltes). **flotar** las hace moverse solas despacito.
- Cada luz escucha una franja distinta del espectro, así que cada color late a su manera con la música. **tamaño** y **opacidad** del aura, y "aplicar deformación" (carpeta "Deformar") la estira o la hace ondular.
- **mostrar manijas**: apagalo antes de grabar si no querés que los puntitos aparezcan en el video.

## Agarrar y mover con el mouse

Carpeta "Agarrar y mover (mouse)". El cursor se vuelve una manito cuando estás sobre algo que se puede agarrar.

**Movimiento suave (física).** Lo que agarrás no queda pegado al mouse: lo persigue con un poco de retraso, y al soltarlo sigue deslizando con su impulso hasta frenar.
- **suavidad al arrastrar**: 0 = pegado al mouse (duro); cerca de 1 = lo persigue con mucho retraso.
- **inercia al soltar**: 0 = frena en seco; cerca de 1 = se desliza mucho tiempo.
- **gravedad** (solo círculos libres): los hace caer hacia abajo; **rebote** controla cuánto rebotan contra los bordes de la pantalla.
Vale para los círculos libres, los núcleos del remolino, la pieza entera y las luces del aura de colores.

- **Núcleos del remolino**: en el modo "remolino de círculos" agarrás cada núcleo de luz y lo llevás adonde quieras; toda la figura se reacomoda siguiéndolo.
- **La pieza entera**: en anillo, picos, espiral, remolino y ecos podés agarrar la pieza (por el centro, o por la copia grande en los ecos) y moverla de lugar. En grilla, barras, aura envolvente y auras/gotas no hay nada para agarrar, porque ocupan toda la pantalla.
- **Círculos libres**: el slider "círculos libres" decide cuántos hay (0 a 12). Los agarrás y los arrastrás: dejan una estela con degradado de **color A (recién dejada) a color B (a punto de borrarse)**, que se achica, se hace transparente y desaparece sola. "duración estela" controla cuántos segundos tarda; "tamaño" los agranda (laten con los graves); tienen su propio estilo y opacidad.
- **Doble click** sobre un círculo libre lo borra (el slider baja solo); doble click en cualquier otro lado recentra la pieza y los núcleos. También está el botón "recentrar pieza y núcleos".

Los círculos libres son objetos aparte: no se pueden agarrar los círculos del anillo o la espiral (esos se recalculan solos en cada cuadro).

## Grabar

Botón **● Grabar** (abajo a la izquierda). Graba **el canvas, no la pantalla**: en el video no aparece el mouse, ni el panel de sliders, ni la estantería de archivos — solo la imagen, con el audio que esté sonando. Mientras grabás movés lo que quieras. Al apretar **■ Detener** se descarga solo un archivo `visualizador-fecha-hora.webm` (o `.mp4` en Safari).

Tip: no cambies el tamaño de la ventana mientras grabás, porque el video cambia de resolución a mitad de camino.

## Modo "auras / gotas"

Burbujas de luz que nacen solas con los golpes de graves (detecta un salto brusco, igual que el flash de la capa de video) y se van agrandando y desvaneciendo de a poco. No hay nada que dibujar mientras no suena nada: apenas arranca el audio con algo de graves, empiezan a aparecer.

## Biblioteca de audios y videos

Podés cargar varios audios y varios videos a la vez ("Cargar audio(s)" / "Cargar video(s)" aceptan selección múltiple). Todo lo que subís queda como una miniatura en el panel de abajo a la izquierda — nada se activa solo. Para ponerlo en pantalla:

- **Arrastrás** la miniatura hacia el centro (el canvas) y la soltás, o
- la **clickeás** directamente.

El video muestra una miniatura real (una captura de su primer frame); el audio se ve como un ícono con el nombre del archivo. La miniatura activa queda resaltada con un borde celeste.

## Efectos de video

En "Efectos de video" cada efecto tiene su propio check para prenderlo o apagarlo, y se pueden combinar todos los que quieras a la vez (ej: espejo + glitch + flash juntos):

- **espejo** — refleja la mitad izquierda del video sobre la derecha (simetría, tipo kaleidoscopio simple).
- **distorsión / onda** — ondula la imagen en franjas horizontales finitas, como agua o una cinta mal alineada. "Intensidad" es cuánto se deforma, "velocidad" qué tan rápido ondula.
- **cortes** — divide la imagen en franjas verticales anchas y las corre cada una a su propio ritmo (a diferencia del glitch, que es al azar, acá el movimiento es una onda suave y controlada).
- **rotación** — el video gira sobre su propio centro. Velocidad negativa = gira al revés.
- **pixelado** — lo achica a bloques grandes y lo vuelve a agrandar sin suavizar (efecto pixel art). "Tamaño píxel" controla qué tan grandes son los bloques.
- **duotono** — lo pasa a blanco y negro y mapea cada tono a un color entre "oscuro" y "claro" (el efecto de las tapas de disco de Spotify). Elegís los dos colores con los selectores.
- **separación RGB** — desfasa los canales de color (rojo/verde/azul) uno de cada lado, el clásico efecto de "aberración cromática" o VHS roto.
- **estela / trails** — deja un rastro de los frames anteriores, que se va desvaneciendo solo. "Persistencia" controla qué tan largo dura el rastro (0 = nada, cerca de 1 = casi no se borra nunca).
- **glitch** — corta franjas horizontales al azar y las desplaza, como una señal cortada.
- **flash (con el beat)** — detecta un salto brusco de graves (un golpe de batería, por ejemplo) y tira un destello de color que decae solo. El color del destello y su intensidad se controlan aparte.

Estos efectos se aplican sobre el video antes que el blur/contraste/etc. de "Capa de video", que siguen actuando siempre encima de cualquier combinación de efectos.

## Qué dejé sin definir (decisiones tuyas)

- **La composición dentro de cada modo**: la geometría de anillo/grilla/picos/barras/espiral es una base neutra. Se puede modificar el trazo (círculos vs. líneas vs. otra forma) dentro de cada función sin romper nada del resto.
- **La paleta por defecto** (`colorA`/`colorB` en `controls.js`) — hoy es azul/rosa, un placeholder.
- **Qué modos de mezcla y efectos de video priorizar**: ya están los básicos de canvas (blur, invertir, contraste, saturación, glitch). Si querés distorsiones más raras (pixelado, RGB split, feedback/trails, displacement) se puede pasar esa capa a WebGL con shaders — es otro nivel de control pero más curva de aprendizaje. Avisame si querés ir para ese lado.

## Próximos pasos posibles

- Guardar/cargar "presets" de parámetros (para no perder una combinación que te gustó).
- Grabar la pantalla (hay una API de navegador, `MediaRecorder`, para exportar lo que ves como video).
- Sumar reacción a golpes de bateo/beat detection (no solo bandas de frecuencia continuas).
