# Rurana — Guía de Diseño

Sistema de diseño para la PWA de rehabilitación. Referencia única para mantener coherencia visual entre pantallas.

---

## Principios

1. **Legibilidad ante todo** — texto con suficiente contraste en brillo bajo. Nunca usar opacidad menor a 50% en texto informativo.
2. **Touch-first** — targets mínimos de 44×44 px en mobile. Sliders con thumb de 34 px.
3. **Dos modos, una identidad** — pantallas claras (home, checkin) y pantallas oscuras (exercise detail, SST). Misma tipografía, mismo sistema de tokens.
4. **Sin decoración innecesaria** — la información clínica es el foco. El diseño sirve, no compite.

---

## Paleta de colores

Todos los colores están en `tokens.css` como variables CSS.

### Modo claro (pantallas principales)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#F5F2EC` | Fondo principal |
| `--bg-2` | `#EFEBE2` | Fondo alternativo, secciones |
| `--card` | `#FFFFFF` | Tarjetas elevadas |
| `--card-soft` | `#FBF8F2` | Tarjetas planas, chips |
| `--ink` | `#1F3A2E` | Texto principal, fondo dark-screen |
| `--ink-2` | `#2A5E4C` | Texto secundario énfasis |
| `--ink-3` | `#4A5A52` | Texto terciario |
| `--muted` | `rgba(31,58,46,0.55)` | Labels, eyebrows |
| `--faint` | `rgba(31,58,46,0.25)` | Texto muy secundario |
| `--line` | `rgba(31,58,46,0.10)` | Bordes, separadores |
| `--line-2` | `rgba(31,58,46,0.18)` | Bordes más visibles |
| `--clay` | `#D97757` | Acento primario (alertas, CTAs alt) |
| `--clay-soft` | `#F4D7C6` | Clay suave, backgrounds de alerta |
| `--clay-deep` | `#B0532F` | Clay intenso, hover |
| `--sun` | `#E8B85C` | Acento cálido, indicadores medios |
| `--moss` | `#8AA88C` | Verde suave, estados neutros |
| `--bone` | `#EDE6D6` | Texto sobre fondos oscuros |

### Modo oscuro (`.screen-dark`)

| Token / Valor | Uso |
|---|---|
| `#111E16` | Fondo de pantalla oscura |
| `rgba(245,240,232,0.97)` | Texto principal completado |
| `rgba(245,240,232,0.80)` | Texto descriptivo (cuerpo) |
| `rgba(245,240,232,0.60)` | Labels, eyebrows |
| `rgba(245,240,232,0.55)` | Headers de columna (SET/RPE/REPS) |
| `rgba(245,240,232,0.45)` | Texto incompleto / inactivo |
| `rgba(245,240,232,0.18)` | Track de slider |
| `rgba(245,240,232,0.12)` | Separadores de fila |

### Colores semánticos de dolor

| Nivel | Color | Rango |
|---|---|---|
| Sin dolor | `#6EC96E` verde | 0 |
| Moderado | `#C9C96E` amarillo | 1–4 |
| Alto | `#C96E6E` rojo | 5–10 |

Aplicados con `--zone-color` en `.zone-slider` y con `accentColor` en indicadores.

---

## Tipografía

Tres familias, cada una con un rol claro.

```css
--font-serif: 'Instrument Serif', Georgia, serif
--font-sans:  'Manrope', system-ui, sans-serif
--font-mono:  'JetBrains Mono', ui-monospace, monospace
```

### Clases de texto

| Clase | Fuente | Tamaño | Uso |
|---|---|---|---|
| `.title-xl` | Serif | 44 px | Títulos de pantalla (ejercicio, fase) |
| `.title-lg` | Serif | 32 px | Títulos de sección grande |
| `.title-md` | Serif | 24 px | Subtítulos, tarjetas destacadas |
| `.body` | Sans | 15 px (16 px mobile) | Descripción de ejercicios, contenido |
| `.body-sm` | Sans | 13 px (14 px mobile) | Texto secundario |
| `.label` | Sans | 12 px (13 px mobile) | Etiquetas de campos |
| `.eyebrow` | Mono | 11 px | Categorías en uppercase (`SET`, `RPE`) |
| `.num` | Mono | — | Números tabulares (sets, reps, RPE) |

### Reglas tipográficas

- Serif solo para títulos (`title-*` y `.serif`). Nunca para body o labels.
- Mono para datos numéricos, counters, y eyebrows.
- `letter-spacing: 0.12em` en eyebrows siempre.
- `line-height: 1.05` en title-xl, `1.6` en body descriptivo.

---

## Espaciado y layout

### Pantalla base

```css
.screen        /* padding-top: 54px + safe-area, padding-bottom: 34px + safe-area */
.screen-body   /* padding: 0 22px */
```

Variantes de densidad disponibles (aplicar en `<body>` o wrapper):
- `.aire-compacto` — pantallas con mucho contenido
- `.aire-aire` — pantallas con poco contenido, más espacio

### Helpers de espaciado

```
.gap-{4|6|8|10|12|16}   gap entre flex items
.mt-{4|8|12|16|20|24}   margin-top
```

### Layout de filas (sets de ejercicio)

```
grid-template-columns: 44px 1fr 1fr 52px 40px
                       SET  RPE REPS CHECK EXPAND
```

