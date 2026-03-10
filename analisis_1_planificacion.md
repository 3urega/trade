# Planificación de mejoras — basada en analisis_1.md + feedback.md

> **Análisis original (analisis_1.md):** un trader cuantitativo evalúa la plataforma. Veredicto: arquitectura 8.5/10, pero falta investigar si hay edge real.
>
> **Feedback (feedback.md):** el mismo experto revisa el plan y añade 3 piezas críticas que faltaban. Con todo implementado: 9.7/10.

---

## Estado actual vs lo que piden los análisis

| Lo que ya tenemos | Lo que falta |
|---|---|
| Walk-forward (predecir → entrenar) | Significancia estadística (t-stat, p-value) |
| Forward test separado | Permutation test (anti-curve-fitting) |
| Correlación predicción vs real (Pearson) | **Edge económico: conditional return** *(feedback)* |
| Ensemble (3 modelos) | **Calibration curve: predicted vs actual** *(feedback)* |
| Métricas: Skill Score, Sharpe, DirAcc | Feature importance (qué features aportan señal) |
| Presets de trading con SL/TP | **Estabilidad del modelo: varianza de coeficientes** *(feedback)* |
| Experiments (automatización backtest+fwd) | Robustez a parámetros (sweep) |
| — | Consistencia temporal (rolling multi-periodo) |
| — | Detección de régimen de mercado |
| — | Comparativa de presets enfocada en estabilidad |

---

## Principio rector

> **No buscar "el modelo que más gana en histórico", sino "la señal más estable y explotable".**

Cada utilidad debe responder una de estas preguntas:

1. ¿Existe señal real, o es ruido? *(significancia, permutation test)*
2. ¿La señal es explotable económicamente? *(conditional return, calibration)*
3. ¿Qué features contienen esa señal y es estable el modelo? *(feature importance, estabilidad)*
4. ¿En qué condiciones aparece y es robusta? *(régimen, sweep, consistencia temporal)*

---

## Pipeline del usuario: los 7 pasos hacia una decisión de trading

Las fases técnicas (más abajo) construyen herramientas. Este pipeline define **cómo las usa el usuario** en un flujo guiado con semáforos. No es un wizard rígido que bloquea, sino un checklist de investigación siempre visible con indicadores claros.

El usuario puede saltarse pasos (es su dinero), pero la app mostrará avisos si intenta activar trading sin haber completado la investigación.

```
PASO 1 — Explorar señal            "¿Hay algo ahí?"
    │
    ▼
PASO 2 — Validar contra azar       "¿Es real o suerte?"
    │
    ▼
PASO 3 — Entender la señal         "¿De dónde viene? ¿Es estable el modelo?"
    │
    ▼
PASO 4 — Probar robustez           "¿Funciona en un rango de parámetros?"
    │
    ▼
PASO 5 — Probar en el tiempo       "¿Funciona en 2022, 2023, 2024?"
    │
    ▼
PASO 6 — Simular trading real      "¿Sigue rentable con fees y stops?"
    │
    ▼
PASO 7 — Decisión                  "Activar / Descartar / Seguir investigando"
```

### Paso 1 — Explorar señal

**Qué hace el usuario:** Elige symbol, timeframe, modelo. Ejecuta un backtest.

**Qué mira:** Panel Signal Quality (Fase 1):
- Correlación predicción vs real + p-value.
- Conditional return: cuando el modelo dice BUY, ¿cuánto gana realmente? ¿Cubre los costes?
- Calibration curve: ¿la predicción es monotónica (más predicción → más retorno)?
- Skill Score + intervalo de confianza.

**Semáforo:**
- Rojo: correlación ≈ 0, p-value > 0.1 → "No hay señal. Cambia configuración."
- Amarillo: correlación 0.01–0.03, p-value < 0.05 → "Señal débil. Puede ser interesante."
- Verde: correlación > 0.03, p-value < 0.01, conditional return > costes → "Señal prometedora."

**Si es rojo:** Cambiar modelo, timeframe, symbol, o modo de predicción. Repetir.
**Si es amarillo/verde:** Avanzar al paso 2.

---

### Paso 2 — Validar contra azar

**Qué hace el usuario:** Pulsa "Validar contra azar" (permutation test, Fase 2).

**Qué mira:** Histograma con 100 ejecuciones aleatorias vs su resultado real.

