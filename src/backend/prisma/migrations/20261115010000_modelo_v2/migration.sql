-- CreateEnum
CREATE TYPE "SistemaRiego" AS ENUM ('TEMPORAL', 'GRAVEDAD', 'ASPERSION', 'GOTEO');

-- CreateEnum
CREATE TYPE "TipoSuelo" AS ENUM ('ARCILLOSO', 'ARENOSO', 'FRANCO', 'SATELITAL');

-- CreateEnum
CREATE TYPE "TipoCapa" AS ENUM ('TEMPERATURA', 'HUMEDAD', 'LLUVIA', 'SEQUIA', 'VULNERABILIDAD');

-- CreateEnum
CREATE TYPE "TipoPunto" AS ENUM ('ESTRES');

-- CreateEnum
CREATE TYPE "Severidad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- AlterTable
ALTER TABLE "Parcela" ADD COLUMN     "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "areaHa" DOUBLE PRECISION,
ADD COLUMN     "claveIdempotencia" VARCHAR(80),
ADD COLUMN     "cultivoActual" VARCHAR(40),
ADD COLUMN     "descripcion" VARCHAR(500),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Preferencias" DROP COLUMN "prioridad",
DROP COLUMN "riego",
ADD COLUMN     "mesesVaciosDesde" INTEGER,
ADD COLUMN     "mesesVaciosHasta" INTEGER,
ADD COLUMN     "prioridadAgua" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "prioridadErosion" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "prioridadIngreso" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "prioridadSuelo" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "sistemaRiego" "SistemaRiego" NOT NULL DEFAULT 'TEMPORAL',
ADD COLUMN     "tipoSuelo" "TipoSuelo" NOT NULL DEFAULT 'SATELITAL';

-- DropEnum
DROP TYPE "Prioridad";