Min-height de 64 px por fila para touch cómodo.

---

## Componentes CSS

### Botones

```jsx
// CTA principal (ancho completo)
<button className="btn-pill">Registrar</button>

// Alternativo (clay/naranja)
<button className="btn-pill alt">Guardar</button>

// Fantasma (borde)
<button className="btn-pill ghost">Cancelar</button>
```

En `.screen-dark`, `.btn-pill` automáticamente usa fondo claro (`#F5F0E8`) con texto oscuro.

### Tarjetas

```jsx
<div className="card">       {/* blanco, elevado con sombra */}
<div className="card-flat">  {/* crema, con borde, sin sombra */}
```

Para interactividad:
```jsx
<div className="card card-tap">  {/* scale(0.985) en :active */}
```

### Chips

```jsx
<span className="chip">Fase 2</span>
```

Pill con fondo crema, borde y texto `--ink-3`.

### Barra de progreso

```jsx
<div className="bar">
  <span className="bar-fill" style={{ width: "60%" }} />
</div>
```

### Eyebrow (label uppercase)

```jsx
<p className="eyebrow">Hoy</p>
```

---

## Slider de dolor (`.zone-slider`)

Clase de slider customizada para touch mobile. **Siempre usar esta clase**, nunca `<input type="range">` sin ella.

```jsx
<input
  type="range"
  className="zone-slider"
  min={0} max={10} step={1}
  style={{ "--zone-color": "#6EC96E" } as React.CSSProperties}
/>
```

- Touch target: 44 px de alto
- Thumb: 28 px (modo claro) / 34 px (modo oscuro, override automático en `.screen-dark`)
- Color dinámico vía `--zone-color` CSS var
- Track: 8 px modo claro / 6 px modo oscuro

---

## Iconos

Librería: `@phosphor-icons/react`. Wrapper en `src/react-app/components/icons.tsx`.

```jsx
import { Ico } from "../components/icons";

<Ico.check s={16} c="var(--bone)" />
<Ico.chevL s={22} c="var(--ink)" />
<Ico.flame />   // defaults: s=18, c=currentColor
```

| Nombre | Icono | Uso |
|---|---|---|
| `Ico.home` | House | Tab home |
| `Ico.body` | Person | Tab cuerpo |
| `Ico.path` | Path | Tab camino |
| `Ico.book` | Book | Tab aprende |
| `Ico.flame` | Flame | Ejercicio activo |
| `Ico.check` | Check (bold) | Completado |
| `Ico.chevR` | CaretRight | Expandir / navegar |
| `Ico.chevL` | CaretLeft | Volver |
| `Ico.close` | X | Cerrar |
| `Ico.drop` | Drop | Hidratación / SST |
| `Ico.spark` | Sparkle | Destacado |
| `Ico.chart` | ChartBar | Progreso |
| `Ico.refresh` | ArrowCounterClockwise | Sync |

---

## Motion / Animaciones

Librería: `motion/react` (`framer-motion` v11+).

### Easing tokens

```css
--ease-spring: cubic-bezier(0.25, 0.46, 0.45, 0.94)
--ease-bounce: cubic-bezier(0.32, 0.72, 0, 1)
```

### Patrones estándar

**Panel expansible (pain detail):**
```jsx
<motion.div
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: "auto", opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{ duration: 0.2, ease: "easeInOut" }}
  style={{ overflow: "hidden" }}
>
```

**Tap en botones:**
```jsx
<motion.button
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
>
```

**Clases CSS de animación continua:**
- `.pulse` — scale 1→1.08, 3.6s, para elementos de atención
- `.drift` — translateY 0→-4px, 4.2s, para íconos flotantes

---

## Pantallas

### Estructura estándar (modo claro)

```jsx
<div className="screen">
  <div className="screen-body">
    {/* contenido */}
  </div>
</div>
```

### Pantalla oscura (ejercicio, SST)

```jsx
<div className="screen screen-dark" style={{ position: "relative" }}>
  <div className="screen-body" style={{ paddingBottom: 120 }}>
    {/* contenido */}
  </div>

  {/* Footer fijo */}
  <div style={{
    position: "fixed", bottom: 0, left: 0, right: 0,
    padding: "20px 24px 40px",
    background: "linear-gradient(to top, #111E16 60%, transparent)",
    pointerEvents: "none",
  }}>
    <motion.button className="btn-pill" style={{ pointerEvents: "auto" }}>
      Guardar
    </motion.button>
  </div>
</div>
```

**Importante:** el gradiente del footer siempre debe usar el color de fondo exacto (`#111E16`), no `var(--bg)` que es el color claro.

---

## Tab bar

Componente global en `TabBar.tsx`. Fixed, flotante, blur glass.

Rutas activas detectadas con `useLocation()`. No modificar el z-index (100) ni el border-radius (28 px).

---

## Qué no hacer

- **No** texto con opacidad < 50% en modo oscuro — ilegible en brillo bajo
- **No** `<input type="range">` sin clase `.zone-slider`
- **No** `var(--bg)` en gradientes de pantalla oscura — es el crema claro
- **No** font-size menor a 10 px en cualquier elemento interactivo
- **No** targets de toque menores a 44×44 px
- **No** fuente serif para body text o labels
- **No** colores fuera de los tokens sin documentar la excepción
