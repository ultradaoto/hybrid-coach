import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';
import { PricingPage } from './pages/Pricing';
import { AuthCallbackPage } from './pages/AuthCallback';

// Helper to redirect to web-client for onboarding
function RedirectToClientOnboarding() {
  const clientPort = import.meta.env.VITE_CLIENT_PORT || '3702';
  const clientUrl = `http://localhost:${clientPort}/onboarding/welcome`;
  window.location.href = clientUrl;
  return null;
}

type Theme = 'light' | 'dark';

function getDefaultTheme(): Theme {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

  const hour = new Date().getHours();
  const isNightTime = hour < 6 || hour > 18;
  return isNightTime ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

export function App() {
  const [theme, setTheme] = useState<Theme>(() => getDefaultTheme());
  const themeIcon = useMemo(() => (theme === 'dark' ? '☀️' : '🌙'), [theme]);
  const location = useLocation();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const addSmoothScrolling = () => {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
      const onClick = (e: MouseEvent) => {
        const a = e.currentTarget as HTMLAnchorElement;
        const id = a.getAttribute('href')?.slice(1);
        if (!id) return;
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      };
      for (const a of anchors) a.addEventListener('click', onClick);
      return () => {
        for (const a of anchors) a.removeEventListener('click', onClick);
      };
    };

    const addLogoEffects = () => {
      const logo = document.querySelector<HTMLElement>('.logo');
      if (!logo) return () => {};
      let clickCount = 0;

      const createClickBurst = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 12; i++) {
          const particle = document.createElement('div');
          particle.style.position = 'fixed';
          particle.style.left = `${centerX}px`;
          particle.style.top = `${centerY}px`;
          particle.style.width = '8px';
          particle.style.height = '8px';
          particle.style.background = `hsl(${Math.random() * 360}, 100%, 70%)`;
          particle.style.borderRadius = '50%';
          particle.style.zIndex = '9999';
          particle.style.pointerEvents = 'none';

          document.body.appendChild(particle);

          const angle = (i / 12) * Math.PI * 2;
          const velocity = 5 + Math.random() * 5;
          const vx = Math.cos(angle) * velocity;
          const vy = Math.sin(angle) * velocity;

          let x = centerX;
          let y = centerY;
          let opacity = 1;

          const animate = () => {
            x += vx;
            y += vy;
            opacity -= 0.02;
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            particle.style.opacity = String(opacity);
            if (opacity > 0) {
              requestAnimationFrame(animate);
            } else {
              particle.remove();
            }
          };

          requestAnimationFrame(animate);
        }
      };

      const onLogoClick = () => {
        clickCount++;
        logo.style.transform = `scale(${1 + clickCount * 0.1}) rotate(${clickCount * 5}deg)`;

        if (clickCount >= 3) {
          setTimeout(() => {
            logo.style.transform = 'scale(1) rotate(0deg)';
            clickCount = 0;
          }, 1000);
        }

        createClickBurst(logo);
      };

      logo.addEventListener('click', onLogoClick);
      return () => logo.removeEventListener('click', onLogoClick);
    };

    const addClickEffects = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('.btn'));
      const handlers = new Map<HTMLElement, (e: MouseEvent) => void>();

      for (const btn of buttons) {
        const handler = (e: MouseEvent) => {
          const ripple = document.createElement('div');
          ripple.style.position = 'absolute';
          ripple.style.borderRadius = '50%';
          ripple.style.background = 'rgba(255,255,255,0.3)';
          ripple.style.transform = 'scale(0)';
          ripple.style.animation = 'ripple 0.6s linear';
          ripple.style.left = `${e.offsetX}px`;
          ripple.style.top = `${e.offsetY}px`;
          ripple.style.width = '20px';
          ripple.style.height = '20px';
          btn.appendChild(ripple);
          setTimeout(() => ripple.remove(), 600);
        };
        handlers.set(btn, handler);
        btn.addEventListener('click', handler);
      }

      return () => {
        for (const [btn, handler] of handlers) btn.removeEventListener('click', handler);
      };
    };

    const setupFadeInObserver = () => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>('.section, .feature-card, .testimonial'));
      for (const el of targets) el.classList.add('fade-in');

      const featureCards = Array.from(document.querySelectorAll<HTMLElement>('.feature-card'));
      featureCards.forEach((card, index) => {
        if (index % 3 === 1) card.classList.add('fade-in-delay-1');
        if (index % 3 === 2) card.classList.add('fade-in-delay-2');
      });

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              (entry.target as HTMLElement).classList.add('visible');
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
      );

      targets.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    };

    const hero = document.querySelector<HTMLElement>('.hero');
    const onScroll = () => {
      if (!hero) return;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      if (scrollTop < 500) {
        hero.style.transform = `translateY(${scrollTop * 0.3}px)`;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' && e.ctrlKey) {
        e.preventDefault();
        setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
      }
    };

    window.addEventListener('scroll', onScroll);
    document.addEventListener('keydown', onKeyDown);

    const cleanups = [addSmoothScrolling(), addLogoEffects(), addClickEffects(), setupFadeInObserver()];

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKeyDown);
      for (const fn of cleanups) fn();
    };
  }, [location.pathname]);

  return (
    <>
      <button
        className="theme-toggle"
        onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        aria-label="Toggle theme"
        type="button"
      >
        {themeIcon}
      </button>

      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        
        {/* Onboarding - redirect to web-client where auth token exists */}
        <Route path="/onboarding/*" element={<RedirectToClientOnboarding />} />
        
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  );
}
