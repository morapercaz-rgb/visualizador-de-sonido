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
- **reacciona al sonido:** tildado (por defecto), el conjunto se mueve con el audio. Destildado, ese conjunto se ve **como con silencio** y los demás siguen reaccionando; sirve para tener unos que laten con la música y otros quietos. En la lista de conjuntos aparece con 🔇. Se guarda con el conjunto y también vale en las transformaciones, la línea de tiempo y las exportaciones.
- **+ conjunto nuevo**, **duplicar este conjunto** (copia toda la configuración, un poco corrida), **eliminar este conjunto** (siempre queda al menos uno).

**Mis conjuntos guardados** (carpeta justo debajo de "Conjuntos") — tu biblioteca de conjuntos pre-hechos, que **queda guardada en el navegador** y está ahí la próxima vez que entres, aunque cierres la pestaña o apagues la compu:
- **guardar como** + **💾 guardar este conjunto**: guarda la configuración del conjunto que estás editando (modo, cantidades, colores, estilo, deformación, movimiento, transformación y keyframes). Si ya había uno con ese nombre, lo actualiza.
- **guardados** (lista) con **+ agregar a la escena** (suma una copia como conjunto nuevo, sin tocar los demás), **reemplazar el que estoy editando** (le pone esa configuración al conjunto actual) y **borrar de mis guardados** (los que ya tenés en la escena no se tocan).
- **⬇ exportar a un archivo / ⬆ importar de un archivo**: bajan y suben tus guardados como `mis-conjuntos.json`. Sirven para pasárselos a una amiga o para llevarlos a otro navegador.
- **Pasarle conjuntos a otra persona (o a otra compu):**
  - **🔗 copiar link de este conjunto** / **🔗 copiar link con todos los míos**: copia un link que lleva los conjuntos adentro. Quien lo abra (desde cualquier compu o celular) los recibe en su "Mis conjuntos guardados", y le quedan guardados en su navegador. El link se achica guardando solo lo que cambia respecto de los valores iniciales; un conjunto suele ser menos de 1 KB. Si el chat lo corta, usá exportar / importar.
  - **Lista de todos (🌐):** los conjuntos que estén en el archivo `conjuntos-compartidos.json` del repositorio los ve **cualquiera que abra la página**, sin links ni archivos (aparecen con 🌐 y se pueden agregar a la escena, usar en las transformaciones y en la línea de tiempo; no se pueden borrar desde la página). Para sumar uno: guardalo, **exportalo a un archivo**, copiá su contenido (la lista `conjuntos`) adentro de `conjuntos-compartidos.json` y publicá.
- Ojo: lo que guardás vos es **de cada navegador y de cada dirección** y no viaja con el link de la página (por eso existen el link con conjuntos y la lista de todos): la de la página publicada y la de `localhost` son distintas (para llevar de una a otra, exportá e importá), y si borrás los datos del sitio o usás una ventana privada se pierde. Al guardar se conserva **todo el conjunto**: la configuración completa del panel, los keyframes y **dónde dejaste lo que moviste con el mouse** (el centro, los núcleos, los círculos libres, las luces del aura de colores, la fila de ecos), así al cargarlo se ve igual que cuando lo guardaste. Lo único que no se guarda es lo que pasa solo en el momento (las gotas que van apareciendo, las estelas) ni lo global (fondo y video). Los conjuntos que guardaste antes de esta versión no tienen las posiciones: volvelos a guardar.
- **traer al frente**: el orden de la lista es el orden de dibujo (el último queda arriba); esto manda el seleccionado al final.

El mouse recorre los conjuntos de arriba hacia abajo: si agarrás algo, se mueve en el conjunto que lo tiene más arriba, y los demás no se tocan. Doble click sobre algo agarrable actúa solo en ese conjunto; doble click en un lugar vacío recentra todos.

**Es global (no cambia por conjunto):** "Capa de video", "Efectos de video" y "Fondo", que están al final del panel y valen para toda la pieza.

Al cambiar de conjunto el panel se rearma pero **conserva qué carpetas tenías abiertas** y la posición del scroll.

## Transformación: un conjunto que se convierte en otro