**Semáforo:**
- Rojo: resultado dentro de la distribución aleatoria (p > 0.05) → "No mejor que lanzar una moneda."
- Verde: resultado claramente por encima (p < 0.05) → "La señal es real, no es suerte."

**Si es rojo:** La señal del paso 1 era ilusión. Volver al paso 1 con otra configuración.
**Si es verde:** Avanzar al paso 3.

---

### Paso 3 — Entender la señal

**Qué hace el usuario:** Revisa feature importance (Fase 3). Opcionalmente ejecuta 3-4 backtests en periodos distintos para comparar coeficientes.

**Qué mira:**
- Gráfico de importancia de features: ¿qué features aportan y cuáles son ruido?
- Si hizo backtests en varios periodos: ¿los coeficientes del modelo son parecidos?

**Semáforo:**
- Rojo: coeficientes cambian radicalmente entre periodos → "El modelo se adapta al ruido de cada periodo."
- Verde: coeficientes consistentes → "El modelo ve algo real y repetible."

**Si es rojo:** La señal no es estable. Simplificar features (quitar las de importancia ≈ 0), probar otro modelo. Volver al paso 1.
**Si es verde:** Avanzar al paso 4.

---

### Paso 4 — Probar robustez

**Qué hace el usuario:** Ejecuta un parameter sweep (Fase 4). Varía threshold, SL, TP en un rango.

**Qué mira:** Heatmap o gráfico de línea mostrando Sharpe vs valor del parámetro.

**Semáforo:**
- Rojo: solo funciona con parámetros exactos (< 20% de combinaciones rentables) → "Curve fitting."
- Amarillo: funciona en un rango moderado (20-60%) → "Parcialmente robusto."
- Verde: funciona en un rango amplio (> 60%) → "Robusto."

**Si es rojo:** El modelo estaba sobreoptimizado. Volver al paso 1.
**Si es verde:** Avanzar al paso 5.

---

### Paso 5 — Probar en el tiempo

**Qué hace el usuario:** Ejecuta rolling backtests (Fase 5) en ventanas de 6 meses a lo largo de 2-3 años.

**Qué mira:** Tabla de métricas por periodo. ¿Son estables?

**Semáforo:**
- Rojo: funciona solo en un periodo concreto → "Probablemente ruido temporal."
- Amarillo: funciona en la mayoría pero colapsa en alguno → "Sensible a condiciones de mercado."
- Verde: consistente en todos los periodos → "Señal temporal estable."

**Si es amarillo:** Candidato ideal para combinar con detección de régimen (Fase 6) en el futuro.
**Si es verde:** Avanzar al paso 6.

---

### Paso 6 — Simular trading real

**Qué hace el usuario:** Ejecuta un Forward Test out-of-sample con fees realistas, SL/TP, position sizing.

**Qué mira:** P&L, Sharpe, drawdown, win rate, equity curve, trade log.

**Semáforo:**
- Rojo: P&L negativo, Sharpe < 0 → "La señal existe pero no cubre costes en trading real."
- Amarillo: P&L positivo pero drawdown > 15% o Sharpe < 0.5 → "Rentable pero arriesgado."
- Verde: P&L positivo, Sharpe > 0.5, drawdown < 10% → "Explotable."

**Si es rojo:** Ajustar threshold (más selectivo), mejorar SL/TP. Volver al paso 4 o 6.
**Si es verde:** Avanzar al paso 7.

---

### Paso 7 — Decisión

**Qué ve el usuario:** Resumen con los 6 semáforos anteriores y un veredicto.

