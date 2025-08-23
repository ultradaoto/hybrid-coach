import { Router } from 'express';
import authService from '../services/authService.js';
import { 
    checkSkoolAuth, 
    validateAuthCode, 
    logoutSkoolUser, 
    redirectIfAuthenticated,
    getAuthStatus,
    getClientInfo 
} from '../middlewares/skoolAuthMiddleware.js';

const router = Router();

/**
 * Skool Authentication Routes
 * Handles the complete Skool-based authentication flow
 */

// Apply Skool auth check to all routes
router.use(checkSkoolAuth);

/**
 * GET /login - Main login page with Skool authentication instructions
 */
router.get('/login', redirectIfAuthenticated, async (req, res) => {
    try {
        const { error, message } = req.query;
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

/**
 * GET /login/:code - Handle authentication code validation and login
 */
router.get('/login/:code', validateAuthCode, async (req, res) => {
    try {
        // If we get here, the code was valid and session was created
        const authStatus = getAuthStatus(req);
        
        // Redirect to dashboard or intended destination
        const returnTo = req.session?.returnTo || '/dashboard';
        delete req.session?.returnTo;

        console.log(`🎉 Redirecting ${authStatus.user.skoolUsername} to ${returnTo}`);
        
        res.redirect(`${returnTo}?welcome=true&user=${encodeURIComponent(authStatus.user.skoolUsername)}`);

    } catch (error) {
        console.error('❌ Error handling auth code:', error);
        const errorMessage = encodeURIComponent('Unexpected error during login. Please try again.');
        res.redirect(`/login?error=unexpected_error&message=${errorMessage}`);
    }
});

/**
 * GET /auth/status - Check current authentication status (AJAX endpoint)
 */
router.get('/auth/status', async (req, res) => {
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
                redirectUrl: '/login'
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
 * POST /auth/logout - Handle user logout
 */
router.post('/auth/logout', logoutSkoolUser, (req, res) => {
    try {
        const returnUrl = req.body.returnUrl || '/login';
        const message = encodeURIComponent('You have been logged out successfully.');
        
        res.redirect(`${returnUrl}?message=${message}`);

    } catch (error) {
        console.error('❌ Error during logout redirect:', error);
        res.redirect('/login');
    }
});

/**
 * GET /auth/logout - Handle logout via GET (for logout links)
 */
router.get('/auth/logout', logoutSkoolUser, (req, res) => {
    try {
        const message = encodeURIComponent('You have been logged out successfully.');
        res.redirect(`/login?message=${message}`);

    } catch (error) {
        console.error('❌ Error during logout redirect:', error);
        res.redirect('/login');
    }
});

/**
 * POST /auth/request-code - AJAX endpoint for requesting a new auth code
 * (This would typically be called by the bot, but useful for testing)
 */
router.post('/auth/request-code', async (req, res) => {
    try {
        const { skoolUserId, skoolUsername } = req.body;
        const { ipAddress } = getClientInfo(req);

        if (!skoolUserId || !skoolUsername) {
            return res.status(400).json({
                error: 'Missing required fields: skoolUserId and skoolUsername'
            });
        }

        const result = await authService.generateAuthCode(skoolUserId, skoolUsername);
        
        res.json({
            success: true,
            code: result.code,
            expiresAt: result.expiresAt,
            loginUrl: `${req.protocol}://${req.get('host')}/login/${result.code}`
        });

    } catch (error) {
        console.error('❌ Error requesting auth code:', error);
        
        if (error.message.includes('Daily limit exceeded')) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: error.message
            });
        }

        res.status(500).json({
            error: 'Unable to generate authentication code',
            message: 'Please try again later or contact support.'
        });
    }
});

/**
 * GET /auth/stats - Authentication statistics (admin only)
 */
router.get('/auth/stats', async (req, res) => {
    try {
        // TODO: Add admin authentication check
        const stats = await authService.getAuthStats(7); // Last 7 days
        
        res.json(stats);

    } catch (error) {
        console.error('❌ Error getting auth stats:', error);
        res.status(500).json({
            error: 'Unable to retrieve authentication statistics'
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
