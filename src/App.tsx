import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth';
import { HrLayout } from './ui';
import Apply from './pages/Apply';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CandidateDetail from './pages/CandidateDetail';
import Jobs from './pages/Jobs';
import Logs from './pages/Logs';
import Admin from './pages/Admin';

export default function App() {
  return (
    <Routes>
      {/* สาธารณะ */}
      <Route path="/" element={<Apply />} />
      <Route path="/login" element={<Login />} />

      {/* ฝั่ง HR / Admin */}
      <Route element={<RequireAuth><HrLayout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/candidate/:id" element={<CandidateDetail />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/logs" element={<RequireAuth roles={['Admin']}><Logs /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth roles={['Admin']}><Admin /></RequireAuth>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
