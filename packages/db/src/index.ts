import { PrismaClient } from "../generated/prisma";

declare global {
  var prismaClient: PrismaClient | undefined;
}
const prismaClient = globalThis.prismaClient || new PrismaClient();

if (process.env.NODE_ENV !== "production")
  globalThis.prismaClient = prismaClient;

export default prismaClient;
