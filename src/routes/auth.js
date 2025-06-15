import { Router } from 'express';
import passport from 'passport';

const router = Router();

// Show login page
router.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

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

// Logout
router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/');
  });
});

export default router;