```
┌─────────────────────────────────────────────────────┐
│  DECISIÓN DE TRADING                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Señal              ✅  corr=0.034, p=0.008     │
│  2. vs Azar            ✅  p_permutation=0.02      │
│  3. Modelo estable     ✅  coefs consistentes      │
│  4. Robusto            ✅  68% combinaciones ok     │
│  5. Temporal           ⚠️  5/6 periodos positivos   │
│  6. Forward test       ✅  +4.2%, Sharpe 0.8       │
│                                                     │
│  VEREDICTO: Señal validada. Apto para trading       │
│  con gestión de riesgo (drawdown en un periodo).    │
│                                                     │
│  [ Activar preset ]  [ Volver a investigar ]        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Opciones:**
- **Activar preset** → crear/configurar preset de trading con el snapshot del modelo.
- **Descartar** → la señal no pasó los filtros. Probar otra cosa.
- **Seguir investigando** → hay amarillos; explorar con régimen, más features, otro timeframe.

### Reglas de la UI

- **El pipeline se muestra como stepper lateral o barra de progreso**, siempre visible en la sección Research.
- **Cada paso completado guarda su semáforo** asociado al backtest/configuración.
- **No se bloquea al usuario**: puede ir directo al paso 6 si quiere, pero ve los pasos no completados en gris.
- **Si intenta activar un preset** sin haber completado los pasos, la app muestra un aviso: "No has validado la señal contra el azar (paso 2). ¿Continuar igualmente?"
- **Cada configuración nueva resetea el pipeline** — cambiar modelo o timeframe significa volver al paso 1.

---

## Fases de implementación (herramientas que construyen los pasos)

Cada fase construye las herramientas que los pasos del pipeline necesitan:

| Paso del usuario | Fase técnica que lo habilita |
|------------------|------------------------------|
| Paso 1 — Explorar señal | **Fase 1** — Panel Signal Quality |
| Paso 2 — Validar contra azar | **Fase 2** — Permutation test |
| Paso 3 — Entender la señal | **Fase 3** — Feature importance + estabilidad |
| Paso 4 — Probar robustez | **Fase 4** — Parameter sweep |
| Paso 5 — Probar en el tiempo | **Fase 5** — Rolling backtests |
| Paso 6 — Simular trading | Ya existe (Forward Test) |
| Paso 7 — Decisión | **Pipeline UI** — Stepper + resumen de semáforos |

---

### FASE 1 — Panel SIGNAL QUALITY (el corazón de la app)

**Pregunta que responde:** *¿Hay señal real, es estadísticamente significativa, y es explotable en trading?*

**Contexto:** El feedback dice que esta es LA mejora más importante. Actualmente mostramos correlación y Skill Score, pero no sabemos si son estadísticamente significativos ni si la señal cubre los costes de trading. Esta fase convierte la app de "¿cuánto ganó el bot?" a "¿existe señal real?".

#### Utilidad 1.1 — t-statistic y p-value de la correlación

- A partir de la correlación de Pearson ya calculada y del número de predicciones, calcular **t-statistic** y **p-value**.
- p-value < 0.05 → "menos de un 5% de probabilidad de que esta correlación sea casualidad".
- Guardar en la sesión del backtest y mostrar junto a la correlación existente.

#### Utilidad 1.2 — Conditional return (edge económico)

> *"La pieza MÁS importante que falta"* — feedback.md

- Calcular el retorno real medio condicionado a la predicción del modelo:
  - `E(real_return | predicted_return > threshold)` → ¿cuánto gana realmente cuando dice BUY?
  - `E(real_return | predicted_return < -threshold)` → ¿cuánto pierde realmente cuando dice SELL?
- Comparar con los costes de trading (fees + slippage estimado).
- Si `conditional_return - costes < 0` → la señal existe pero no es explotable.
- Mostrar como: "Cuando el modelo dice BUY, el retorno medio real es +0.06%. Con costes de 0.05%, el edge neto es +0.01%."

#### Utilidad 1.3 — Prediction calibration curve

> *"Herramienta favorita de los quants"* — feedback.md

- Agrupar las predicciones en buckets (p. ej. -0.5%, -0.2%, 0%, +0.2%, +0.5%).
- Para cada bucket, calcular el retorno real medio.
- Si la relación es monotónica (más predicción → más retorno real) → la señal es real.
- Si es caótica → el modelo está roto.
- Visualizar como tabla y como gráfico (eje X = predicción, eje Y = retorno real medio).

#### Utilidad 1.4 — Intervalos de confianza de las métricas

- Bootstrapped confidence intervals para Skill Score, Sharpe y correlación.
- Ejemplo: "Skill Score = 0.03 [0.01, 0.05] al 95% de confianza".
- Permite saber si el Skill Score de 0.03 es estable o podría ser -0.02 con otra muestra.

#### Utilidad 1.5 — Panel visual "Signal Quality"

- Bloque dedicado en los resultados del backtest que agrupe todo lo anterior:
  - Correlación + p-value (indicador verde/amarillo/rojo)
  - Conditional return (BUY y SELL) vs costes
  - Calibration curve (gráfico)
  - Skill Score + intervalo de confianza
  - Veredicto automático: "No hay señal", "Señal débil no explotable", "Señal significativa y explotable"
- Este panel es **el corazón de la app**: la primera cosa que miras tras un backtest.

**Prioridad: ALTA — IMPLEMENTAR PRIMERO.** Sin esto, todo lo demás es optimizar ruido.

---

### FASE 2 — Permutation test (anti-curve-fitting)

**Pregunta que responde:** *¿Mi estrategia funciona mejor que el azar, o funcionaría igual con datos aleatorios?*

**Contexto:** "La técnica que destruye el 90% de estrategias falsas". Si barajas los retornos reales y el bot sigue ganando lo mismo, no tiene edge. Si el resultado real está muy por encima de los aleatorios, hay edge.

#### Utilidad 2.1 — Permutation test en el backtest

- Tras un backtest normal, opción de ejecutar N ejecuciones adicionales (p. ej. 100) donde los retornos reales se barajan aleatoriamente (shuffle temporal).
- Cada ejecución produce su propio Sharpe, P&L, correlación.
- Comparar la métrica real con la distribución de las métricas aleatorias.

#### Utilidad 2.2 — Resultado visual del permutation test

- Histograma: distribución de Sharpe/P&L de las N ejecuciones aleatorias, con una línea vertical para el resultado real.
- p-value empírico: "tu Sharpe de 0.4 es mejor que el 97% de las ejecuciones aleatorias" → p = 0.03 → señal real.
- O bien: "tu Sharpe de 0.4 está en el percentil 60 de las ejecuciones aleatorias" → no hay edge.

**Prioridad: ALTA** — La prueba de fuego definitiva. Si no pasa, no importa cuánto P&L muestre.

---

### FASE 3 — Feature importance + estabilidad del modelo

**Pregunta que responde:** *¿Qué features contienen señal? ¿El modelo es estable o cambia de opinión entre entrenamientos?*

**Contexto:** Tenemos 14 features pero no sabemos cuáles aportan. Además, el feedback identifica una pieza crítica: si los coeficientes del modelo cambian radicalmente entre entrenamientos ("volatility weight pasa de 0.8 a -0.3"), no hay señal estable — es ruido.

#### Utilidad 3.1 — Extracción de pesos del modelo

- Para modelos lineales (SGD, PA, SGD Classifier): extraer `model.coef_` del ML Engine tras el backtest.
- Normalizar los pesos para hacerlos comparables entre features.
- Para MLP: permutation importance sobre las features.

#### Utilidad 3.2 — Endpoint de feature importance en ML Engine

- Nuevo endpoint que devuelve pesos/importancias de cada feature con sus nombres.
- Disponible tras un backtest completado.

#### Utilidad 3.3 — Visualización de feature importance

- Gráfico de barras horizontal: cada feature con su importancia (positiva o negativa).
- Resaltar top 3 y las que tienen importancia ≈ 0.
- Incluir en resultados del backtest.

#### Utilidad 3.4 — Estabilidad del modelo entre entrenamientos

> *"MUY importante para evitar sobreoptimización"* — feedback.md

- Al ejecutar rolling backtests (Fase 5) o repetir entrenamientos, guardar los coeficientes del modelo tras cada entrenamiento.
- Calcular la varianza de cada coeficiente entre entrenamientos distintos.
- Si `variance(coef_volatility)` es alta → la señal de volatilidad no es estable.
- Si los coeficientes son consistentes entre entrenamientos → el modelo ha encontrado algo real.
- Visualizar: tabla con cada feature, su peso medio y su varianza entre entrenamientos.

**Prioridad: MEDIA-ALTA** — Feature importance guía el diseño de mejores features. Estabilidad del modelo es el complemento natural.

---

### FASE 4 — Análisis de robustez a parámetros

**Pregunta que responde:** *¿Mi estrategia funciona solo con parámetros exactos o en un rango amplio?*

**Contexto:** Si solo funciona con `threshold = 0.00047`, está muerto en producción. Un sistema robusto funciona con threshold entre 0.0003 y 0.0007. Buscar "zonas robustas", no puntos óptimos.

#### Utilidad 4.1 — Parameter sweep (barrido de parámetros)

- Dado un backtest base, ejecutar variaciones de un parámetro en un rango (p. ej. signalThreshold de 0.0002 a 0.001 en 10 pasos).
- Para cada variación: Sharpe, P&L, correlación, conditional return.
- Ejecutable desde la UI: "Sweep threshold", "Sweep SL multiplier".

#### Utilidad 4.2 — Heatmap de robustez

- Heatmap: eje X = parámetro A, eje Y = parámetro B, color = Sharpe.
- ¿Zona amplia de verde (robusto) o punto verde rodeado de rojo (frágil)?
- Alternativa simple: gráfico de línea Sharpe vs parámetro.

#### Utilidad 4.3 — Score de robustez

- % de combinaciones del sweep que son rentables (Sharpe > 0).
- "73% rentables" → robusto. "12% rentables" → frágil.

**Prioridad: MEDIA** — Muy valiosa, pero requiere que las fases 1-2 ya aporten información.

---

### FASE 5 — Consistencia temporal (rolling multi-periodo)

**Pregunta que responde:** *¿La señal es estable a lo largo del tiempo o solo funciona en un periodo?*

**Contexto:** "Si funciona solo en un periodo, probablemente es ruido." Hay que probar en 2021, 2022, 2023, 2024.

#### Utilidad 5.1 — Rolling backtest automático

- Dada una configuración, ejecutar backtests en N ventanas temporales consecutivas.
- Ejemplo: ventana de 6 meses, cada 3 meses.
- Para cada ventana: Sharpe, correlación, Skill Score, conditional return.

#### Utilidad 5.2 — Panel de consistencia temporal

- Tabla o gráfico: periodos en eje X, métricas en eje Y.
- ¿Las métricas son estables o hay periodos donde colapsa?
- Calcular desviación estándar entre periodos.

#### Utilidad 5.3 — Score de estabilidad

- media(Sharpe) / std(Sharpe) entre periodos.
- Alto = consistente; bajo = errático.

#### Utilidad 5.4 — Estabilidad de coeficientes entre periodos

- Integración con Fase 3.4: guardar coeficientes de cada ventana temporal.
- ¿Los pesos del modelo son consistentes entre 2022 y 2024? Si sí → señal real estable.

**Prioridad: MEDIA** — Complementa robustez a parámetros (Fase 4) con robustez temporal.

---

### FASE 6 — Detección de régimen de mercado

**Pregunta que responde:** *¿En qué tipo de mercado estamos y qué estrategia conviene?*

**Contexto:** "El secreto de los quants": no un modelo único, sino clasificar el régimen y aplicar la estrategia adecuada.

#### Utilidad 6.1 — Clasificador de régimen

- Clasificar cada ventana de N velas en:
  - **Trending** (tendencia clara)
  - **Ranging** (lateral)
  - **High volatility** (breakouts)
  - **Low volatility** (mercado dormido)
- Basado en features existentes: volatilidad, EMA ratios, dirección de retornos.

#### Utilidad 6.2 — Etiquetado de velas con régimen

- Cada vela del backtest/forward test se etiqueta.
- Filtrar métricas por régimen: "¿cuál es mi Sharpe en trending vs ranging?"

#### Utilidad 6.3 — Estrategia por régimen (multi-strategy)

- Asignar modelos/configuraciones distintas a cada régimen:
  - Trending → modelo agresivo
  - Ranging → reversión a la media
  - High volatility → SGD Classifier
  - Low volatility → HOLD
- Cambios en backtest y en presets de trading.

#### Utilidad 6.4 — Visualización de regímenes en el gráfico

- Colorear fondo del gráfico según régimen detectado.
- Superponer trades → ¿los rentables coinciden con un régimen específico?

**Prioridad: BAJA (alto impacto)** — El cambio más ambicioso. Requiere fases anteriores funcionando.

---

### FASE 7 — Comparativa de presets enfocada en estabilidad

**Pregunta que responde:** *¿Qué preset es más robusto, no cuál gana más?*

#### Utilidad 7.1 — Dashboard comparativo de presets

- Vista lado a lado de N presets con métricas de estabilidad:
  - Sharpe, Max drawdown, Varianza del retorno mensual, Win rate, Consistencia (% meses positivos).
- Ordenar por estabilidad, no por P&L total.

#### Utilidad 7.2 — Ranking automático por robustez

- Score: Sharpe × (1 - maxDrawdown%) × consistencia.
- El "mejor" preset = mejor score compuesto, no más P&L.

**Prioridad: BAJA** — Requiere presets con datos suficientes.

---

## Resumen de fases y prioridades

| Fase | Nombre | Prioridad | Habilita paso | Dependencias |
|------|--------|-----------|---------------|--------------|
| **1** | Panel SIGNAL QUALITY | **ALTA** | Paso 1 | Ninguna |
| **2** | Permutation test | **ALTA** | Paso 2 | Ninguna |
| **3** | Feature importance + estabilidad modelo | **MEDIA-ALTA** | Paso 3 | Ninguna |
| **4** | Robustez a parámetros | **MEDIA** | Paso 4 | Fases 1-2 |
| **5** | Consistencia temporal | **MEDIA** | Paso 5 | Fases 1, 3 |
| **6** | Detección de régimen | **BAJA** | Mejora pasos 3-5 | Fases 1-3 |
| **7** | Comparativa de presets | **BAJA** | Mejora paso 7 | Presets activos |
| **UI** | Pipeline + stepper + semáforos | **ALTA** | Todos los pasos | Fase 1 mínimo |

### Utilidades nuevas incorporadas del feedback

| Utilidad | Fase | Importancia según el feedback |
|----------|------|-------------------------------|
| Conditional return (edge económico) | 1.2 | *"La pieza MÁS importante que falta"* |
| Calibration curve | 1.3 | *"Herramienta favorita de los quants"* |
| Estabilidad de coeficientes | 3.4, 5.4 | *"MUY importante para evitar sobreoptimización"* |

---

## Orden recomendado de implementación

```
FASE 1 (Signal Quality) ──→ FASE 2 (permutation test) ──→ Pipeline UI (stepper + semáforos)
         │
         └──→ FASE 3 (feature importance + estabilidad modelo)
                   │
                   ├──→ FASE 4 (robustez a parámetros)
                   ├──→ FASE 5 (consistencia temporal + estabilidad coefs)
                   │
                   └──→ FASE 6 (régimen) ──→ FASE 7 (comparativa presets)
