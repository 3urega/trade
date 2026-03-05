# Frontend: qué hay ahora y próximos pasos

## Simulado vs Binance (qué es real y qué no)

| Dónde | Qué es simulado | Qué viene de Binance |
|-------|------------------|------------------------|
| **Bot automático** (cada 5 s) | Qué par (BTC/ETH/SOL), BUY o SELL, y la cantidad. Es decir: *cuándo* y *qué* opera. | **Precio de ejecución** del trade. Se pide en ese momento a Binance (`ticker/price`). |
| **Portfolio** (valor total, P&L) | Nada. | **Precio actual** de cada moneda que tengas en el wallet para valorar en USDT. |
| **Trade manual** (POST /v1/trades sin `price`) | Nada. | **Precio de ejecución** en el momento de la petición. |
| **Gráfico del frontend** | Nada. | Los puntos del gráfico son los precios a los que se **ejecutaron** los trades (que ya son de Binance). |

**Resumen:** Lo único “inventado” es la *decisión* del bot (par, tipo, cantidad). Todos los **precios** (trades del bot, valor del portfolio, trades manuales) vienen de Binance. Si Binance no responde, el bot no ejecuta ese tick; el portfolio pondría 0 para esa moneda.

---

## Lo que estás viendo (features ya usables)

### 1. Header
- **CryptoSim** + “Paper Trading Simulator”
- **Estado WebSocket**: punto verde “Live” cuando está conectado, amarillo “connecting”, rojo “error”

### 2. Sidebar – Portfolio
- **Total Value**: valor total del portfolio en USDT (precios actuales Binance).
- **P&L**: beneficio/pérdida en $ y en % (vs saldo inicial 10k USDT).
- **Balances**: lista de monedas con cantidad (USDT con 2 decimales, cripto con 6).
- **Wallet ID**: abajo, los primeros 8 caracteres del UUID del wallet de simulación.

### 3. Zona principal
- **Pestañas de par**: BTC/USDT, ETH/USDT, SOL/USDT para cambiar el gráfico.
- **Gráfico de precios**: línea con el **precio de ejecución** de cada trade de ese par (Lightweight Charts). No es ticker en vivo, son los precios a los que se ejecutaron los trades.
- **Recent Trades**: tabla con Time, Pair, Type (BUY/SELL), Amount, Price, Total; las ~30 más recientes, ordenadas por fecha.

### 4. Comportamiento en tiempo real
- El **SimulationService** del backend ejecuta un trade aleatorio (BUY o SELL en BTC/ETH/SOL) cada **5 segundos** usando el **precio actual de Binance** para ese par.
- Cada nuevo trade llega por WebSocket (`trade_executed`) y se añade a la lista y se refresca el portfolio.
- El gráfico se actualiza con cada nuevo trade del par seleccionado.

### 5. Descubrimiento del wallet
- Si no hay `sim_wallet_id` en localStorage, el frontend hace polling a `GET /v1/trades?limit=1` hasta que exista al menos un trade y toma el `walletId` de ese trade, lo guarda y lo usa para portfolio y trades.

---

## Lo que existe en backend/API pero no se usa en la UI

| Recurso | Uso actual |
|--------|------------|
| **POST /v1/wallets** | Crear wallet (ownerId, initialUsdtBalance). No hay pantalla ni formulario. |
| **POST /v1/trades** | Ejecutar un trade manual (walletId, par, tipo, cantidad, precio opcional). En el frontend existe `executeTrade()` en `api.ts` pero **no hay botón ni formulario**. |
| **WebSocket `portfolio_update`** | El gateway tiene `emitPortfolioUpdate()` pero **nadie lo llama** en el backend. |
| **WebSocket `price_update`** | El gateway tiene `emitPriceUpdate()` pero **nadie lo llama**. Podría usarse para precios en vivo en el gráfico. |

---

## Propuesta de siguientes pasos (orden sugerido)

### 1. Trade manual (rápido y muy útil)
- **Qué**: formulario o panel “Execute trade”: par (BTC/ETH/SOL), BUY/SELL, cantidad; opcionalmente precio (si no se envía, el backend usa precio de mercado).
- **Dónde**: sidebar o modal; reutilizar `executeTrade()` de `api.ts`.
- **Por qué**: ya tienes la API y el tipo; solo falta la UI. El usuario puede probar trades a mano además del bot.

### 2. Crear wallet desde la UI
- **Qué**: pantalla o modal “New wallet”: campo `ownerId` (ej. “mi-user”) y opcionalmente saldo inicial USDT. Al crear, guardar el `walletId` y usarlo como “wallet activo”.
- **Dónde**: por ejemplo un botón “Create wallet” en el header o sidebar que abra el modal.
- **Por qué**: evita depender solo del wallet del simulation-bot y del truco de “primer trade”; útil para multi-usuario o pruebas.

### 3. Elegir wallet activo / listar wallets
- **Qué**: si añades **GET /v1/wallets** (lista de wallets, o al menos el “activo”), un desplegable o lista para cambiar de wallet. El portfolio y la lista de trades se filtrarían por el wallet seleccionado.
- **Alternativa**: sin nuevo endpoint, un campo “Wallet ID” editable que, al cambiar, recargue portfolio y trades para ese ID (útil para pegar un UUID de DBeaver o de Swagger).

### 4. Gráfico con precios en vivo (opcional)
- **Qué**: el backend podría emitir `price_update` periódicamente (p. ej. desde Binance cada X segundos para BTC/ETH/SOL). El frontend ya tiene `onPriceUpdate()` en `socket.ts`; podrías alimentar una segunda serie en el chart (precio en vivo) además de la línea de precios de ejecución de trades.
- **Por qué**: diferencia clara entre “precio de mercado en tiempo real” y “precios a los que se ejecutaron tus trades”.

### 5. Seed script (ya comentado)
- **Qué**: `pnpm run seed` que cree 1 wallet de prueba y, opcionalmente, varios trades de ejemplo.
- **Por qué**: bases de datos limpias o nuevos entornos listos para probar sin esperar al simulation-bot.

### 6. Pequeñas mejoras UX
- **Trades**: “Load more” o paginación (el backend ya tiene `limit`/`offset`).
- **Filtros**: filtrar la tabla por par o por tipo (BUY/SELL).
- **Reset simulación**: botón “Usar wallet del bot” que borre `sim_wallet_id` del localStorage y fuerce redescubrir (o que llame a un endpoint que devuelva el wallet del simulation-bot si lo expones).

---

## Resumen una frase

**Ahora mismo**: ves portfolio (valor, P&L, balances), gráfico por par basado en precios de trades, lista de trades en vivo y estado WebSocket; todo atado al wallet del simulation-bot.  
**Siguiente paso más rentable**: añadir **trade manual** en la UI (formulario que llame a `POST /v1/trades` con la función que ya tienes en `api.ts`).
