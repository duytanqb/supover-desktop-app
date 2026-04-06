import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface OnboardingState {
  vkingKey: string;
  vkingTested: boolean;
  vkingSkipped: boolean;
  aiProvider: 'anthropic' | 'openai' | 'deepseek';
  aiKey: string;
  aiModel: string;
  aiTested: boolean;
  aiSkipped: boolean;
  targetsAdded: number;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>({
    vkingKey: '',
    vkingTested: false,
    vkingSkipped: false,
    aiProvider: 'deepseek',
    aiKey: '',
    aiModel: 'deepseek-reasoner',
    aiTested: false,
    aiSkipped: false,
    targetsAdded: 0,
  });

  const totalSteps = 5;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i + 1 === step
                  ? 'bg-indigo-500'
                  : i + 1 < step
                    ? 'bg-indigo-400/60'
                    : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl">
          {step === 1 && <StepWelcome onNext={() => setStep(2)} />}
          {step === 2 && (
            <StepVKing
              state={state}
              setState={setState}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepAI
              state={state}
              setState={setState}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <StepAddTarget
              state={state}
              setState={setState}
              onNext={() => setStep(5)}
              onBack={() => setStep(3)}
            />
          )}
          {step === 5 && (
            <StepReady
              state={state}
              onFinish={async () => {
                await window.electron.ipcRenderer.invoke('settings:update', {
                  onboarding_completed: 'true',
                });
                navigate('/');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────── Step 1: Welcome ────────────────── */

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="text-5xl font-bold text-white mb-3">Supover App</div>
      <p className="text-gray-400 mb-8 leading-relaxed">
        Monitor Etsy shops, track trends, and discover winning products for your POD business.
      </p>
      <button
        onClick={onNext}
        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}

/* ────────────────── Step 2: VK1ng API Key ────────────────── */

function StepVKing({
  state,
  setState,
  onNext,
  onBack,
}: {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTest = async () => {
    if (!state.vkingKey.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      // Save the key first, then test
      await window.electron.ipcRenderer.invoke('settings:update', {
        vking_api_key: state.vkingKey.trim(),
      });
      const res = await window.electron.ipcRenderer.invoke('analytics:api-status');
      if (res.success) {
        setTestResult({ ok: true, msg: 'Connected!' });
        setState((prev) => ({ ...prev, vkingTested: true }));
      } else {
        setTestResult({ ok: false, msg: res.error || 'Connection failed' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h2 className="text-xl font-bold text-white">Connect to VK1ng (HeyEtsy)</h2>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        VK1ng provides analytics data like sales velocity, views, and trending scores for Etsy listings.
        This is essential for trend detection.
      </p>

      <label className="block text-sm text-gray-300 mb-1">VK1ng API Key</label>
      <input
        type="password"
        value={state.vkingKey}
        onChange={(e) => setState((prev) => ({ ...prev, vkingKey: e.target.value, vkingTested: false }))}
        placeholder="Enter your VK1ng API key"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
      />

      <button
        onClick={handleTest}
        disabled={testing || !state.vkingKey.trim()}
        className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors mb-3"
      >
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {testResult && (
        <div className={`flex items-center gap-2 text-sm mb-3 ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
          {testResult.ok ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {testResult.msg}
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
          Back
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setState((prev) => ({ ...prev, vkingSkipped: true }));
              onNext();
            }}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={onNext}
            disabled={!state.vkingTested && !state.vkingSkipped}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── Step 3: AI Configuration ────────────────── */

function StepAI({
  state,
  setState,
  onNext,
  onBack,
}: {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleProviderChange = (provider: 'anthropic' | 'openai' | 'deepseek') => {
    setState((prev) => ({
      ...prev,
      aiProvider: provider,
      aiModel: provider === 'deepseek' ? 'deepseek-reasoner' : provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o',
      aiTested: false,
    }));
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!state.aiKey.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      // Save settings first
      await window.electron.ipcRenderer.invoke('settings:update', {
        ai_provider: state.aiProvider,
        ai_api_key: state.aiKey.trim(),
        ai_model: state.aiModel,
      });
      const res = await window.electron.ipcRenderer.invoke('ai:test-connection', {
        provider: state.aiProvider,
        apiKey: state.aiKey.trim(),
        model: state.aiModel,
      });
      if (res.success) {
        setTestResult({ ok: true, msg: 'Connected!' });
        setState((prev) => ({ ...prev, aiTested: true }));
      } else {
        setTestResult({ ok: false, msg: res.error || 'Connection failed' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-2">AI-Powered Insights</h2>
      <p className="text-gray-400 text-sm mb-6">
        Connect an AI provider for shop analysis, keyword suggestions, and trend summaries.
        This is optional -- you can add it later in Settings.
      </p>

      <label className="block text-sm text-gray-300 mb-1">Provider</label>
      <div className="flex gap-2 mb-4">
        {(['deepseek', 'anthropic', 'openai'] as const).map((p) => (
          <button
            key={p}
            onClick={() => handleProviderChange(p)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${
              state.aiProvider === p
                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {p === 'deepseek' ? 'DeepSeek' : p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
          </button>
        ))}
      </div>

      <label className="block text-sm text-gray-300 mb-1">API Key</label>
      <input
        type="password"
        value={state.aiKey}
        onChange={(e) => setState((prev) => ({ ...prev, aiKey: e.target.value, aiTested: false }))}
        placeholder={`Enter your ${state.aiProvider.charAt(0).toUpperCase() + state.aiProvider.slice(1)} API key`}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
      />

      <label className="block text-sm text-gray-300 mb-1">Model</label>
      <input
        type="text"
        value={state.aiModel}
        onChange={(e) => setState((prev) => ({ ...prev, aiModel: e.target.value, aiTested: false }))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
      />

      <button
        onClick={handleTest}
        disabled={testing || !state.aiKey.trim()}
        className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors mb-3"
      >
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {testResult && (
        <div className={`flex items-center gap-2 text-sm mb-3 ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
          {testResult.ok ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {testResult.msg}
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
          Back
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setState((prev) => ({ ...prev, aiSkipped: true }));
              onNext();
            }}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onNext}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-2 rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── Step 4: Add First Target ────────────────── */

function StepAddTarget({
  state,
  setState,
  onNext,
  onBack,
}: {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<'shop' | 'keyword'>('shop');
  const [shopUrl, setShopUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleAddShop = async () => {
    if (!shopUrl.trim()) return;
    setAdding(true);
    setFeedback(null);

    try {
      // Extract shop name from URL or use as-is
      let shopName = shopUrl.trim();
      const urlMatch = shopName.match(/etsy\.com\/shop\/([^/?#]+)/i);
      if (urlMatch) {
        shopName = urlMatch[1];
      }

      const res = await window.electron.ipcRenderer.invoke('shop:add', {
        shop_name: shopName,
        shop_url: urlMatch ? shopUrl.trim() : `https://www.etsy.com/shop/${shopName}`,
      });

      if (res.success) {
        setFeedback({ ok: true, msg: `Shop "${shopName}" added!` });
        setState((prev) => ({ ...prev, targetsAdded: prev.targetsAdded + 1 }));
        setShopUrl('');
      } else {
        setFeedback({ ok: false, msg: res.error || 'Failed to add shop' });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Failed to add shop' });
    } finally {
      setAdding(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!keyword.trim()) return;
    setAdding(true);
    setFeedback(null);

    try {
      const res = await window.electron.ipcRenderer.invoke('keyword:add', {
        keyword: keyword.trim(),
      });

      if (res.success) {
        setFeedback({ ok: true, msg: `Keyword "${keyword.trim()}" added!` });
        setState((prev) => ({ ...prev, targetsAdded: prev.targetsAdded + 1 }));
        setKeyword('');
      } else {
        setFeedback({ ok: false, msg: res.error || 'Failed to add keyword' });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Failed to add keyword' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-2">Add Your First Target</h2>
      <p className="text-gray-400 text-sm mb-6">
        Start tracking an Etsy shop or a keyword to monitor.
      </p>

      {/* Tab buttons */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => { setTab('shop'); setFeedback(null); }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${
            tab === 'shop'
              ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          Track a Shop
        </button>
        <button
          onClick={() => { setTab('keyword'); setFeedback(null); }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${
            tab === 'keyword'
              ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          Track a Keyword
        </button>
      </div>

      {tab === 'shop' && (
        <div>
          <label className="block text-sm text-gray-300 mb-1">Shop URL or Name</label>
          <input
            type="text"
            value={shopUrl}
            onChange={(e) => setShopUrl(e.target.value)}
            placeholder="https://www.etsy.com/shop/ShopName or just ShopName"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
          />
          <button
            onClick={handleAddShop}
            disabled={adding || !shopUrl.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {adding ? 'Adding...' : 'Add Shop'}
          </button>
        </div>
      )}

      {tab === 'keyword' && (
        <div>
          <label className="block text-sm text-gray-300 mb-1">Keyword</label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. funny cat shirt, vintage poster"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
          />
          <button
            onClick={handleAddKeyword}
            disabled={adding || !keyword.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {adding ? 'Adding...' : 'Add Keyword'}
          </button>
        </div>
      )}

      {feedback && (
        <div className={`flex items-center gap-2 text-sm mt-3 ${feedback.ok ? 'text-green-400' : 'text-red-400'}`}>
          {feedback.ok ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {feedback.msg}
        </div>
      )}

      {state.targetsAdded > 0 && (
        <p className="text-gray-500 text-xs mt-3">
          {state.targetsAdded} target{state.targetsAdded > 1 ? 's' : ''} added. You can add more or continue.
        </p>
      )}

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
          Back
        </button>
        <button
          onClick={onNext}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-2 rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ────────────────── Step 5: Ready ────────────────── */

function StepReady({
  state,
  onFinish,
}: {
  state: OnboardingState;
  onFinish: () => void;
}) {
  const [finishing, setFinishing] = useState(false);

  const handleFinish = async () => {
    setFinishing(true);
    await onFinish();
  };

  return (
    <div className="text-center">
      {/* Checkmark icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-600/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4">You're All Set!</h2>

      <div className="text-left bg-gray-800/50 rounded-lg p-4 mb-6 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          {state.vkingTested ? (
            <span className="text-green-400">&#10003;</span>
          ) : (
            <span className="text-gray-500">&#10007;</span>
          )}
          <span className={state.vkingTested ? 'text-gray-200' : 'text-gray-500'}>
            VK1ng API {state.vkingTested ? 'connected' : 'not configured'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state.aiTested ? (
            <span className="text-green-400">&#10003;</span>
          ) : (
            <span className="text-gray-500">&#10007;</span>
          )}
          <span className={state.aiTested ? 'text-gray-200' : 'text-gray-500'}>
            AI Insights {state.aiTested ? 'connected' : 'not configured'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state.targetsAdded > 0 ? (
            <span className="text-green-400">&#10003;</span>
          ) : (
            <span className="text-gray-500">&#10007;</span>
          )}
          <span className={state.targetsAdded > 0 ? 'text-gray-200' : 'text-gray-500'}>
            {state.targetsAdded > 0
              ? `${state.targetsAdded} target${state.targetsAdded > 1 ? 's' : ''} added`
              : 'No targets added'}
          </span>
        </div>
      </div>

      <button
        onClick={handleFinish}
        disabled={finishing}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors"
      >
        {finishing ? 'Starting...' : 'Start Monitoring'}
      </button>
    </div>
  );
}
