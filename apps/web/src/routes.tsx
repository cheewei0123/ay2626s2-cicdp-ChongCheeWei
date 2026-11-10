import { Navigate, type RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import GuestBill from './pages/GuestBill';
import Login from './pages/Login';
import MyBills from './pages/MyBills';
import Register from './pages/Register';

// Every page and who can see it. Tests use the same list with a memory router.
export const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    path: '/bills',
    element: (
      <RequireAuth>
        <MyBills />
      </RequireAuth>
    ),
  },
  { path: '/s/:token', element: <GuestBill /> }, // public: friends open the share link
  { path: '*', element: <Navigate to="/bills" replace /> },
];
