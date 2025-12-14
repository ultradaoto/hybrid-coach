# MyUltra.Coach - Node.js MVC to Bun + React Migration Guide

> **For Cursor AI Agents**: This document provides complete instructions for migrating the MyUltra.Coach platform from a Node.js MVC architecture to a modern Bun + React + TypeScript monorepo.

---

## Project Overview

**MyUltra.Coach** is a coaching/fitness platform being migrated from Node.js with MVC (Express + EJS templates) to a modern stack using Bun + React + TypeScript.

### Target Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Bun API Server            │
                    │            (port 3001)              │
                    │                                     │
DNS Routes ────────►│  /api/public/*    (public routes)  │◄──── PostgreSQL
                    │  /api/coach/*     (auth required)  │      (shared DB)
                    │  /api/admin/*     (admin auth)     │
                    │  /api/client/*    (client auth)    │
                    │                                     │
                    │  Serves static files by path        │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Public   │   │   Coach   │   │   Admin   │
            │  (React)  │   │  (React)  │   │  (React)  │
            │  :5170    │   │  :5171    │   │  :5172    │
            └───────────┘   └───────────┘   └───────────┘
```

### URL Structure (Path-Based Routing)

| Path | Purpose | Auth Required |
|------|---------|---------------|
| `myultra.coach/` | Public landing page, marketing | None |
| `myultra.coach/coach/*` | Coach dashboard, client management | Coach login |
| `myultra.coach/client/*` | Client portal, workout tracking | Client login |
| `myultra.coach/admin/*` | Admin panel, platform management | Admin login |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun 1.3.4+ |
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind CSS |
| Backend | Bun.serve() (single API server) |
| Database | PostgreSQL (existing, migrate queries) |
| Process Manager | PM2 |
| Styling | Tailwind CSS (replacing inline CSS/custom CSS) |

---

## Project Structure

```
myultra-coach/
├── apps/
│   ├── api/                          # Single Bun API server
│   │   ├── src/
│   │   │   ├── index.ts              # Main server entry
│   │   │   ├── routes/
│   │   │   │   ├── public.ts         # Public API routes
│   │   │   │   ├── coach.ts          # Coach-specific routes
│   │   │   │   ├── client.ts         # Client-specific routes
│   │   │   │   └── admin.ts          # Admin routes
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # JWT/session auth
│   │   │   │   └── cors.ts           # CORS handling
│   │   │   ├── services/             # Business logic
│   │   │   └── db/                   # Database connections
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web-public/                   # Public marketing site
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Home.tsx
│   │   │   │   ├── About.tsx
│   │   │   │   ├── Pricing.tsx
│   │   │   │   └── Contact.tsx
│   │   │   └── components/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── web-coach/                    # Coach dashboard
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Login.tsx
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Clients.tsx
│   │   │   │   ├── Programs.tsx
│   │   │   │   └── Settings.tsx
│   │   │   └── components/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── web-client/                   # Client portal
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Login.tsx
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Workouts.tsx
│   │   │   │   ├── Progress.tsx
│   │   │   │   └── Messages.tsx
│   │   │   └── components/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── web-admin/                    # Admin panel
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Users.tsx
│       │   │   └── Analytics.tsx
│       │   └── components/
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
│
├── packages/                         # Shared code
│   ├── ui/                           # Shared React components
│   │   ├── src/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Form/
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── user.ts
│   │   │   ├── workout.ts
│   │   │   ├── program.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── utils/                        # Shared utilities
│       ├── src/
│       │   ├── api-client.ts
│       │   ├── auth.ts
│       │   ├── formatters.ts
│       │   └── index.ts
│       └── package.json
│
├── legacy/                           # OLD Node.js code (reference only)
│   ├── server.js                     # Original Express server
│   ├── controllers/
│   ├── models/
│   ├── views/                        # EJS templates
│   └── routes/
│
├── package.json                      # Root workspace config
├── bun.lockb
├── tsconfig.base.json
└── .env
```

---

## Architecture Rules

### Rule 1: Single API Server

**ALL** API routes go through ONE Bun server at `apps/api/`. Route by path prefix:

```typescript
// apps/api/src/index.ts
import { serve } from 'bun';
import { publicRoutes } from './routes/public';
import { coachRoutes } from './routes/coach';
import { clientRoutes } from './routes/client';
import { adminRoutes } from './routes/admin';
import { authMiddleware } from './middleware/auth';

serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route by prefix
    if (path.startsWith('/api/public')) {
      return publicRoutes(req);
    }
    
    if (path.startsWith('/api/coach')) {
      const authResult = await authMiddleware(req, 'coach');
      if (!authResult.success) return authResult.response;
      return coachRoutes(req, authResult.user);
    }
    
    if (path.startsWith('/api/client')) {
      const authResult = await authMiddleware(req, 'client');
      if (!authResult.success) return authResult.response;
      return clientRoutes(req, authResult.user);
    }
    
    if (path.startsWith('/api/admin')) {
      const authResult = await authMiddleware(req, 'admin');
      if (!authResult.success) return authResult.response;
      return adminRoutes(req, authResult.user);
    }

    return new Response('Not Found', { status: 404 });
  }
});
```

### Rule 2: Separate React Apps

Each path segment has its own React app in `apps/web-{name}/`. They are:

- Built separately with Vite
- Share common packages from `packages/`
- Proxy `/api/*` to the Bun server in development
- Have independent routing within their scope

### Rule 3: Shared Code Location

Common code lives in `packages/`:

| Package | Purpose | Import As |
|---------|---------|-----------|
| `packages/ui/` | Shared React components | `@myultra/ui` |
| `packages/types/` | Shared TypeScript interfaces | `@myultra/types` |
| `packages/utils/` | Shared utilities, API client | `@myultra/utils` |

### Rule 4: Development Ports

| Service | Port |
|---------|------|
| API Server | 3001 |
| Public Site | 5170 |
| Coach Dashboard | 5171 |
| Client Portal | 5172 |
| Admin Panel | 5173 |

---

## Migration Workflow

### Phase 1: Project Setup (Day 1-2)

```bash
# Initialize workspace
mkdir myultra-coach && cd myultra-coach
bun init -y

# Create workspace structure
mkdir -p apps/{api,web-public,web-coach,web-client,web-admin}/src
mkdir -p packages/{ui,types,utils}/src
mkdir legacy

# Move old Node.js code to legacy/ for reference
mv ../old-project/* legacy/
```

**Create root `package.json`:**

```json
{
  "name": "myultra-coach",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "bun run --parallel dev:api dev:public dev:coach dev:client",
    "dev:api": "cd apps/api && bun run dev",
    "dev:public": "cd apps/web-public && bun run dev",
    "dev:coach": "cd apps/web-coach && bun run dev",
    "dev:client": "cd apps/web-client && bun run dev",
    "dev:admin": "cd apps/web-admin && bun run dev",
    "build": "bun run build:packages && bun run build:apps",
    "build:packages": "cd packages/ui && bun run build && cd ../types && bun run build && cd ../utils && bun run build",
    "build:apps": "cd apps/web-public && bun run build && cd ../web-coach && bun run build && cd ../web-client && bun run build"
  }
}
```

### Phase 2: API Server Setup (Day 2-3)

**Convert Express routes to Bun.serve():**

```typescript
// BEFORE (Express/Node.js)
app.get('/api/workouts', authenticate, async (req, res) => {
  try {
    const workouts = await Workout.findAll({ where: { userId: req.user.id } });
    res.json(workouts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AFTER (Bun)
async function handleGetWorkouts(req: Request, user: User): Promise<Response> {
  try {
    const workouts = await db.query('SELECT * FROM workouts WHERE user_id = $1', [user.id]);
    return Response.json({ success: true, data: workouts });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

### Phase 3: React App Creation (Day 3-5)

**Initialize each React app:**

```bash
cd apps/web-coach
bun create vite . --template react-ts
bun add react-router-dom @tanstack/react-query
bun add -D tailwindcss postcss autoprefixer
bunx tailwindcss init -p
```

**Vite config with API proxy:**

```typescript
// apps/web-coach/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/coach/',
  server: {
    port: 5171,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

### Phase 4: EJS to React Conversion (Day 5-8)

**Conversion Pattern:**

```ejs
<!-- BEFORE: legacy/views/dashboard.ejs -->
<div class="dashboard">
  <h1>Welcome, <%= user.name %></h1>
  <% workouts.forEach(function(workout) { %>
    <div class="workout-card">
      <h3><%= workout.name %></h3>
      <p><%= workout.description %></p>
    </div>
  <% }); %>
</div>
```

```tsx
// AFTER: apps/web-coach/src/pages/Dashboard.tsx
import { useQuery } from '@tanstack/react-query';
import { Card } from '@myultra/ui';
import { apiClient } from '@myultra/utils';

export function Dashboard() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => apiClient.get('/api/coach/me'),
  });

  const { data: workouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: () => apiClient.get('/api/coach/workouts'),
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Welcome, {user?.name}
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workouts?.map((workout) => (
          <Card key={workout.id}>
            <h3 className="font-semibold">{workout.name}</h3>
            <p className="text-gray-600">{workout.description}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### Phase 5: Shared Packages (Day 4)

**Create shared UI components:**

```typescript
// packages/ui/src/Button.tsx
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md',
  onClick,
  disabled,
  type = 'button'
}: ButtonProps) {
  const baseStyles = 'rounded font-medium transition-colors focus:outline-none focus:ring-2';
  
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}
```

**Create shared types:**

```typescript
// packages/types/src/user.ts
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'coach' | 'client' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

export interface Coach extends User {
  role: 'coach';
  bio?: string;
  specializations: string[];
  clients: string[];
}

export interface Client extends User {
  role: 'client';
  coachId: string;
  goals: string[];
  currentProgram?: string;
}
```

**Create API client utility:**

```typescript
// packages/utils/src/api-client.ts
const BASE_URL = import.meta.env.VITE_API_URL || '';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('auth_token');
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  const data: ApiResponse<T> = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Request failed');
  }
  
  return data.data as T;
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) => 
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) => 
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => 
    request<T>(endpoint, { method: 'DELETE' }),
};
```

---

## Code Style Guidelines

### React Components

```typescript
// ✅ GOOD: Functional component with TypeScript
interface WorkoutCardProps {
  workout: Workout;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function WorkoutCard({ workout, onEdit, onDelete }: WorkoutCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-lg">{workout.name}</h3>
      <p className="text-gray-600 mt-2">{workout.description}</p>
      <div className="flex gap-2 mt-4">
        <Button size="sm" onClick={() => onEdit(workout.id)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => onDelete(workout.id)}>Delete</Button>
      </div>
    </div>
  );
}

// ❌ BAD: Class component, inline styles, no types
class WorkoutCard extends React.Component {
  render() {
    return (
      <div style={{ background: 'white', padding: 16 }}>
        <h3>{this.props.workout.name}</h3>
      </div>
    );
  }
}
```

### API Routes

```typescript
// ✅ GOOD: Consistent response format, async/await, error handling
async function handleCreateWorkout(req: Request, user: User): Promise<Response> {
  try {
    const body = await req.json();
    
    // Validation
    if (!body.name || !body.exercises) {
      return Response.json(
        { success: false, error: 'Name and exercises are required' },
        { status: 400 }
      );
    }

    const workout = await db.query(
      'INSERT INTO workouts (name, exercises, coach_id) VALUES ($1, $2, $3) RETURNING *',
      [body.name, JSON.stringify(body.exercises), user.id]
    );

    return Response.json({ success: true, data: workout[0] }, { status: 201 });
  } catch (err) {
    console.error('Create workout error:', err);
    return Response.json(
      { success: false, error: 'Failed to create workout' },
      { status: 500 }
    );
  }
}

// ❌ BAD: Inconsistent response, no error handling
async function handleCreateWorkout(req, user) {
  const body = await req.json();
  const workout = await db.query('INSERT INTO workouts...');
  return new Response(JSON.stringify(workout));
}
```

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `WorkoutCard.tsx` |
| Pages | PascalCase | `Dashboard.tsx` |
| Hooks | camelCase with `use` prefix | `useAuth.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Types | PascalCase | `User.ts` |
| API Routes | kebab-case | `workout-routes.ts` |

---

## Common Migration Tasks

### Task: Convert an EJS Page

1. **Identify data requirements:**
   ```javascript
   // Find in legacy controller
   res.render('dashboard', { user, workouts, stats });
   ```

2. **Create API endpoint:**
   ```typescript
   // apps/api/src/routes/coach.ts
   if (path === '/api/coach/dashboard' && method === 'GET') {
     const [user, workouts, stats] = await Promise.all([
       getUser(userId),
       getWorkouts(userId),
       getStats(userId),
     ]);
     return Response.json({ success: true, data: { user, workouts, stats } });
   }
   ```

3. **Create React component:**
   ```tsx
   // apps/web-coach/src/pages/Dashboard.tsx
   export function Dashboard() {
     const { data, isLoading } = useQuery({
       queryKey: ['dashboard'],
       queryFn: () => apiClient.get('/api/coach/dashboard'),
     });
     
     if (isLoading) return <Spinner />;
     
     return (
       <div className="p-6">
         {/* Convert EJS template to JSX */}
       </div>
     );
   }
   ```

4. **Add route:**
   ```tsx
   // apps/web-coach/src/App.tsx
   <Route path="/coach/dashboard" element={<Dashboard />} />
   ```

### Task: Add Authentication

```tsx
// packages/utils/src/auth.ts
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      apiClient.get<User>('/api/auth/me')
        .then(setUser)
        .catch(() => localStorage.removeItem('auth_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await apiClient.post<{ token: string; user: User }>(
      '/api/auth/login',
      { email, password }
    );
    localStorage.setItem('auth_token', token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  return { user, loading, login, logout };
}

// Protected route wrapper
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  
  return <>{children}</>;
}
```

### Task: Add a New Shared Component

1. Create in `packages/ui/src/ComponentName.tsx`
2. Export from `packages/ui/src/index.ts`
3. Import in app: `import { ComponentName } from '@myultra/ui'`

---

## Environment Configuration

**.env (root):**

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/myultra_coach

# Auth
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# API
API_PORT=3001

# Environment
NODE_ENV=development
```

