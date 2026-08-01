# Los prompts

Dos juegos sobre el mismo circuito real de Madrid: uno cenital en 2D y otro en
3D. Aquí están los prompts para reproducir cada uno, y la lista completa de
repositorios, modelos y licencias que usan — para que cualquiera pueda hacerlo
igual.

Los dos parten de proyectos open source existentes. Nada de esto está hecho
desde cero, y ese es justo el truco: el trabajo está en *fusionar* un juego que
ya funciona con la geometría real de un circuito.

---

## Prompt 1 — el juego 2D cenital

> Haz un fork de `github.com/leereilly/micro-machines` (Phaser 3, MIT) y
> conviértelo en un juego de carreras cenital sobre el circuito real de Madrid
> (IFEMA-Valdebebas, el trazado urbano de 2026).
>
> El circuito no puede ser inventado ni "inspirado en": tiene que ser el real.
> Sácalo así:
> 1. Coge la línea central publicada de `github.com/bacinger/f1-circuits`
>    (MIT), archivo `circuits/es-2026.geojson`. Esos puntos lat/lon fijan la
>    *identidad* de la vuelta: dónde está la meta, en qué sentido se corre y en
>    qué orden vienen las curvas. Proyéctalos a un plano métrico local.
> 2. Esa polilínea publicada NO sirve como trazado jugable: hay tramos donde
>    corta en diagonal por el interior del circuito y acabaría poniendo asfalto
>    sobre césped y edificios. Úsala solo para registrar el paso siguiente.
> 3. Descarga el modelo 3D "Circuito de Madring 2026 layout" de Dave Love en
>    Sketchfab (CC-BY-4.0) y camina por el centro de su asfalto real para sacar
>    los puntos de control definitivos. Encaja el modelo contra la línea del
>    paso 1 con ICP / distance transform. Valida que cada waypoint cae sobre
>    asfalto del modelo, y escribe un script de validación que lo compruebe.
> 4. Rinde una vista ortográfica cenital de ese mismo modelo, a un píxel de
>    imagen por píxel de mundo, y úsala como suelo del juego. Así los pabellones
>    de IFEMA, el pit lane, las gradas y los árboles son los de verdad y están
>    donde tienen que estar.
>
> Importante: la imagen es decorado, el spline es la verdad. La máscara de
> colisión se sigue generando desde el spline, no desde la imagen.
>
> Usa suficientes puntos de control para que el spline Catmull-Rom no recorte
> las curvas (con 64 puntos se desviaba hasta 17,8 m, más de lo que mide de
> ancho la carretera; con 256 el error desaparece).
>
> Los coches: rinde sprites cenitales del modelo de
> `github.com/ahacker-1/apex-formula-2026` (Apache-2.0), uno por piloto, con la
> receta de pintura clearcoat del ejemplo `webgl_materials_car` de three.js
> (MIT).
>
> Que se pueda jugar en el móvil en vertical: el canvas tiene que adaptarse a
> la pantalla en vertical (no dejes un diseño 1024x768 apaisado que en un móvil
> quede en una franja diminuta entre dos bandas negras), controles táctiles en
> pantalla — dirección abajo a la izquierda, acelerador/freno/nitro abajo a la
> derecha — y minimapa fuera de donde va el pulgar. Los menús también tienen
> que ser táctiles, no solo la carrera.
>
> Respeta las licencias: NOTICE con la procedencia de todo, y nada de usar
> "MADRING", "F1" o "Gran Premio" como marca del producto.

---

## Prompt 2 — el juego 3D

> Haz un fork de `github.com/colyseus/react-racing-game` (React Three Fiber,
> MIT — a su vez fork de `github.com/pmndrs/racing-game`) y llévalo al mismo
> circuito real de Madrid que el juego 2D, usando la misma línea central medida.
>
> Quita la física de `@react-three/cannon` (raycast vehicle) entera, junto con
> el mundo de colisiones. En su lugar, adapta el modelo analítico de vehículo de
> `github.com/ahacker-1/apex-formula-2026` (Apache-2.0): cuatro ruedas con
> modelo de neumático, carga aerodinámica, y el coche posicionado en el
> "track frame" del circuito medido. Los muros y el cronometraje de vuelta
> también analíticos, trazando rayos contra el corredor medido.
>
> Usa el coche `f1car-2026.glb` de ese mismo proyecto, y el modelo de circuito
> de Dave Love (Sketchfab, CC-BY-4.0) como escenario — sacando el asfalto por
> raycast contra la propia malla del modelo.
>
> Añade rivales con IA, secuencia de salida con las cinco luces, y público y
> ambiente para que no se sienta vacío.
>
> Tres cámaras (persecución, cabina, cenital) que se cicla con una tecla. Ojo
> con esto: si la cámara por defecto que lee el bucle de render va un frame por
> detrás del estado, acabas aplicando la pose de un modo de cámara al objeto
> cámara equivocado y corrompes su rotación de forma permanente. Guarda
> referencias directas a cada cámara y escribe la rotación completa cada frame.
>
> Móvil: controles táctiles con dirección analógica por arrastre (no dos
> botones digitales), HUD compacto que no tape el coche, y bloquea el modo
> vertical — un juego de carreras en 3D se juega en horizontal.
>
> Despliega los dos juegos juntos en GitHub Pages.

