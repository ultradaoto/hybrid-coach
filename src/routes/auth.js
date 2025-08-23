import { Router } from 'express';
import passport from 'passport';
import { 
    checkSkoolAuth, 
    validateAuthCode, 
    logoutSkoolUser, 
    redirectIfAuthenticated,
    getAuthStatus,
    getClientInfo 
} from '../middlewares/skoolAuthMiddleware.js';
import authService from '../services/authService.js';

const router = Router();

// Apply Skool auth check to all routes
router.use(checkSkoolAuth);

// Handle Skool authentication code validation via query parameter
router.get('/login', redirectIfAuthenticated, async (req, res) => {
    try {
        const { code, error, message } = req.query;
        
        // If there's a code parameter, validate it
        if (code) {
            return await handleCodeValidation(req, res, code);
        }
        
        // Otherwise, show login page
        const authStatus = getAuthStatus(req);

        // Prepare error/success data for template
        let alertData = null;
        if (error && message) {
            alertData = {
                type: 'error',
                title: getErrorTitle(error),
                message: decodeURIComponent(message),
                actionUrl: getErrorActionUrl(error),
                actionText: getErrorActionText(error)
            };
        }

        res.render('login', {
            title: 'Login to MyUltra.Coach',
            ...authStatus,
            error: alertData?.type === 'error' ? alertData.title : null,
            message: alertData?.message || null,
            actionUrl: alertData?.actionUrl || null,
            actionText: alertData?.actionText || null,
            isSkoolAuth: true // Flag to show Skool-specific content
        });

    } catch (error) {
        console.error('❌ Error rendering login page:', error);
        res.status(500).render('error', { 
            title: 'Login Error', 
            message: 'Unable to load login page. Please try again.' 
        });
    }
});

// Helper function to handle code validation
async function handleCodeValidation(req, res, code) {
    try {
        const { ipAddress, userAgent } = getClientInfo(req);

        // Validate the code
        const validation = await authService.validateAuthCode(code, ipAddress, userAgent);
        
        if (!validation.valid) {
            const errorMessage = encodeURIComponent(validation.error);
            return res.redirect(`/login?error=code_validation_failed&message=${errorMessage}`);
        }

        // Create user session
        const session = await authService.createUserSession(code, validation.authData);
        
        // Set secure session cookie
        res.cookie('skoolSessionId', session.sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            domain: process.env.COOKIE_DOMAIN || undefined
        });

        // Redirect to dashboard
        const returnTo = req.session?.returnTo || '/dashboard';
        delete req.session?.returnTo;

        console.log(`🎉 Successful login for ${session.userData.skoolUsername}, redirecting to ${returnTo}`);
        
        res.redirect(`${returnTo}?welcome=true&user=${encodeURIComponent(session.userData.skoolUsername)}`);

    } catch (error) {
        console.error('❌ Error validating auth code:', error);
        const errorMessage = encodeURIComponent('Authentication service error. Please try again.');
        res.redirect(`/login?error=service_error&message=${errorMessage}`);
    }
}

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) {
        // Handle membership requirement errors
        if (err.message.startsWith('MEMBERSHIP_REQUIRED:')) {
          const [, errorType, email] = err.message.split(':');
          
          if (errorType === 'coach') {
            return res.render('login', {
              title: 'Coach Access Required',
              error: 'Coach Access Required',
              message: `No Ultra Skool membership found for ${email}. To become a coach on myultra.coach, you must first register at skool.com/ultra and then return here to login with the same email address.`,
              actionUrl: 'https://skool.com/ultra',
              actionText: 'Join Ultra Skool'
            });
          } else {
            return res.render('login', {
              title: 'Membership Required',
              error: 'Membership Required',
              message: `No Skool membership found for ${email}. You must be a member of either Ultra Skool or Vagus Skool to access this platform. Please join Vagus Skool first.`,
              actionUrl: 'https://skool.com/vagus',
              actionText: 'Join Vagus Skool'
            });
          }
        }
        
        // Other authentication errors
        console.error('Authentication error:', err);
        return res.render('login', {
          title: 'Login Error',
          error: 'Authentication Failed',
          message: 'An error occurred during login. Please try again.'
        });
      }
      
      if (!user) {
        return res.redirect('/auth/login');
      }
      
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect('/auth/login');
        }
        return res.redirect('/dashboard');
      });
    })(req, res, next);
  }
);

// Skool logout (also handles Google logout for compatibility)
router.get('/logout', logoutSkoolUser, (req, res, next) => {
  // Also handle Google logout if user was logged in via Google
  if (req.user) {
    req.logout(err => {
      if (err) return next(err);
      const message = encodeURIComponent('You have been logged out successfully.');
      res.redirect(`/login?message=${message}`);
    });
  } else {
    const message = encodeURIComponent('You have been logged out successfully.');
    res.redirect(`/login?message=${message}`);
  }
});

// Additional API endpoints for Skool auth
router.get('/status', async (req, res) => {
    try {
        const authStatus = getAuthStatus(req);
        
        if (authStatus.isAuthenticated) {
            res.json({
                authenticated: true,
                user: {
                    skoolUserId: authStatus.user.skoolUserId,
                    skoolUsername: authStatus.user.skoolUsername,
                    sessionId: authStatus.user.sessionId,
                    lastActive: authStatus.user.lastActive
                }
            });
        } else {
            res.json({
                authenticated: false,
                redirectUrl: '/auth/login'
            });
        }

    } catch (error) {
        console.error('❌ Error checking auth status:', error);
        res.status(500).json({
            error: 'Unable to check authentication status'
        });
    }
});

/**
 * Helper function to get appropriate error title based on error type
 * @param {string} errorType - Error type from query params
 * @returns {string} Human-readable error title
 */
function getErrorTitle(errorType) {
    const errorTitles = {
        'authentication_required': '🔐 Authentication Required',
        'invalid_code': '❌ Invalid Code',
        'code_validation_failed': '❌ Code Validation Failed',
        'service_error': '⚠️ Service Error',
        'unexpected_error': '❌ Unexpected Error',
        'rate_limit_exceeded': '⏰ Too Many Requests'
    };
    
    return errorTitles[errorType] || '❌ Authentication Error';
}

/**
 * Helper function to get action URL for error types that need user action
 * @param {string} errorType - Error type from query params
 * @returns {string|null} Action URL or null
 */
function getErrorActionUrl(errorType) {
    const actionUrls = {
        'authentication_required': 'https://www.skool.com/@my-ultra-coach-6588',
        'invalid_code': 'https://www.skool.com/@my-ultra-coach-6588',
        'code_validation_failed': 'https://www.skool.com/@my-ultra-coach-6588'
    };
    
    return actionUrls[errorType] || null;
}

/**
 * Helper function to get action text for error types that need user action
 * @param {string} errorType - Error type from query params
 * @returns {string|null} Action text or null
 */
function getErrorActionText(errorType) {
    const actionTexts = {
        'authentication_required': '📱 DM @MyUltraCoach on Skool',
        'invalid_code': '📱 Request New Code',
        'code_validation_failed': '📱 Get Fresh Code'
    };
    
    return actionTexts[errorType] || null;
}

export default router;
