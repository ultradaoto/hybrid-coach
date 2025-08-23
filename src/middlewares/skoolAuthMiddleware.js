import authService from '../services/authService.js';

/**
 * Skool Authentication Middleware
 * Handles session validation and route protection for the Skool-based auth system
 */

/**
 * Extract client information for authentication
 * @param {object} req - Express request object
 * @returns {object} Client info object
 */
function getClientInfo(req) {
    // Get real IP address (handle proxy/load balancer)
    const ipAddress = req.headers['x-forwarded-for'] 
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.headers['x-real-ip'] 
        ? req.headers['x-real-ip']
        : req.connection.remoteAddress 
        ? req.connection.remoteAddress
        : req.socket.remoteAddress
        ? req.socket.remoteAddress
        : '127.0.0.1';

    const userAgent = req.headers['user-agent'] || 'Unknown';

    return { ipAddress, userAgent };
}

/**
 * Middleware to check if user has a valid Skool authentication session
 * Adds user data to req.skoolUser if authenticated
 */
async function checkSkoolAuth(req, res, next) {
    try {
        // Ensure cookies object exists (requires cookie-parser middleware)
        if (!req.cookies) {
            console.log('⚠️ req.cookies is undefined - cookie-parser middleware may not be installed');
            req.skoolUser = null;
            return next();
        }
        
        const sessionId = req.cookies.skoolSessionId;
        const { ipAddress, userAgent } = getClientInfo(req);

        if (!sessionId) {
            req.skoolUser = null;
            return next();
        }

        const validation = await authService.validateSession(sessionId, ipAddress, userAgent);
        
        if (validation.valid) {
            req.skoolUser = validation.userData;
            console.log(`✅ Skool user authenticated: ${validation.userData.skoolUsername}`);
        } else {
            req.skoolUser = null;
            // Clear invalid cookie
            res.clearCookie('skoolSessionId');
            console.log(`❌ Invalid Skool session: ${validation.error}`);
        }

        next();
    } catch (error) {
        console.error('❌ Error checking Skool auth:', error);
        req.skoolUser = null;
        next();
    }
}

/**
 * Middleware to require valid Skool authentication
 * Redirects to login page if not authenticated
 */
function requireSkoolAuth(req, res, next) {
    console.log(`🔐 requireSkoolAuth check: req.skoolUser = ${!!req.skoolUser}`);
    console.log(`🍪 Available cookies:`, req.cookies);
    console.log(`🔑 Session cookie: ${req.cookies?.skoolSessionId}`);
    
    if (!req.skoolUser) {
        // Store intended destination for redirect after login
        req.session.returnTo = req.originalUrl;
        
        return res.redirect('/auth/login?error=authentication_required&message=Please authenticate through Skool to access this page');
    }
    
    next();
}

/**
 * Middleware to handle authentication code validation from URL
 * Used for /login/:code routes
 */
async function validateAuthCode(req, res, next) {
    try {
        const code = req.params.code;
        const { ipAddress, userAgent } = getClientInfo(req);

        if (!code) {
            return res.redirect('/login?error=invalid_code&message=No authentication code provided');
        }

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
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            domain: process.env.COOKIE_DOMAIN || undefined
        });

        // Add user data to request for next middleware
        req.skoolUser = session.userData;
        req.newLogin = true; // Flag to indicate this is a fresh login

        console.log(`🎉 Successful Skool login: ${session.userData.skoolUsername}`);
        next();

    } catch (error) {
        console.error('❌ Error validating auth code:', error);
        const errorMessage = encodeURIComponent('Authentication service error. Please try again.');
        res.redirect(`/login?error=service_error&message=${errorMessage}`);
    }
}

/**
 * Middleware to handle logout
 * Revokes session and clears cookies
 */
async function logoutSkoolUser(req, res, next) {
    try {
        const sessionId = req.cookies.skoolSessionId;
        
        if (sessionId) {
            await authService.revokeSession(sessionId);
            console.log(`🔓 Logged out Skool user session: ${sessionId}`);
        }

        // Clear session cookie
        res.clearCookie('skoolSessionId');
        
        // Clear any other auth-related data
        req.skoolUser = null;
        
        next();
    } catch (error) {
        console.error('❌ Error during logout:', error);
        // Continue with logout even if there's an error
        res.clearCookie('skoolSessionId');
        req.skoolUser = null;
        next();
    }
}

/**
 * Middleware to redirect authenticated users away from login page
 * Useful for login routes where already-authenticated users shouldn't go
 */
function redirectIfAuthenticated(req, res, next) {
    if (req.skoolUser) {
        const returnTo = req.session.returnTo || '/dashboard';
        delete req.session.returnTo;
        return res.redirect(returnTo);
    }
    next();
}

/**
 * Middleware to extract and validate rate limiting info
 * Adds rate limiting data to req.rateLimitInfo
 */
async function checkRateLimit(req, res, next) {
    try {
        // This would typically be called when generating codes
        // For now, just pass through - actual rate limiting is in authService
        next();
    } catch (error) {
        console.error('❌ Error checking rate limit:', error);
        next();
    }
}

/**
 * Helper function to get authentication status for templates
 * @param {object} req - Express request object
 * @returns {object} Auth status object for templates
 */
function getAuthStatus(req) {
    return {
        isAuthenticated: !!req.skoolUser,
        user: req.skoolUser || null,
        hasNewLogin: !!req.newLogin
    };
}

export {
    checkSkoolAuth,
    requireSkoolAuth,
    validateAuthCode,
    logoutSkoolUser,
    redirectIfAuthenticated,
    checkRateLimit,
    getAuthStatus,
    getClientInfo
};
