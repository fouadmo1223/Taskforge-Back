/**
 * One-off script to grant the platform-admin flag to an existing user by email.
 * There is deliberately no API endpoint that can do this to a fresh account — the
 * very first platform admin has to be created this way.
 *
 *   pnpm --filter @flowdesk/api exec tsx src/database/bootstrap-admin.ts someone@example.com
 *
 * Requires MONGODB_URI in the environment (loaded from .env via dotenv/config).
 */
import 'dotenv/config';
import mongoose from 'mongoose';

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) {
    console.error('Usage: tsx src/database/bootstrap-admin.ts <email>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(uri);

  const users = mongoose.connection.db!.collection('users');
  const user = await users.findOne({ email });
  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  await users.updateOne({ _id: user._id }, { $set: { isPlatformAdmin: true } });
  console.log(`✓ ${user.name} <${email}> is now a platform admin.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
