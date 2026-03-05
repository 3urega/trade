# Crypto Trading Simulator

Simulador de trading crypto con backtesting y análisis de mercado.

## Requisitos

- **Node.js** ≥ 20
- **pnpm** ≥ 10
- **Docker** y **Docker Compose** (para PostgreSQL)

## Arrancar el proyecto en local

### 1. Instalar dependencias

En la raíz del repositorio:

```bash
pnpm install
```

### 2. Variables de entorno

Copia el ejemplo y ajusta los valores (sobre todo la contraseña):

```bash
cp .env.example .env
```

Edita `.env`. Las variables que usa el proyecto son:

| Variable         | Descripción                          | Ejemplo                    |
|------------------|--------------------------------------|----------------------------|
| `POSTGRES_USER`  | Usuario de PostgreSQL                | `crypto_user`              |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL         | (elige una segura)         |
| `POSTGRES_DB`    | Nombre de la base de datos           | `crypto_simulator`         |
| `POSTGRES_PORT`  | Puerto de PostgreSQL en el host      | `5433`                     |
| `DATABASE_URL`   | URL de conexión (mismo user/pass/db)  | `postgresql://...`         |
| `PORT`           | Puerto del backend                   | `3000`                     |
| `FRONTEND_URL`   | URL del frontend (CORS)              | `http://localhost:5173`    |

### 3. Arrancar todo

```bash
pnpm run dev
```

Este comando:

1. Levanta Docker Compose en segundo plano (PostgreSQL + Adminer).
2. Inicia el backend (NestJS) en modo desarrollo.
3. Inicia el frontend (Vite + React).

**URLs:**

- **Frontend:** http://localhost:5173  
- **Backend:** http://localhost:3000  
- **Adminer (gestor DB):** http://localhost:8080  

### Arrancar por partes

- Solo Docker (PostgreSQL + Adminer): `pnpm run docker:up`
- Solo backend: `pnpm run dev:backend` (requiere Docker levantado)
- Solo frontend: `pnpm run dev:frontend`

---

## Base de datos y migraciones

### Conectar con DBeaver

1. Asegúrate de que los contenedores estén levantados: `pnpm run docker:up`
2. Crea una nueva conexión **PostgreSQL** con:

| Campo      | Valor                          |
|------------|---------------------------------|
| Host       | `localhost`                     |
| Port       | El de `POSTGRES_PORT` en `.env` (ej. `5433`) |
| Database   | El de `POSTGRES_DB` (ej. `crypto_simulator`) |
| Username   | El de `POSTGRES_USER` (ej. `crypto_user`)   |
| Password   | El de `POSTGRES_PASSWORD` en tu `.env`      |

3. SSL: desactivado (desarrollo local).

### Ejecutar migraciones

Las migraciones crean/actualizan las tablas en PostgreSQL. **Hay que ejecutarlas después de levantar Docker** (o cuando la base esté vacía).

1. **Compilar el backend** (el script de migración usa los archivos en `dist/`):

   ```bash
   pnpm run build:backend
   ```

2. **Ejecutar migraciones:**

   ```bash
   pnpm run migration:run
   ```

Si ves algo como *"Migration InitialSchema... has been executed"*, las tablas (`wallets`, `trades`, `market_snapshots`, etc.) ya están creadas.

### Si al reiniciar Docker no ves tablas

Si usaste **`docker compose down -v`**, la opción `-v` **borra los volúmenes**, incluido el de PostgreSQL. La base vuelve a estar vacía.

- **Para no perder datos:** para los contenedores sin `-v`:
  ```bash
  docker compose down
  ```
- **Si la base ya está vacía:** vuelve a levantar Docker y a ejecutar las migraciones:
  ```bash
  pnpm run docker:up
  pnpm run build:backend
  pnpm run migration:run
  ```

### Revertir la última migración

```bash
pnpm run migration:revert
```

---

## Scripts disponibles

| Script              | Descripción                                      |
|---------------------|--------------------------------------------------|
| `pnpm run dev`      | Docker + backend + frontend en modo desarrollo   |
| `pnpm run docker:up`   | Levanta PostgreSQL y Adminer                  |
| `pnpm run docker:down` | Para los contenedores (sin borrar volúmenes)  |
| `pnpm run docker:logs` | Ver logs de los contenedores                  |
| `pnpm run dev:backend`  | Solo backend (modo watch)                    |
| `pnpm run dev:frontend` | Solo frontend (Vite)                        |
| `pnpm run build`       | Compila backend y frontend                   |
| `pnpm run build:backend`  | Compila solo el backend                    |
| `pnpm run build:frontend` | Compila solo el frontend                   |
| `pnpm run migration:run`   | Ejecuta migraciones pendientes              |
| `pnpm run migration:revert`| Revierte la última migración                |
| `pnpm run lint`      | Lint en todos los paquetes                      |

---

## Estructura del proyecto

- **`backend/`** — API NestJS, TypeORM, PostgreSQL, WebSockets
- **`frontend/`** — App React + Vite + Tailwind
- **`docker/`** — Configuración de PostgreSQL (init scripts, extensiones pgvector/uuid-ossp)