---

## Todo lo que usan los dos juegos

| Qué | De dónde | Licencia |
|---|---|---|
| Motor del juego 2D | [`leereilly/micro-machines`](https://github.com/leereilly/micro-machines) | MIT |
| Motor del juego 3D | [`colyseus/react-racing-game`](https://github.com/colyseus/react-racing-game) → [`pmndrs/racing-game`](https://github.com/pmndrs/racing-game) | MIT |
| Identidad de la vuelta (meta, sentido, orden de curvas) | [`bacinger/f1-circuits`](https://github.com/bacinger/f1-circuits) | MIT |
| Modelo 3D del circuito (asfalto real, pabellones, gradas) | [Dave Love — "Circuito de Madring 2026 layout"](https://sketchfab.com/3d-models/circuito-de-madring-2026-layout-5bbaf6e5048643858a498bc8a4ef4c05) | CC-BY-4.0 |
| Modelo del coche + dinámica del vehículo | [`ahacker-1/apex-formula-2026`](https://github.com/ahacker-1/apex-formula-2026) | Apache-2.0 |
| Receta de pintura clearcoat | [three.js `webgl_materials_car`](https://threejs.org/examples/webgl_materials_car.html) | MIT |
| Arte de referencia de vehículos | [Kenney — Racing Pack](https://kenney.nl/assets/racing-pack) | CC0 |
| Música | [MFCC vía Pixabay](https://pixabay.com/users/28627740/) | Pixabay Content License |

La atribución de CC-BY-4.0 es **obligatoria**, no cortesía: el crédito a Dave
Love va en la pantalla que ve el jugador, no solo en el NOTICE.

### Sobre el modelo 3D del circuito (el paso manual)

Es la única pieza que no se descarga sola, y conviene decirlo claro porque es
donde se atasca cualquiera que lo intente:

- Hay que bajarlo **a mano desde Sketchfab** (pide cuenta y aceptar la
  licencia). De las opciones de descarga, la buena es **glTF (~66 MB)**, no el
  `.glb` de 134 MB.
- **En este repo ya va incluido**, así que quien clone no necesita descargarlo:
  `git clone` y a correr. Solo hace falta bajarlo si quieres rehacer el
  pipeline desde el origen.
- Lo que el juego carga en runtime no es el modelo original sino sus dos
  derivados, mucho más ligeros: `madring-3d/public/models/circuit-draco.glb`
  (8,9 MB, comprimido con Draco) para el 3D, e `images/madring-overhead.jpg`
  (1,1 MB, el render cenital) para el 2D.
- Redistribuirlo está permitido por CC-BY-4.0 mientras se dé la atribución
  —que se da—, así que incluirlo en el repo es legítimo, no un atajo.

---

## Nota de honestidad

Estos dos prompts describen el destino, no el viaje. Si los pegas tal cual vas
a llegar muy lejos de una sola vez — pero el proyecto real salió de bastantes
más rondas que dos: el trazado se rehizo varias veces (la primera versión, la
de la geodata publicada, ponía un 11,8% de la carretera sobre césped y
edificios), la física del coche se reescribió tres veces hasta que "se sintió
como conducir", y varios fallos solo aparecieron jugando de verdad — muros que
se atravesaban, el ciclo de cámaras que se rompía a la segunda vuelta, el HUD
móvil comiéndose el coche.

Lo que sí es cierto y merece contarse: **casi nada de esto se escribió desde
cero**. Dos juegos open source que ya funcionaban, un modelo 3D del circuito
que alguien ya había hecho, un coche de fórmula que alguien ya había modelado,
y la geodata del trazado ya publicada. El trabajo fue fusionarlos y medir bien.
