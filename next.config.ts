import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-mariadb", "mariadb", "bcryptjs"],
};

export default nextConfig;
