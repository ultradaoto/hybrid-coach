#!/usr/bin/env node

/**
 * Database Diagnostic Script
 * Helps identify database configuration and connection issues
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkDatabase() {
  console.log('🔍 Database Diagnostic Check\n');
  
  try {
    // Check environment variables
    console.log('📋 Environment Configuration:');
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'}`);
    if (process.env.DATABASE_URL) {
      // Parse URL to show connection details (without password)
      const url = new URL(process.env.DATABASE_URL);
      console.log(`   Host: ${url.hostname}`);
      console.log(`   Port: ${url.port || '5432'}`);
      console.log(`   Database: ${url.pathname.substring(1)}`);
      console.log(`   Username: ${url.username}`);
      console.log(`   SSL: ${url.searchParams.get('sslmode') || 'default'}`);
    }
    console.log('');

    // Test basic connection
    console.log('🔌 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful!\n');

    // Check if our auth tables exist
    console.log('🗄️ Checking authentication tables...');
    
    try {
      const authCodeCount = await prisma.authCode.count();
      console.log(`✅ AuthCode table exists (${authCodeCount} records)`);
    } catch (error) {
      console.log('❌ AuthCode table missing or inaccessible');
      console.log(`   Error: ${error.message}`);
    }

    try {
      const sessionCount = await prisma.userSession.count();
      console.log(`✅ UserSession table exists (${sessionCount} records)`);
    } catch (error) {
      console.log('❌ UserSession table missing or inaccessible');
      console.log(`   Error: ${error.message}`);
    }

    try {
      const rateLimitCount = await prisma.rateLimit.count();
      console.log(`✅ RateLimit table exists (${rateLimitCount} records)`);
    } catch (error) {
      console.log('❌ RateLimit table missing or inaccessible');
      console.log(`   Error: ${error.message}`);
    }

    console.log('');

    // Check existing tables in database
    console.log('📊 All tables in database:');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    tables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.table_name}`);
    });

    console.log('');

    // Database info
    console.log('ℹ️ Database Information:');
    const dbInfo = await prisma.$queryRaw`SELECT version();`;
    console.log(`   PostgreSQL Version: ${dbInfo[0].version.split(' ')[1]}`);

    const dbName = await prisma.$queryRaw`SELECT current_database();`;
    console.log(`   Current Database: ${dbName[0].current_database}`);

    const dbSize = await prisma.$queryRaw`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size;
    `;
    console.log(`   Database Size: ${dbSize[0].size}`);

    console.log('\n✅ Database diagnostic completed successfully!');

  } catch (error) {
    console.error('\n❌ Database diagnostic failed:');
    console.error(`   Error: ${error.message}`);
    
    if (error.message.includes('connect')) {
      console.log('\n💡 Connection troubleshooting:');
      console.log('   1. Check if PostgreSQL is running on your server');
      console.log('   2. Verify DATABASE_URL environment variable');
      console.log('   3. Check firewall settings (port 5432)');
      console.log('   4. Verify database credentials');
    }
    
    if (error.message.includes('does not exist')) {
      console.log('\n💡 Table missing solutions:');
      console.log('   1. Run: npx prisma migrate deploy');
      console.log('   2. Or run: npx prisma db push');
      console.log('   3. Check if migration files exist in prisma/migrations/');
    }

  } finally {
    await prisma.$disconnect();
  }
}

// Also export functions for use in other scripts
export async function checkTablesExist() {
  try {
    await prisma.authCode.findFirst();
    await prisma.userSession.findFirst();
    await prisma.rateLimit.findFirst();
    return true;
  } catch (error) {
    return false;
  }
}

export async function createTablesIfMissing() {
  const tablesExist = await checkTablesExist();
  if (!tablesExist) {
    console.log('🔧 Creating missing tables...');
    await prisma.$executeRawUnsafe(`
      -- Create tables if they don't exist
      CREATE TABLE IF NOT EXISTS "AuthCode" (
        "id" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "skoolUserId" TEXT NOT NULL,
        "skoolUsername" TEXT NOT NULL,
        "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "usedAt" TIMESTAMP(3),
        "usedIpAddress" TEXT,
        "userAgent" TEXT,
        "deviceFingerprint" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT "AuthCode_pkey" PRIMARY KEY ("id")
      );
      
      CREATE UNIQUE INDEX IF NOT EXISTS "AuthCode_code_key" ON "AuthCode"("code");
    `);
    return true;
  }
  return false;
}

// Run diagnostic if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkDatabase().catch(console.error);
}