Carpeta **"Transformación (de un conjunto a otro)"** (debajo de "Mis conjuntos guardados"). Elegís dos conjuntos y cuánto dura, y ves cómo el primero se va transformando en el segundo; también se puede exportar como secuencia de PNG.
- **desde (A) / hasta (B)**: pueden ser conjuntos que tenés en la escena (los marca "en la escena") o **conjuntos guardados** (los marca "💾 … guardado"). Con los guardados no hace falta armar nada en pantalla: los dos salen de tu biblioteca. La elección queda recordada aunque refresques la página.
- **duración (s)**, **curva** (suave arranca y frena, constante va parejo) y **al terminar** (una vez, repetir, o ida y vuelta de A a B y de vuelta a A).
- **▶ ver la transformación** la reproduce desde el principio; **⏯ pausa / seguir**; **■ salir de la transformación** (los conjuntos vuelven a verse separados); **ir a** te deja pararte en cualquier punto (0 = A, 1 = B) para mirarlo o ajustarlo.
- **solo estos dos** (activado por defecto): mientras se ve y se exporta la transformación, no se dibuja nada más. Si lo apagás, el resto de los conjuntos de la escena se ve debajo.
- **Cómo se transforma (gradual):** no se mezclan dos dibujos: **cada círculo, mancha o aro de A viaja hasta un lugar de B y se va acomodando**, cambiando de tamaño y de color en el camino, hasta formar el dibujo de B. Al principio se ve A tal cual y al final B tal cual. Funciona entre cualquier par de modos (anillo → grilla, ecos → remolino…). Si un conjunto tiene más piezas que el otro, algunas se reparten en varias (o varias se juntan en una). La posición, rotación, escala y opacidad del conjunto también pasan de a poco de las de A a las de B. Las barras y los picos radiales se transforman como puntos, no como rayas.
- **escalonado** (0 = todas las piezas salen a la vez; más alto = salen una tras otra dando la vuelta, como una ola) y **curva del camino** (0 = recto; con valores positivos o negativos el camino se curva hacia un lado u otro, con aire de remolino).
- **⬇ exportar la transformación (secuencia de PNG)**: una imagen por cuadro, desde el primero (todo A) hasta el último (todo B), con la duración que pusiste. Usa los cuadros/seg, el fondo transparente y el "guardar en" (ZIP o carpeta) de "Exportar animación". Se guarda como `transformacion-fecha`, con su `LEEME.txt`; se importa en After igual que cualquier secuencia. Si hay un audio activo, las formas reaccionan a él durante la transformación.

## Línea de tiempo de etapas: varios conjuntos y posiciones que se van transformando

Carpeta **"Línea de tiempo (varias etapas)"** y una **barra abajo de la pantalla** (aparece cuando hay al menos una etapa). Cada **etapa** es un conjunto en una posición; la línea de tiempo recorre las etapas en orden y **entre una y la siguiente se transforma de forma gradual** (cada pieza viaja y se acomoda, como en "Transformación").
- **Armarla:** elegí un conjunto (de la escena o 💾 guardado) y apretá **+ agregar etapa al final**. Repetí con los demás, o con el mismo en otro lugar. Conviene usar **conjuntos guardados**: los de la escena se pierden al refrescar, y la línea de tiempo recuerda a los guardados.
- **Cada etapa** tiene: **conjunto**, **se queda (s)** (cuánto tiempo está quieta), **tarda en pasar (s)** (cuánto dura la transformación hacia la siguiente) y su **posición X / Y, escala, rotación y opacidad**. Con **tomar la posición que tiene el conjunto** copiás los valores del conjunto. También podés **duplicar**, **subir / bajar** (cambiar el orden) y **quitar** una etapa.
- **Poner las posiciones:** elegir una etapa la lleva a su parte quieta. Ahí podés mover los sliders de posición, escala y rotación, o **arrastrar con el mouse sobre el lienzo** para colocarla donde quieras (mientras la línea de tiempo esté pausada).
- **La barra de abajo:** un bloque de color por etapa (lo que se queda) y una franja con degradé entre etapas (la transformación), con ancho proporcional al tiempo. **Click o arrastre** sobre la barra para ir a cualquier momento; **click en un bloque** elige esa etapa. Botón ▶ / ⏸ para reproducir; el reloj muestra el tiempo.
- **al terminar:** una vez, repetir, o ida y vuelta. **curva** (suave o constante), **escalonado** y **curva del camino** (los mismos de "Transformación") y **solo estas etapas** (esconde el resto de los conjuntos mientras se ve y se exporta).
- **⬇ exportar la línea de tiempo (secuencia de PNG):** todos los cuadros de la primera a la última etapa, con la duración total de la línea de tiempo (la suma de los "se queda" y "tarda en pasar"). Usa los cuadros/seg, el fondo transparente y el "guardar en" de "Exportar animación". Se guarda como `linea-de-tiempo-fecha`.
- **Queda guardada** aunque refresques la página (etapas, tiempos, posiciones y opciones).

