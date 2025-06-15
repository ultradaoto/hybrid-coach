import { prisma } from '../lib/prisma.js';
import SkoolBrowserService from './skoolBrowserService.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [SKOOL-MONITOR] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/skool-monitoring.log' })
  ],
});

class SkoolMonitoringService {
  constructor() {
    this.browserService = new SkoolBrowserService();
  }

  async performDailySync() {
    logger.info('Starting daily Skool membership sync...');
    const startTime = Date.now();

    try {
      // Initialize browser
      const browserInitialized = await this.browserService.initialize();
      if (!browserInitialized) {
        throw new Error('Failed to initialize browser service');
      }

      // Login to Skool
      const loginSuccess = await this.browserService.loginToSkool();
      if (!loginSuccess) {
        throw new Error('Failed to login to Skool');
      }

      // Sync both communities
      const ultraResults = await this.syncCommunity('ultra');
      const vagusResults = await this.syncCommunity('vagus');

      // Update user roles based on membership status
      await this.updateUserRoles();

      const duration = Date.now() - startTime;
      logger.info(`Daily sync completed successfully in ${duration}ms`);

      return {
        success: true,
        duration,
        ultra: ultraResults,
        vagus: vagusResults
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Daily sync failed after ${duration}ms: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        duration
      };
    } finally {
      await this.browserService.close();
    }
  }

