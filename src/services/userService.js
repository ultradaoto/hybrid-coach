import { prisma } from '../lib/prisma.js';

async function findById(id) {
  return prisma.user.findUnique({ where: { id }, include: { profile: true } });
}

async function findByGoogleId(googleId) {
  return prisma.user.findUnique({ where: { googleId } });
}

async function findOrCreateFromGoogle(profile) {
  // First check if user exists by Google ID
  const existing = await findByGoogleId(profile.id);
  if (existing) {
    // Update role based on current membership status
    const updatedRole = determineUserRole(existing);
    if (existing.role !== updatedRole) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: updatedRole }
      });
      existing.role = updatedRole;
    }
    return existing;
  }

  const email = profile.emails?.[0]?.value ?? null;

  // Check if user exists by email (might have been pre-created)
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    // Update the existing user with the Google ID and role
    const updatedRole = determineUserRole(existingByEmail);
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        googleId: profile.id,
        displayName: profile.displayName,
        role: updatedRole
      },
    });
    return updatedUser;
  }

  // Check if user has Skool membership before allowing account creation
  const membership = await checkSkoolMembership(email);
  
  // Block non-members from creating accounts
  if (!membership && !isLegacyUser(email)) {
    // Throw specific error based on what they might be trying to access
    const errorType = email.includes('coach') || email.includes('ultra') ? 'coach' : 'client';
    throw new Error(`MEMBERSHIP_REQUIRED:${errorType}:${email}`);
  }

  const initialRole = membership || getDefaultRole(email);

  const user = await prisma.user.create({
    data: {
      googleId: profile.id,
      email,
      displayName: profile.displayName,
      role: initialRole,
      isAvailable: initialRole === 'coach' ? false : true, // Coaches start paused
      // If found in Skool, update the appropriate email field
      ...(membership === 'coach' && { skoolUltraEmail: email }),
      ...(membership === 'client' && { skoolVagusEmail: email })
    },
  });

  return user;
}

function determineUserRole(user) {
  const now = new Date();
  
  // Priority 1: Active Ultra Skool membership
  if (user.ultraSubscriptionStatus === 'active') {
    return 'coach';
  }
  
  // Priority 2: Cancelled Ultra but still in grace period
  if (user.ultraSubscriptionStatus === 'cancelled' && 
      user.membershipEndDate && 
      user.membershipEndDate > now) {
    return 'coach'; // But should show warning
  }
  
  // Priority 3: Active Vagus Skool membership
  if (user.vagusSubscriptionStatus === 'active') {
    return 'client';
  }
  
  // Fallback for legacy users
  if (user.email === 'ultradaoto@gmail.com' || user.email === 'percymate2000@gmail.com') {
    return 'coach';
  }
  
  // Default to client
  return 'client';
}

async function checkSkoolMembership(email) {
  // Check if this email exists in any Skool membership records
  // This would require having Skool data already synced
  const ultraMember = await prisma.user.findFirst({
    where: { 
      skoolUltraEmail: email,
      ultraSubscriptionStatus: 'active'
    }
  });

  if (ultraMember) return 'coach';

  const vagusMember = await prisma.user.findFirst({
    where: { 
      skoolVagusEmail: email,
      vagusSubscriptionStatus: 'active'
    }
  });

  if (vagusMember) return 'client';

  return null;
}

function isLegacyUser(email) {
  // Legacy users who are grandfathered in
  return email === 'ultradaoto@gmail.com' || email === 'percymate2000@gmail.com';
}

function getDefaultRole(email) {
  // Legacy role assignment for existing known coaches
  if (isLegacyUser(email)) {
    return 'coach';
  }
  return 'client';
}

async function updateGoogleTokens(userId, tokens) {
  return prisma.user.update({
    where: { id: userId },
    data: { googleTokens: tokens },
  });
}

async function getMembershipWarning(user) {
  const now = new Date();
  
  if (user.ultraSubscriptionStatus === 'cancelled' && 
      user.membershipEndDate && 
      user.membershipEndDate > now &&
      !user.membershipWarningShown) {
    
    const daysLeft = Math.ceil((user.membershipEndDate - now) / (1000 * 60 * 60 * 24));
    
    return {
      show: true,
      message: `Your Ultra Skool membership was cancelled but hasn't expired yet.`,
      daysLeft,
      endDate: user.membershipEndDate,
      ultraUrl: 'https://skool.com/ultra',
      vagusUrl: 'https://skool.com/vagus'
    };
  }
  
  return { show: false };
}

async function markWarningShown(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { membershipWarningShown: true }
  });
}

export default { 
  findById, 
  findOrCreateFromGoogle, 
  updateGoogleTokens, 
  getMembershipWarning,
  markWarningShown,
  determineUserRole
}; 