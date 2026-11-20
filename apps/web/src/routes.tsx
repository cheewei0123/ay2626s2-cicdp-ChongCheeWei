import type { ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import GuestBill from './pages/GuestBill';
import JoinCode from './pages/JoinCode';
import EditBill from './pages/EditBill';
import Login from './pages/Login';
import MyBills from './pages/MyBills';
import NewBill from './pages/NewBill';
import Register from './pages/Register';
import ScanReceipt from './pages/ScanReceipt';
import Share from './pages/Share';
import Summary from './pages/Summary';

const needsLogin = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;

// Every page and who can see it. Tests use the same list with a memory router.
export const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/bills', element: needsLogin(<MyBills />) },
  { path: '/bills/new', element: needsLogin(<NewBill />) },
  { path: '/bills/:id/scan', element: needsLogin(<ScanReceipt />) },
  { path: '/bills/:id/edit', element: needsLogin(<EditBill />) },
  { path: '/bills/:id/share', element: needsLogin(<Share />) },
  { path: '/bills/:id/summary', element: needsLogin(<Summary />) },
  { path: '/s/:token', element: <GuestBill /> }, // public: friends open the share link
  { path: '/join', element: <JoinCode /> }, // public: or type the 5-character code
  { path: '*', element: <Navigate to="/bills" replace /> },
];