**Each app's .env:**

```env
# apps/web-coach/.env
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=MyUltra Coach Dashboard
```

---

## Production Deployment

### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'myultra-api',
      script: 'apps/api/src/index.ts',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name myultra.coach;

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Coach app
    location /coach/ {
        alias /var/www/myultra-coach/apps/web-coach/dist/;
        try_files $uri $uri/ /coach/index.html;
    }

    # Client app
    location /client/ {
        alias /var/www/myultra-coach/apps/web-client/dist/;
        try_files $uri $uri/ /client/index.html;
    }

    # Admin app
    location /admin/ {
        alias /var/www/myultra-coach/apps/web-admin/dist/;
        try_files $uri $uri/ /admin/index.html;
    }

    # Public site (root)
    location / {
        root /var/www/myultra-coach/apps/web-public/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Don't Do List

| ❌ Don't | ✅ Do Instead |
|---------|---------------|
| Create multiple API servers | Use route prefixes in single server |
| Put app-specific code in `packages/` | Keep it in the respective `apps/` folder |
| Use inline styles | Use Tailwind CSS classes |
| Skip TypeScript types | Define interfaces for all data |
| Store secrets in code | Use `.env` files |
| Use class components | Use functional components with hooks |
| Mix concerns in components | Separate data fetching from presentation |

---

## Migration Timeline

| Day | Task |
|-----|------|
| 1-2 | Project setup, workspace configuration |
| 2-3 | API server setup, migrate core routes |
| 3-4 | Create shared packages (ui, types, utils) |
| 4-5 | Public site React app |
| 5-6 | Coach dashboard React app |
| 6-7 | Client portal React app |
| 7-8 | Admin panel React app |
| 8-9 | Testing, bug fixes |
| 9-10 | Production deployment setup |
| 10-11 | DNS configuration, go-live |

---

## Quick Reference Commands

```bash
# Development
bun run dev                 # Start all services
bun run dev:api            # Start API only
bun run dev:coach          # Start coach app only

# Building
bun run build              # Build everything
cd apps/web-coach && bun run build  # Build specific app

# Testing
bun test                   # Run all tests
bun test --watch          # Watch mode

# Database
bun run db:migrate        # Run migrations
bun run db:seed           # Seed database

# Production
pm2 start ecosystem.config.js
pm2 logs myultra-api
```

---

## Need Help?

When stuck on migration:

1. Check `legacy/` folder for original implementation
2. Look at similar converted components for patterns
3. Reference this document's code examples
4. Keep API responses consistent: `{ success: boolean, data?: T, error?: string }`