import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { LeadForm } from './components/LeadForm';
import './App.css';

// Code-split: the admin dashboard's JS (and everything it imports) is only
// fetched when someone actually navigates to /admin/*, never as part of the
// public form's initial bundle.
const AdminApp = lazy(() => import('./admin/AdminApp'));

function PublicForm() {
  return (
    <main className="page">
      <h1>Get in touch</h1>
      <p>Tell us a bit about your business and we&apos;ll reach out.</p>
      <LeadForm />
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicForm />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminApp />
          </Suspense>
        }
      />
    </Routes>
  );
}

export default App;
