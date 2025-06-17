#!/usr/bin/env node

import { prisma } from './src/lib/prisma.js';

async function checkDatabase() {
  console.log('🔍 Checking database for Skool members...');
  
  try {
    // Check all users with Skool data
    const skoolUsers = await prisma.user.findMany({
      where: {
        OR: [
          { skoolUltraEmail: { not: null } },
          { skoolVagusEmail: { not: null } }
        ]
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        skoolUltraEmail: true,
        skoolVagusEmail: true,
        ultraSubscriptionStatus: true,
        vagusSubscriptionStatus: true,
        lastSkoolSync: true
      },
      orderBy: {
        lastSkoolSync: 'desc'
      }
    });

    console.log(`\n📊 Found ${skoolUsers.length} Skool members in database:\n`);
    
    skoolUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.displayName} (${user.role})`);
      console.log(`   Email: ${user.email}`);
      if (user.skoolUltraEmail) {
        console.log(`   Ultra: ${user.skoolUltraEmail} - ${user.ultraSubscriptionStatus}`);
      }
      if (user.skoolVagusEmail) {
        console.log(`   Vagus: ${user.skoolVagusEmail} - ${user.vagusSubscriptionStatus}`);
      }
      console.log(`   Last Sync: ${user.lastSkoolSync}`);
      console.log('');
    });

    // Check membership history
    const membershipHistory = await prisma.membershipStatusHistory.findMany({
      orderBy: { changeDetectedAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: {
            displayName: true
          }
        }
      }
    });

    console.log(`\n📈 Recent membership status changes (last 10):\n`);
    membershipHistory.forEach((history, index) => {
      console.log(`${index + 1}. ${history.user.displayName} in ${history.community}`);
      console.log(`   Status: ${history.previousStatus || 'new'} → ${history.newStatus}`);
      console.log(`   Date: ${history.changeDetectedAt}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();