## Transformar, mover y animar un conjunto

Cada conjunto tiene su propia transformación (carpetas "Transformar y mover", "Movimiento continuo" y "Animación (keyframes)"):

- **Posición, rotación, escala, opacidad y pivote.** Con **"manijas en pantalla"** aparece un gizmo sobre el conjunto seleccionado: la cruz lo mueve (con **Alt** mueve solo el pivote, sin que el dibujo se desplace), el círculo lo rota y el cuadradito lo escala.
- **"gira sobre"** elige el eje de giro: **su propio eje** (el centro de la pieza, aunque la hayas arrastrado), **el centro del lienzo** (si el conjunto está corrido, orbita alrededor del centro) o **pivote manual** (el que pongas con pivote X / Y).
- **Movimiento continuo:** giro en °/seg (positivo o negativo, o con los graves), vaivén, órbita elíptica, deriva y pulso de tamaño.
- **Giro propio de cada elemento** (carpeta "Deformar" → "giro propio"): cada círculo/mancha deformado gira sobre su propio eje. Se nota solo si el elemento no es redondo (estirar distinto de 1 u ondulación mayor que 0).
- **Keyframes** al estilo After: "+ keyframe" guarda posición, rotación, escala y opacidad en el momento actual; al reproducir o mover "ir a (s)" se interpola entre ellos ("suave" arranca y frena despacio, "lineal" va parejo). Mientras está en pausa podés editar libremente; los valores solo se pisan cuando el tiempo cambia.
- Toda la animación usa **tiempo real**: dura lo mismo en una pantalla de 60 Hz que en una de 120 Hz.

## Ecos de aura: la cola sigue el movimiento

**La copia grande está anclada a tu mouse:** el punto que agarrás es siempre el centro del movimiento y no se corre aunque la cola gire; la cola gira *alrededor* de la copia grande, no al revés.

Con "cola detrás del movimiento" (carpeta "Copias (ecos de aura)"), la fila de copias chicas se acomoda **detrás de la dirección en que movés la copia grande**, como la cola de un cometa, y **se queda ahí** cuando frenás. Solo reacciona a movimientos claros y gira de a poco; "qué tan rápido gira la cola" regula cuánto tarda en acomodarse (más bajo = más suave). "volver al ángulo fijo" (en 0 no vuelve nunca) hace que regrese sola al ángulo de "dirección (ecos)". Apagando "cola detrás del movimiento", la fila apunta siempre al ángulo fijo. **La cola no gira sola**; si querés que gire, "giro de la cola (°/seg)" (en 0 por defecto) la hace girar alrededor de la copia grande. La "rotación" de "Formas generativas" ya no afecta a los ecos.

## Lienzo, grabación y exportación

**Lienzo (carpeta "Lienzo")** — el tamaño de lo que se ve y se graba, como la composición de After. Presets: ventana (se adapta), Full HD 1920×1080, HD 1280×720, 4K 3840×2160, vertical 1080×1920 (reels), cuadrado 1080×1080 y 4:5 1080×1350, o medidas personalizadas, y un botón para girarlo (intercambiar ancho y alto). Se puede cambiar sobre la marcha; se muestra achicado para que entre en la ventana, pero todo (posiciones en píxeles, grabación, exportación) está en el tamaño real. No se puede cambiar mientras graba: se aplica al terminar. El 4K en vivo puede ir pesado.

