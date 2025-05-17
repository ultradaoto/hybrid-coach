import { prisma } from '../lib/prisma.js';

async function findById(id) {
  return prisma.user.findUnique({ where: { id }, include: { profile: true } });
}

async function findByGoogleId(googleId) {
  return prisma.user.findUnique({ where: { googleId } });
}

async function findOrCreateFromGoogle(profile) {
  const existing = await findByGoogleId(profile.id);
  if (existing) return existing;

  const email = profile.emails?.[0]?.value ?? null;

  const user = await prisma.user.create({
    data: {
      googleId: profile.id,
      email,
      displayName: profile.displayName,
      role: email === 'ultradaoto@gmail.com' ? 'coach' : 'client',
    },
  });

  return user;
}

export default { findById, findOrCreateFromGoogle }; 