-- AlterTable
ALTER TABLE "tb_AlunoBiometriasFaciais" ADD COLUMN     "dsExternalImageId" VARCHAR(100),
ADD COLUMN     "dsSubject" VARCHAR(100),
ALTER COLUMN "anEmbedding" DROP NOT NULL,
ALTER COLUMN "nrDimensoes" DROP NOT NULL;