**Grabar en vivo (botón ● Grabar)** — carpeta "Grabación: formato y calidad". Graba **lo que hacés en el momento**: el mouse, el audio sonando, todo. Elegís el formato:
- **MP4 H.264**: lo abren After Effects, Premiere y las redes.
- **WebM VP9** (liviano) y **WebM VP8** (compatible): solo navegador; After no los abre.
- **Secuencia de PNG, sin fondo (en vivo)**: mientras movés las cosas, se va guardando **una imagen PNG por cada cuadro, con fondo transparente** (se ve un damero detrás del lienzo mientras graba). Se guarda en un **ZIP** al detener (lo que viene por defecto) o en una **carpeta** (elegís "PNG: guardar en" en la carpeta "Grabación: formato y calidad"; Chrome te la pide al empezar y no deja elegir Escritorio, Descargas ni Documentos: elegí una carpeta nueva adentro de alguna). Si la carpeta no se puede usar, graba igual y lo deja en un ZIP, avisando por qué. Hay un botón aparte, **"● Grabar PNG"**, al lado de "● Grabar", que graba directo en este formato sin tener que cambiar el desplegable; si cancelás la carpeta, avisa y no graba. Si se llena la memoria, **corta solo y guarda lo grabado hasta ahí**. Los cuadros que la compu no alcanza a codificar se rellenan repitiendo el anterior para que la duración quede bien (si pasa, te avisa: probá un lienzo más chico).
- **cuadros/seg** (24, 30 o 60) y **calidad** en Mbps (solo para video).
- **Lo que se graba es solo el canvas**: no salen el mouse, el panel, el **gizmo** ni las **manijas** del aura de colores. Esas manijas viven en una capa aparte encima del lienzo que se ve en pantalla pero nunca entra en la grabación ni en la exportación.

**Exportar un archivo que se mueve** — carpeta "Exportar animación" → "Un solo archivo que se mueve". Dibuja la animación cuadro por cuadro (con tiempo exacto, no en vivo) y la deja en **un solo archivo**, con una **vista previa moviéndose** antes de guardar:
- **PNG animado (botón "⬇ PNG animado")**: un `.png` que se mueve, con **fondo transparente** y calidad completa de color. Se ve animado en el navegador (Chrome, Safari…); el visor de imágenes de la Mac y After Effects lo muestran quieto.
- **GIF (botón "⬇ GIF")**: se mueve en cualquier lado (Mac, WhatsApp, redes). Tiene como máximo 256 colores y la transparencia es de todo o nada, por eso por defecto sale con fondo; se puede tildar "GIF: fondo transparente".
- Se elige **duración** (por defecto 10 s; hasta 120 s), **cuadros por segundo** y **ancho del archivo** (se achica desde el lienzo; un archivo animado grande pesa muchísimo). La duración también se elige con el **desplegable junto a los botones** "⬇ PNG animado" y "⬇ GIF", sin abrir el panel; son el mismo valor. Una animación se repite sola en bucle, así que una corta se ve cortada. "incluir el video cargado" (apagado por defecto) decide si un video de fondo entra.
- **Para que se mueva:** cargá un audio y activalo (arrastrá su miniatura al centro) para que las formas reaccionen al sonido, y/o usá el movimiento continuo (giro, órbita, pulso) o keyframes. Sin audio activo ni nada animado, todos los cuadros salen iguales; el programa avisa con "sin audio activo". Lo que movés con el mouse **no** entra en esta exportación (para eso, grabá en vivo).

**Si ya hiciste un PNG animado o un GIF y lo querés en After** — botón **"⇄ Convertir a secuencia"** (abajo a la izquierda, o en el panel, carpeta "Exportar animación"). Elegís el archivo y saca todos sus cuadros como PNG sueltos, **conservando la transparencia**, y detecta los cuadros por segundo. No hace falta rehacer la animación: el PNG animado y el GIF tienen todos los cuadros adentro. Funciona con PNG animado, GIF y WebP animado, en Chrome, Edge y Safari 17 o más nuevo. Guarda en una carpeta (Chrome te la pide) o en un ZIP que hay que descomprimir antes de abrirlo en After. Ojo: el archivo animado se hizo con el "ancho del archivo" que tuviera ese día (por defecto 640 px, achicado desde el lienzo): la secuencia sale de ese mismo tamaño. Si necesitás el tamaño completo del lienzo, exportá la secuencia directamente.

**Exportar secuencia de PNG (offline, para After)** — "Secuencia de PNG (carpeta de imágenes, para After)": una **carpeta con una imagen por cuadro** (al reproducirlas en orden son un video). Cada cuadro se arma con tiempo exacto aunque la compu tarde, y el audio se analiza cuadro por cuadro sin reproducirlo. Incluye un `LEEME.txt` con cómo importarlo en After (Archivo > Importar > Archivo, marcar "PNG Sequence"; el audio se importa aparte). En Chrome te pide una carpeta; en otros navegadores descarga un ZIP. En una Mac también se puede abrir en QuickTime Player (Archivo > Abrir secuencia de imágenes).
- **Mezcla "suma" con fondo transparente:** los colores se conservan (apilados sobre un fondo oscuro quedan prácticamente idénticos al original), pero sobre otros fondos un brillo "suma" se ve como uno normal; en After conviene poner la capa en modo de fusión "Add" o "Screen".

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

