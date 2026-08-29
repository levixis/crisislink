// Lazy env accessors. Deliberately not evaluated at module load so that
// `next build` doesn't fail on a machine without a database configured.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const getDatabaseUrl = () => required("DATABASE_URL");
export const getJwtSecret = () => new TextEncoder().encode(required("JWT_SECRET"));
export const getCronSecret = () => process.env.CRON_SECRET ?? null;
