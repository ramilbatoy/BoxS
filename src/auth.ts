import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { system } from "@/repositories/system";
import { rateLimit } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        const limit = rateLimit(`login:${email}`, 10, 60_000);
        if (!limit.ok) return null;
        const user = await system.userByEmail(email);
        if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;
        const matches = await bcrypt.compare(password, user.passwordHash);
        if (!matches) return null;
        await system.updateUser(user.id, { lastLoginAt: new Date() });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role.slug,
          permissions: user.role.permissions.map((item) => item.permission.key),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.permissions = user.permissions;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.user.role = String(token.role ?? "");
      session.user.permissions = Array.isArray(token.permissions) ? token.permissions.map(String) : [];
      return session;
    },
  },
});