## Barras: dirección del degradado y dónde reacciona más al sonido

En el modo **barras**, lo que más suena (los graves) caería a la izquierda, porque el espectro va de graves a agudos de izquierda a derecha. Con el **foco** podés poner esa reacción donde quieras; **por defecto queda en el centro**: las barras del medio son las más altas y van bajando hacia los dos costados (los agudos).
- **Dónde está:** carpeta **"Barras: reacción y degradado"** (aparece justo debajo de "Formas generativas" y se abre sola al elegir el modo barras), o directamente con **click / arrastre sobre el lienzo** mientras el conjunto esté en modo barras. Una marca blanca abajo muestra dónde está el foco (solo en pantalla, no sale en lo que se graba).
- **dirección del degradado** (misma carpeta): **de costado a costado** (como siempre: cada barra tiene su color y los colores van recorriéndose de izquierda a derecha), **de abajo a arriba** o **de arriba a abajo** (el degradado de colores recorre la altura y es el mismo en todas las barras: a una misma altura todas tienen el mismo color, y las barras bajas muestran solo la parte de abajo). Usa los mismos colores que ya tengas elegidos (degradado A→B, paleta o arcoíris).
- **dónde (izq ↔ der):** la posición del foco (0,5 = centro).
- **qué tan ancho:** cuántas barras alrededor del foco reaccionan; chico = pocas, ancho = casi todas.
- **cuánto (0 = como antes):** en 0 las barras quedan como antes (graves a la izquierda, todas parejo); subiéndolo se concentra más en el foco.
Es por conjunto y se guarda con el conjunto.

## Alcance del aura: que las auras se fundan de más lejos

En "Formas generativas", **alcance del aura** (1 = normal). Con más de 1, el halo de las auras (aura de colores, auras/gotas, aura envolvente y círculos en estilo aura) llega más lejos y su borde es más lleno, así **cuando dos conjuntos se acercan, sus auras se funden sobre una zona más larga**, sin agregar nada nuevo: es la misma unión que ya ocurre donde se superponen. Con menos de 1 el halo se acorta. Es por conjunto y se guarda con él.

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
- **velocidad (rebotan en las paredes):** además de flotar, las luces **recorren la pantalla en línea recta y rebotan al chocar con las paredes** (los bordes del lienzo, contando el cuerpo del aura, no solo su centro). La velocidad la ponés vos, en píxeles por segundo (0 = quietas, como antes; viene en 120). Cada luz sale para un lado y va a un ritmo apenas distinto. Se puede agarrar una luz con la manija: al soltarla sigue para el lado en que la tiraste. Mientras se mueven así, la atracción al centro no actúa. La velocidad es la misma en pantallas de 60 y de 120 Hz y en las exportaciones.
- Cada luz escucha una franja distinta del espectro, así que cada color late a su manera con la música. **tamaño** y **opacidad** del aura, y "aplicar deformación" (carpeta "Deformar") la estira o la hace ondular.
- **mostrar manijas**: apagalo antes de grabar si no querés que los puntitos aparezcan en el video.

## Agarrar y mover con el mouse

Carpeta "Agarrar y mover (mouse)". El cursor se vuelve una manito cuando estás sobre algo que se puede agarrar.

**Por defecto, lo que agarrás queda pegado al mouse y frena en seco al soltarlo** (control total). Si querés un movimiento más suave, hay una física opcional que está apagada (en 0):
- **suavidad al arrastrar**: 0 = pegado al mouse; cerca de 1 = lo persigue con retraso.
- **inercia al soltar**: 0 = frena en seco; cerca de 1 = se desliza un rato.
- **gravedad** (solo círculos libres): los hace caer hacia abajo; **rebote** controla cuánto rebotan contra los bordes. Sin gravedad ni inercia no hay bordes: el círculo queda donde lo sueltes.
Vale para los círculos libres, los núcleos del remolino, la pieza entera y las luces del aura de colores. Aparte, en el aura de colores, **atracción al centro** (también en 0 por defecto) va juntando las luces después de soltarlas.

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