  async syncCommunity(community) {
    logger.info(`Starting sync for ${community} community...`);
    const startTime = Date.now();

    try {
      // Navigate to member list
      const navSuccess = await this.browserService.navigateToMembersList(community);
      if (!navSuccess) {
        throw new Error(`Failed to navigate to ${community} members list`);
      }

      // Extract member data (limit to 5 for testing both communities)
      const limit = 5; // Limit both communities for testing
      const members = await this.browserService.extractMembersList(community, limit);
      logger.info(`Extracted ${members.length} members from ${community}`);

      // Process members and update database
      const changes = await this.processMemberUpdates(members, community);

      // Log sync results
      await this.logSyncResults(community, members.length, changes, Date.now() - startTime, true);

      logger.info(`${community} sync completed successfully`);
      return {
        success: true,
        membersFound: members.length,
        changes
      };

    } catch (error) {
      logger.error(`${community} sync failed: ${error.message}`);
      
      // Log failed sync
      await this.logSyncResults(community, 0, {}, Date.now() - startTime, false, error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processMemberUpdates(members, community) {
    const changes = {
      newMembers: 0,
      statusChanges: 0,
      emailMappings: 0
    };

    for (const member of members) {
      try {
        if (!member.email || !member.email.includes('@')) {
          logger.warn(`Skipping member with invalid email: ${member.name}`);
          continue;
        }

        // Find user by email (try both Google auth email and Skool-specific emails)
        let user = await this.findUserByEmail(member.email, community);
        
        if (!user) {
          // Try to find by name if email doesn't match
          const potentialUsers = await prisma.user.findMany({
            where: {
              OR: [
                { displayName: { contains: member.name, mode: 'insensitive' } },
                { coachName: { contains: member.name, mode: 'insensitive' } }
              ]
            }
          });

          if (potentialUsers.length === 1) {
            user = potentialUsers[0];
            logger.info(`Mapped ${member.name} (${member.email}) to existing user ${user.email}`);
            changes.emailMappings++;
          }
        }

        if (user) {
          // Update existing user's membership status
          await this.updateUserMembership(user, member, community);
          changes.statusChanges++;
        } else {
          // Create new user record for Skool member
          try {
            await this.createSkoolUser(member, community);
            logger.info(`Created new user record for: ${member.name} (${member.email}) in ${community}`);
            changes.newMembers++;
          } catch (createError) {
            logger.error(`Failed to create user for ${member.name}: ${createError.message}`);
            logger.info(`Unmatched member: ${member.name} (${member.email}) in ${community}`);
          }
        }

      } catch (error) {
        logger.error(`Failed to process member ${member.name}: ${error.message}`);
      }
    }

    return changes;
  }

  async findUserByEmail(email, community) {
    const emailField = community === 'ultra' ? 'skoolUltraEmail' : 'skoolVagusEmail';
    
    // First try exact match on Skool-specific email
    let user = await prisma.user.findFirst({
      where: { [emailField]: email }
    });

    if (!user) {
      // Try Google auth email
      user = await prisma.user.findUnique({
        where: { email }
      });
    }

    return user;
  }

  async updateUserMembership(user, memberData, community) {
    const updateData = {
      lastSkoolSync: new Date()
    };

    // Update community-specific data
    if (community === 'ultra') {
      updateData.skoolUltraEmail = memberData.email;
      updateData.ultraSubscriptionStatus = memberData.subscriptionStatus;
    } else {
      updateData.skoolVagusEmail = memberData.email;
      updateData.vagusSubscriptionStatus = memberData.subscriptionStatus;
    }

    // Set membership end date for cancelled subscriptions
    if (memberData.subscriptionStatus === 'cancelled' && memberData.churnDate) {
      updateData.membershipEndDate = memberData.churnDate;
    } else if (memberData.subscriptionStatus === 'active' && memberData.renewalDate) {
      updateData.membershipEndDate = memberData.renewalDate;
    }

    // Check if status changed
    const currentStatus = community === 'ultra' ? user.ultraSubscriptionStatus : user.vagusSubscriptionStatus;
    
    if (currentStatus !== memberData.subscriptionStatus) {
      logger.info(`Status change for ${user.email}: ${currentStatus} -> ${memberData.subscriptionStatus} in ${community}`);
      
      // Log status change
      await prisma.membershipStatusHistory.create({
        data: {
          userId: user.id,
          community,
          previousStatus: currentStatus,
          newStatus: memberData.subscriptionStatus
        }
      });
    }

    // Update user record
    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });
  }

  async createSkoolUser(memberData, community) {
    // Generate a unique googleId for Skool-only users
    const skoolGoogleId = `skool_${community}_${memberData.handle.replace(/[@\/\-\?]/g, '_')}`;
    
    // Extract email - try to get a real email if possible, otherwise use Skool handle
    let email = memberData.email;
    if (!email || !email.includes('@') || email.includes('@skool.com')) {
      // If no real email, create a placeholder
      const cleanHandle = memberData.handle.replace(/[@\/\-\?]/g, '');
      email = `${cleanHandle}@placeholder.skool`;
    }
    
    const userData = {
      googleId: skoolGoogleId,
      email: email,
      displayName: memberData.name,
      role: this.determineRoleFromCommunity(community, memberData.subscriptionStatus),
      isAvailable: false, // Default to 'paused' for new coaches
      lastSkoolSync: new Date(),
      membershipEndDate: memberData.churnDate || memberData.renewalDate || null
    };

    // Set community-specific data
    if (community === 'ultra') {
      userData.skoolUltraEmail = memberData.email;
      userData.ultraSubscriptionStatus = memberData.subscriptionStatus;
    } else {
      userData.skoolVagusEmail = memberData.email;
      userData.vagusSubscriptionStatus = memberData.subscriptionStatus;
    }

    const newUser = await prisma.user.create({
      data: userData
    });

    // Log membership status history
    await prisma.membershipStatusHistory.create({
      data: {
        userId: newUser.id,
        community,
        previousStatus: null,
        newStatus: memberData.subscriptionStatus
      }
    });

    return newUser;
  }

  determineRoleFromCommunity(community, subscriptionStatus) {
    if (community === 'ultra' && subscriptionStatus === 'active') {
      return 'coach';
    } else if (community === 'vagus' && subscriptionStatus === 'active') {
      return 'client';
    }
    return 'client'; // Default
  }

  async updateUserRoles() {
    logger.info('Updating user roles based on membership status...');

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { ultraSubscriptionStatus: { not: null } },
          { vagusSubscriptionStatus: { not: null } }
        ]
      }
    });

    let roleUpdates = 0;

    for (const user of users) {
      const newRole = this.determineUserRole(user);
      
      if (user.role !== newRole) {
        await prisma.user.update({
          where: { id: user.id },
          data: { 
            role: newRole,
            membershipWarningShown: false // Reset warning when role changes
          }
        });

        logger.info(`Updated role for ${user.email}: ${user.role} -> ${newRole}`);
        roleUpdates++;
      }
    }

    logger.info(`Updated ${roleUpdates} user roles`);
  }

  determineUserRole(user) {
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
    
    // No valid membership
    return 'client'; // Default to client instead of blocked for now
  }

  async logSyncResults(community, membersFound, changes, duration, success, errorMessage = null) {
    try {
      await prisma.skoolMonitoringLog.create({
        data: {
          community,
          membersFound,
          newMembers: changes.newMembers || 0,
          cancelledMembers: changes.statusChanges || 0,
          syncDurationMs: duration,
          success,
          errorMessage
        }
      });
    } catch (error) {
      logger.error(`Failed to log sync results: ${error.message}`);
    }
  }

  async getMembershipStatus(userEmail) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: userEmail }
      });

      if (!user) {
        return null;
      }

      return {
        role: this.determineUserRole(user),
        ultraStatus: user.ultraSubscriptionStatus,
        vagusStatus: user.vagusSubscriptionStatus,
        membershipEndDate: user.membershipEndDate,
        needsWarning: this.needsRenewalWarning(user),
        lastSync: user.lastSkoolSync
      };
    } catch (error) {
      logger.error(`Failed to get membership status for ${userEmail}: ${error.message}`);
      return null;
    }
  }

  needsRenewalWarning(user) {
    const now = new Date();
    
    return user.ultraSubscriptionStatus === 'cancelled' && 
           user.membershipEndDate && 
           user.membershipEndDate > now &&
           !user.membershipWarningShown;
  }

  async markWarningShown(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { membershipWarningShown: true }
    });
  }
}

export default SkoolMonitoringService;