-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('AGUA', 'SUELO', 'INGRESO', 'BALANCE');

-- CreateTable
CREATE TABLE "Parcela" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(120),
    "geom" geometry(Geometry, 4326) NOT NULL,
    "centroideLat" DOUBLE PRECISION NOT NULL,
    "centroideLon" DOUBLE PRECISION NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preferencias" (
    "id" UUID NOT NULL,
    "parcelaId" UUID NOT NULL,
    "riego" BOOLEAN NOT NULL,
    "aguaRiegoMm" DOUBLE PRECISION,
    "maquinaria" TEXT[],
    "cultivosPreferidos" TEXT[],
    "cultivosExcluidos" TEXT[],
    "prioridad" "Prioridad" NOT NULL DEFAULT 'BALANCE',
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preferencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escenario" (
    "id" UUID NOT NULL,
    "parcelaId" UUID NOT NULL,
    "nombre" VARCHAR(120),
    "lluviaPct" INTEGER NOT NULL,
    "tempDeltaC" DOUBLE PRECISION NOT NULL,
    "resultado" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheDatos" (
    "id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "respuesta" JSONB NOT NULL,
    "obtenidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3),

    CONSTRAINT "CacheDatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cultivo" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "familiaBotanica" VARCHAR(60) NOT NULL,
    "parametros" JSONB,
    "fuente" TEXT,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cultivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Parcela_geom_idx" ON "Parcela" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "Preferencias_parcelaId_key" ON "Preferencias"("parcelaId");

-- CreateIndex
CREATE INDEX "Escenario_parcelaId_creadoEn_idx" ON "Escenario"("parcelaId", "creadoEn");

-- CreateIndex
CREATE INDEX "CacheDatos_expiraEn_idx" ON "CacheDatos"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "CacheDatos_clave_fuente_key" ON "CacheDatos"("clave", "fuente");

-- CreateIndex
CREATE UNIQUE INDEX "Cultivo_codigo_key" ON "Cultivo"("codigo");

-- AddForeignKey
ALTER TABLE "Preferencias" ADD CONSTRAINT "Preferencias_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escenario" ADD CONSTRAINT "Escenario_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id") ON DELETE CASCADE ON UPDATE CASCADE;

