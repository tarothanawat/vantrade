/*
  Warnings:

  - A unique constraint covering the columns `[userId,label]` on the table `ApiKey` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `side` on the `TradeLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('buy', 'sell', 'hold');

-- DropIndex
DROP INDEX "ApiKey_userId_key";

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "label" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "TradeLog" DROP COLUMN "side",
ADD COLUMN     "side" "TradeSide" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_label_key" ON "ApiKey"("userId", "label");
