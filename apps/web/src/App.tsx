import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { routes } from './routes';

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
