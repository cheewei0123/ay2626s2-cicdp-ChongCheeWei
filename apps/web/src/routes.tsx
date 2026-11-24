import type { ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import AddExpense from './pages/AddExpense';
import ChangePassword from './pages/ChangePassword';
import Expenses from './pages/Expenses';
import ForgotPassword from './pages/ForgotPassword';
import GuestBill from './pages/GuestBill';
import JoinCode from './pages/JoinCode';
import EditBill from './pages/EditBill';
import Login from './pages/Login';
import MyBills from './pages/MyBills';
import NewBill from './pages/NewBill';
import Profile from './pages/Profile';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import ScanReceipt from './pages/ScanReceipt';
import Share from './pages/Share';
import Summary from './pages/Summary';
import Verify from './pages/Verify';

const needsLogin = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;

// Every page and who can see it. Tests use the same list with a memory router.
export const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/bills', element: needsLogin(<MyBills />) },
  { path: '/profile', element: needsLogin(<Profile />) },
  { path: '/profile/password', element: needsLogin(<ChangePassword />) },
  { path: '/expenses', element: needsLogin(<Expenses />) },
  { path: '/expenses/new', element: needsLogin(<AddExpense />) },
  { path: '/bills/new', element: needsLogin(<NewBill />) },
  { path: '/bills/new/scan', element: needsLogin(<ScanReceipt />) },
  { path: '/bills/:id/edit', element: needsLogin(<EditBill />) },
  { path: '/bills/:id/share', element: needsLogin(<Share />) },
  { path: '/bills/:id/summary', element: needsLogin(<Summary />) },
  { path: '/s/:token', element: <GuestBill /> }, // public: friends open the share link
  { path: '/join', element: <JoinCode /> }, // public: or type the 5-character code
  { path: '/verify', element: <Verify /> }, // public: the link in the verify email
  { path: '/forgot-password', element: <ForgotPassword /> }, // public (KAN-90)
  { path: '/reset-password', element: <ResetPassword /> }, // public: the link in the reset email
  { path: '*', element: <Navigate to="/bills" replace /> },
];
