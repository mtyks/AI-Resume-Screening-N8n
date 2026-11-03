import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth';
import { HrLayout } from './ui';
import Apply from './pages/Apply';
import Login from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CandidateDetail = lazy(() => import('./pages/CandidateDetail'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Logs = lazy(() => import('./pages/Logs'));
const Admin = lazy(() => import('./pages/Admin'));
const Audit = lazy(() => import('./pages/Audit'));
const Positions = lazy(() => import('./pages/Positions'));
const PositionApplicants = lazy(() => import('./pages/PositionApplicants'));
const Compare = lazy(() => import('./pages/Compare'));

export default function App() {
  return (
    <Suspense fallback={<div className="muted" style={{ padding: 32 }} role="status">กำลังโหลด…</div>}>
    <Routes>
      {/* สาธารณะ */}
      <Route path="/" element={<Apply />} />
      <Route path="/login" element={<Login />} />

      {/* ฝั่ง HR / Admin */}
      <Route element={<RequireAuth><HrLayout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/positions" element={<Positions />} />
        <Route path="/positions/:jobId" element={<PositionApplicants />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/candidate/:id" element={<CandidateDetail />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/logs" element={<RequireAuth roles={['Admin']}><Logs /></RequireAuth>} />
        <Route path="/audit" element={<RequireAuth roles={['Admin']}><Audit /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth roles={['Admin']}><Admin /></RequireAuth>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
