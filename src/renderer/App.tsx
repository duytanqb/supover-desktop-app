import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import TrendingBoard from './pages/TrendingBoard';
import ShopList from './pages/ShopList';
import ShopDetail from './pages/ShopDetail';
import SearchTracker from './pages/SearchTracker';
import AIInsights from './pages/AIInsights';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';

export default function App() {
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        path="*"
        element={
          <div className="flex h-screen bg-gray-950">
            <Sidebar />
            <main className="flex-1 ml-64 p-6 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/trending" element={<TrendingBoard />} />
                <Route path="/shops" element={<ShopList />} />
                <Route path="/shops/:id" element={<ShopDetail />} />
                <Route path="/keywords" element={<SearchTracker />} />
                <Route path="/ai-insights" element={<AIInsights />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        }
      />
    </Routes>
  );
}