```

Fases 1 y 2 son independientes y pueden hacerse en paralelo.
Fase 3 se beneficia de tener Fase 1 (para saber si vale la pena analizar features).
Fases 4-7 requieren las anteriores para interpretar resultados.
El Pipeline UI se puede empezar en cuanto Fase 1 esté lista (con los primeros 2 pasos funcionales) e ir añadiendo pasos a medida que las fases se completan.

---

## El panel SIGNAL QUALITY como corazón de la app

El feedback insiste en que todo converja en un único panel. Tras un backtest, lo primero que ves:

```
┌─────────────────────────────────────────────────────────┐
│  SIGNAL QUALITY                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Correlación:    0.034    p-value: 0.008  ✅            │
│  Skill Score:    0.02     [0.01, 0.04] 95% CI          │
│                                                         │
│  Conditional return (BUY):   +0.06%                     │
│  Conditional return (SELL):  -0.04%                     │
│  Costes estimados:           -0.05%                     │
│  Edge neto (BUY):            +0.01%  ⚠️  marginal      │
│                                                         │
│  Calibration:   monotónica ✅                           │
│  Feature top:   local_volatility (42% importancia)      │
│                                                         │
│  VEREDICTO: Señal significativa pero edge marginal.     │
│             Explorar timeframes más largos o filtrar     │
│             por régimen de alta volatilidad.             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

La pregunta deja de ser *"¿cuánto ganó el bot?"* y pasa a ser *"¿existe señal real y es explotable?"*.

---

## Cambio de mentalidad

| Antes | Después |
|-------|---------|
| ¿Cuánto ganó el bot? | ¿Existe señal real? |
| ¿Qué modelo gana más? | ¿Qué señal es más estable? |
| Optimizar parámetros | Buscar zonas robustas |
| Un modelo para todo | Estrategia por régimen |
| Evaluar con P&L | Evaluar con significancia + edge económico |

Ese cambio ya empezó (tenemos correlación, Skill Score). Las 7 fases — especialmente la Fase 1 con el panel Signal Quality — completan la transformación hacia una **plataforma de investigación cuantitativa seria**.
