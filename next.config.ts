import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-mariadb", "mariadb", "bcryptjs"],
};

export default nextConfig;