-- CreateTable
CREATE TABLE "HistorialParcela" (
    "id" UUID NOT NULL,
    "parcelaId" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "cultivo" VARCHAR(40) NOT NULL,
    "fechaSiembra" DATE,
    "descripcion" VARCHAR(1000),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistorialParcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionPrediccion" (
    "id" UUID NOT NULL,
    "version" VARCHAR(80) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "generadaEn" TIMESTAMP(3) NOT NULL,
    "importadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datosAl" DATE NOT NULL,
    "zona" JSONB NOT NULL,
    "modelos" JSONB NOT NULL,
    "limitaciones" TEXT[],
    "huella" VARCHAR(64) NOT NULL,

    CONSTRAINT "VersionPrediccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapaMapa" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "tipo" "TipoCapa" NOT NULL,
    "concepto" VARCHAR(10) NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "variable" VARCHAR(400) NOT NULL,
    "unidad" VARCHAR(20) NOT NULL,
    "min" DOUBLE PRECISION NOT NULL,
    "max" DOUBLE PRECISION NOT NULL,
    "rampa" JSONB NOT NULL,
    "leyenda" TEXT[],
    "bboxOeste" DOUBLE PRECISION NOT NULL,
    "bboxSur" DOUBLE PRECISION NOT NULL,
    "bboxEste" DOUBLE PRECISION NOT NULL,
    "bboxNorte" DOUBLE PRECISION NOT NULL,
    "columnas" INTEGER NOT NULL,
    "filas" INTEGER NOT NULL,
    "escenarioAplica" BOOLEAN NOT NULL,
    "fuente" TEXT NOT NULL,
    "resolucionM" INTEGER NOT NULL,
    "interpolada" BOOLEAN NOT NULL,
    "datosAl" DATE NOT NULL,
    "notas" TEXT[],

    CONSTRAINT "CapaMapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscenarioCapa" (
    "id" UUID NOT NULL,
    "capaId" UUID NOT NULL,
    "lluviaPct" INTEGER NOT NULL,
    "tempDeltaC" DOUBLE PRECISION NOT NULL,
    "valores" JSONB NOT NULL,

    CONSTRAINT "EscenarioCapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConjuntoPuntos" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "tipo" "TipoPunto" NOT NULL,
    "concepto" VARCHAR(10) NOT NULL,
    "fuente" TEXT NOT NULL,
    "datosAl" DATE NOT NULL,
    "unidad" TEXT,
    "notas" TEXT[],

    CONSTRAINT "ConjuntoPuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntoMapa" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "tipo" "TipoPunto" NOT NULL,
    "geom" geometry(Point, 4326) NOT NULL,
    "etiqueta" TEXT,
    "severidad" "Severidad",
    "valor" DOUBLE PRECISION,

    CONSTRAINT "PuntoMapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieDato" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "titulo" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "concepto" VARCHAR(10),
    "etiquetaA" TEXT,
    "etiquetaB" TEXT,
    "notas" TEXT[],
    "puntos" JSONB NOT NULL,

    CONSTRAINT "SerieDato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TablaModelo" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "clave" VARCHAR(40) NOT NULL,
    "concepto" VARCHAR(10) NOT NULL,
    "titulo" TEXT NOT NULL,
    "unidad" TEXT,
    "datosAl" DATE,
    "notas" TEXT[],
    "filas" JSONB NOT NULL,

    CONSTRAINT "TablaModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaMapa" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "titulo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "definicion" TEXT NOT NULL,
    "concepto" VARCHAR(10) NOT NULL,
    "datosAl" DATE NOT NULL,

    CONSTRAINT "AlertaMapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumenModelo" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "humedad" JSONB,
    "clima" JSONB,
    "noDisponible" TEXT[],

    CONSTRAINT "ResumenModelo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HistorialParcela_parcelaId_anio_key" ON "HistorialParcela"("parcelaId", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "VersionPrediccion_version_key" ON "VersionPrediccion"("version");

-- CreateIndex
CREATE INDEX "VersionPrediccion_activa_idx" ON "VersionPrediccion"("activa");

-- CreateIndex
CREATE UNIQUE INDEX "CapaMapa_versionId_tipo_key" ON "CapaMapa"("versionId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "EscenarioCapa_capaId_lluviaPct_tempDeltaC_key" ON "EscenarioCapa"("capaId", "lluviaPct", "tempDeltaC");

-- CreateIndex
CREATE UNIQUE INDEX "ConjuntoPuntos_versionId_tipo_key" ON "ConjuntoPuntos"("versionId", "tipo");

-- CreateIndex
CREATE INDEX "PuntoMapa_geom_idx" ON "PuntoMapa" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "PuntoMapa_versionId_clave_key" ON "PuntoMapa"("versionId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "SerieDato_versionId_clave_key" ON "SerieDato"("versionId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "TablaModelo_versionId_clave_key" ON "TablaModelo"("versionId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "AlertaMapa_versionId_tipo_key" ON "AlertaMapa"("versionId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ResumenModelo_versionId_key" ON "ResumenModelo"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Parcela_claveIdempotencia_key" ON "Parcela"("claveIdempotencia");

-- AddForeignKey
ALTER TABLE "HistorialParcela" ADD CONSTRAINT "HistorialParcela_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaMapa" ADD CONSTRAINT "CapaMapa_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VersionPrediccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscenarioCapa" ADD CONSTRAINT "EscenarioCapa_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CapaMapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConjuntoPuntos" ADD CONSTRAINT "ConjuntoPuntos_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VersionPrediccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntoMapa" ADD CONSTRAINT "PuntoMapa_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VersionPrediccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieDato" ADD CONSTRAINT "SerieDato_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VersionPrediccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TablaModelo" ADD CONSTRAINT "TablaModelo_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VersionPrediccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaMapa" ADD CONSTRAINT "AlertaMapa_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VersionPrediccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumenModelo" ADD CONSTRAINT "ResumenModelo_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VersionPrediccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Solo una versión de predicciones puede estar activa a la vez. Prisma no expresa índices únicos parciales,
-- por eso va a mano aquí (y se documenta en docs/modelo-datos.md).
CREATE UNIQUE INDEX "VersionPrediccion_una_activa" ON "VersionPrediccion" ("activa") WHERE "activa";
